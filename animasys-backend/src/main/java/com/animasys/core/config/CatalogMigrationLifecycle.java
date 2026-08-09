package com.animasys.core.config;

import com.animasys.modules.inventory.service.ProductVariantDuplicateMergeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationInfoService;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationInitializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Ensures duplicate SKU merge runs after schema V16–V17 and before unique constraints in V18 when upgrading from older versions.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class CatalogMigrationLifecycle {

    /**
     * Desktop installs legitimately edit already-applied SQL scripts across upgrades
     * (see migrateWithChecksumRepair), so checksum-mismatch auto-repair defaults to
     * on. Shared/server deployments where schema history should never be silently
     * rewritten can disable this via MIGRATION_AUTO_REPAIR=false.
     */
    @Value("${app.migration.auto-repair-checksum-mismatch:true}")
    private boolean autoRepairChecksumMismatch;

    @Bean
    @Primary
    FlywayMigrationInitializer catalogFlywayMigrationInitializer(Flyway flyway) {
        return new FlywayMigrationInitializer(flyway, f -> migrateWithChecksumRepair(f));
    }

    @Bean
    org.springframework.beans.factory.SmartInitializingSingleton catalogMergeAndFinishFlyway(
            Flyway flyway,
            ProductVariantDuplicateMergeService duplicateMergeService,
            JdbcTemplate jdbcTemplate
    ) {
        return () -> {
            MigrationInfo current = flyway.info().current();
            int currentVersion = current == null || current.getVersion() == null
                    ? 0
                    : parseVersion(current.getVersion().getVersion());

            if (currentVersion != 17) {
                return;
            }
            log.info("Running catalog SKU merge before applying V18 constraints");
            // JPA mappings include columns added in later versions (e.g. V21, V25, V27, V29).
            // Ensure they exist before merge queries run at V17 to prevent JPA crashes.
            ensureFutureColumnsForJpaCompatibility(jdbcTemplate);

            var report = duplicateMergeService.mergeAllTenants();
            if (!report.isDatabaseClean()) {
                throw new IllegalStateException(
                        "Cannot apply catalog uniqueness: duplicate SKU groups remain: "
                                + report.getDuplicateSkuGroupsRemaining());
            }
            Flyway.configure()
                    .configuration(flyway.getConfiguration())
                    .target("18")
                    .load()
                    .migrate();
            flyway.migrate();
            log.info("Flyway continued through V18+ after catalog merge");
        };
    }

    /**
     * Desktop upgrades often edit already-applied SQL scripts; Flyway then fails checksum
     * validation. Repair realigns history, then continue the catalog-aware migrate path.
     */
    private void migrateWithChecksumRepair(Flyway flyway) {
        try {
            runCatalogAwareMigrate(flyway);
        } catch (FlywayValidateException ex) {
            if (!autoRepairChecksumMismatch) {
                log.error("Flyway checksum/validation mismatch and app.migration.auto-repair-checksum-mismatch=false — " +
                        "refusing to start with unverified schema history: {}", ex.getMessage());
                throw ex;
            }
            log.warn("Flyway checksum/validation mismatch — repairing schema history then retrying: {}", ex.getMessage());
            flyway.repair();
            runCatalogAwareMigrate(flyway);
        }
        // Deliberately NOT catching the broader FlywayException here: that also covers
        // genuine failed-migration rows from a partial/broken upgrade, and blindly
        // repairing+retrying those can silently re-run a non-idempotent script against
        // a half-applied schema. Those must fail startup loudly for an operator to inspect.
    }

    private void runCatalogAwareMigrate(Flyway flyway) {
        MigrationInfoService info = flyway.info();
        MigrationInfo current = info.current();
        int currentVersion = current == null || current.getVersion() == null
                ? 0
                : parseVersion(current.getVersion().getVersion());

        // Skip pausing at V17 for fresh databases (currentVersion == 0)
        if (currentVersion > 0 && currentVersion < 17) {
            Flyway.configure()
                    .configuration(flyway.getConfiguration())
                    .target("17")
                    .load()
                    .migrate();
            log.info("Flyway paused at V17 for catalog SKU merge before V18 constraints");
            return;
        }
        if (currentVersion == 17) {
            log.info("Flyway at V17 — waiting for catalog merge before V18");
            return;
        }
        flyway.migrate();
    }

    private void ensureFutureColumnsForJpaCompatibility(JdbcTemplate jdbc) {
        // V16 & V21 ProductVariant columns
        addColumnIfMissing(jdbc, "product_variants", "tenant_id", "VARCHAR(36) NULL");
        addColumnIfMissing(jdbc, "product_variants", "sku", "VARCHAR(50) NULL");

        jdbc.execute("UPDATE product_variants pv " +
                     "SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = pv.product_id), " +
                     "    sku = (SELECT p.sku FROM products p WHERE p.id = pv.product_id) " +
                     "WHERE pv.tenant_id IS NULL OR pv.sku IS NULL");

        addColumnIfMissing(jdbc, "product_variants", "barcode", "VARCHAR(255) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_format", "VARCHAR(50) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_generated", "BOOLEAN DEFAULT FALSE");
        addColumnIfMissing(jdbc, "product_variants", "barcode_generated_at", "TIMESTAMP NULL");
        addColumnIfMissing(jdbc, "product_variants", "generated_by_employee_id", "VARCHAR(100) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_source", "VARCHAR(50) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_status", "VARCHAR(50) DEFAULT 'ACTIVE'");

        // V18 constraints
        addConstraintIfMissing(jdbc, "products", "CONSTRAINT uk_products_tenant_sku UNIQUE (tenant_id, sku)");
        addConstraintIfMissing(jdbc, "product_variants", "CONSTRAINT uk_product_variants_product UNIQUE (product_id)");
        addConstraintIfMissing(jdbc, "product_variants", "CONSTRAINT uk_product_variants_tenant_sku UNIQUE (tenant_id, sku)");

        // V21 constraints
        addConstraintIfMissing(jdbc, "product_variants", "CONSTRAINT uk_product_variants_tenant_barcode UNIQUE (tenant_id, barcode)");
        addConstraintIfMissing(jdbc, "product_variants", "CONSTRAINT fk_variants_generated_by_employee FOREIGN KEY (generated_by_employee_id) REFERENCES employees(id)");

        // V23 Customer columns
        addColumnIfMissing(jdbc, "customers", "notes", "TEXT NULL");

        // V24 SaleItem columns
        addColumnIfMissing(jdbc, "sale_items", "list_price", "DECIMAL(10, 2) NULL");

        // V25 Product & ProductVariant columns
        addColumnIfMissing(jdbc, "products", "reorder_level", "INT NOT NULL DEFAULT 0");
        addColumnIfMissing(jdbc, "product_variants", "wholesale_price", "DECIMAL(10, 2) NULL");

        // V27 Product columns
        addColumnIfMissing(jdbc, "products", "brand_id", "VARCHAR(36) NULL");
        addColumnIfMissing(jdbc, "products", "supplier_id", "VARCHAR(36) NULL");

        // V29 InventoryBatch columns
        addColumnIfMissing(jdbc, "inventory_batches", "warehouse_id", "VARCHAR(255) NULL");
    }

    private void addColumnIfMissing(JdbcTemplate jdbcTemplate, String tableName, String columnName, String columnDefinition) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + columnDefinition);
            log.info("Added missing column {}.{} for JPA compatibility", tableName, columnName);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            String causeMsg = e.getCause() != null && e.getCause().getMessage() != null ? e.getCause().getMessage().toLowerCase() : "";
            if (msg.contains("duplicate") || causeMsg.contains("duplicate") || msg.contains("already exists") || causeMsg.contains("already exists")) {
                log.debug("Column {}.{} already exists", tableName, columnName);
            } else {
                log.warn("Failed to add column {}.{}: {}", tableName, columnName, msg);
            }
        }
    }

    private void addConstraintIfMissing(JdbcTemplate jdbcTemplate, String tableName, String constraintDefinition) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + tableName + " ADD " + constraintDefinition);
            log.info("Added missing constraint to {} for JPA compatibility", tableName);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            String causeMsg = e.getCause() != null && e.getCause().getMessage() != null ? e.getCause().getMessage().toLowerCase() : "";
            if (msg.contains("duplicate") || causeMsg.contains("duplicate") || msg.contains("already exists") || causeMsg.contains("already exists")) {
                log.debug("Constraint on {} already exists", tableName);
            } else {
                log.warn("Failed to add constraint on {}: {}", tableName, msg);
            }
        }
    }

    private static int parseVersion(String version) {
        try {
            return Integer.parseInt(version.split("\\.")[0]);
        } catch (Exception ex) {
            return 0;
        }
    }
}
