package com.animasys.core.config;

import com.animasys.modules.inventory.service.ProductVariantDuplicateMergeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationInfoService;
import org.flywaydb.core.api.exception.FlywayValidateException;
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

    @Bean
    @Primary
    FlywayMigrationInitializer catalogFlywayMigrationInitializer(Flyway flyway) {
        return new FlywayMigrationInitializer(flyway, f -> migrateWithChecksumRepair(f));
    }

    @Bean
    @Order(50)
    org.springframework.boot.ApplicationRunner catalogMergeAndFinishFlyway(
            Flyway flyway,
            ProductVariantDuplicateMergeService duplicateMergeService,
            JdbcTemplate jdbcTemplate
    ) {
        return args -> {
            MigrationInfo current = flyway.info().current();
            int currentVersion = current == null || current.getVersion() == null
                    ? 0
                    : parseVersion(current.getVersion().getVersion());

            if (currentVersion != 17) {
                return;
            }
            log.info("Running catalog SKU merge before applying V18 constraints");
            // ProductVariant JPA mapping already includes barcode columns (added in V21).
            // Ensure they exist before merge queries run at V17.
            ensureProductVariantBarcodeColumns(jdbcTemplate);

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
            log.warn("Flyway checksum/validation mismatch — repairing schema history then retrying: {}", ex.getMessage());
            flyway.repair();
            runCatalogAwareMigrate(flyway);
        } catch (FlywayException ex) {
            // Covers checksum drift and failed migration rows left after a partial desktop upgrade
            log.warn("Flyway migration error — repairing schema history then retrying once: {}", ex.getMessage());
            flyway.repair();
            runCatalogAwareMigrate(flyway);
        }
    }

    private void runCatalogAwareMigrate(Flyway flyway) {
        MigrationInfoService info = flyway.info();
        MigrationInfo current = info.current();
        int currentVersion = current == null || current.getVersion() == null
                ? 0
                : parseVersion(current.getVersion().getVersion());

        if (currentVersion < 17) {
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

    private void ensureProductVariantBarcodeColumns(JdbcTemplate jdbc) {
        addColumnIfMissing(jdbc, "product_variants", "barcode", "VARCHAR(255) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_format", "VARCHAR(50) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_generated", "BOOLEAN DEFAULT FALSE");
        addColumnIfMissing(jdbc, "product_variants", "barcode_generated_at", "TIMESTAMP NULL");
        addColumnIfMissing(jdbc, "product_variants", "generated_by_employee_id", "VARCHAR(100) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_source", "VARCHAR(50) NULL");
        addColumnIfMissing(jdbc, "product_variants", "barcode_status", "VARCHAR(50) DEFAULT 'ACTIVE'");
    }

    private void addColumnIfMissing(JdbcTemplate jdbc, String table, String column, String definition) {
        Integer count = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """,
                Integer.class,
                table,
                column
        );
        if (count != null && count > 0) {
            return;
        }
        log.info("Pre-creating {}.{} for catalog merge compatibility", table, column);
        jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
    }

    private static int parseVersion(String version) {
        try {
            return Integer.parseInt(version.split("\\.")[0]);
        } catch (Exception ex) {
            return 0;
        }
    }
}
