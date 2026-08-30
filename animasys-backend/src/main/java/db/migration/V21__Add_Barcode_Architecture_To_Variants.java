package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Barcode architecture. Idempotent for MySQL desktop upgrades where the
 * product_variants columns may already exist (added early by
 * CatalogMigrationLifecycle.ensureFutureColumnsForJpaCompatibility at the
 * V17 pause, before Flyway formally reaches this version).
 *
 * Java migration (not plain .sql) because "ADD COLUMN/CONSTRAINT IF NOT
 * EXISTS" is not valid MySQL syntax — see ConditionalDdl. CREATE TABLE IF
 * NOT EXISTS is standard, portable MySQL and stays as plain SQL.
 */
public class V21__Add_Barcode_Architecture_To_Variants extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();

        try (Statement st = conn.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS barcode_sequences (
                        tenant_id VARCHAR(100) NOT NULL,
                        last_number BIGINT NOT NULL DEFAULT 1000000,
                        PRIMARY KEY (tenant_id)
                    )
                    """);

            st.execute("""
                    CREATE TABLE IF NOT EXISTS tenant_barcode_settings (
                        tenant_id VARCHAR(100) NOT NULL,
                        auto_generate_barcode BOOLEAN NOT NULL DEFAULT TRUE,
                        default_barcode_format VARCHAR(50) NOT NULL DEFAULT 'CODE_128',
                        default_label_size VARCHAR(50) NOT NULL DEFAULT '50x25',
                        include_price BOOLEAN NOT NULL DEFAULT TRUE,
                        include_name BOOLEAN NOT NULL DEFAULT TRUE,
                        include_sku BOOLEAN NOT NULL DEFAULT TRUE,
                        default_template_style VARCHAR(50) NOT NULL DEFAULT 'PET_SHOP_SMALL',
                        PRIMARY KEY (tenant_id)
                    )
                    """);
        }

        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode", "VARCHAR(255) DEFAULT NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode_format", "VARCHAR(50) DEFAULT NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode_generated", "BOOLEAN DEFAULT FALSE");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode_generated_at", "TIMESTAMP NULL DEFAULT NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "generated_by_employee_id", "VARCHAR(100) DEFAULT NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode_source", "VARCHAR(50) DEFAULT NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "barcode_status", "VARCHAR(50) DEFAULT 'ACTIVE'");

        ConditionalDdl.addConstraintIfMissing(conn, "product_variants", "CONSTRAINT uk_product_variants_tenant_barcode UNIQUE (tenant_id, barcode)");
        ConditionalDdl.addConstraintIfMissing(conn, "product_variants", "CONSTRAINT fk_variants_generated_by_employee FOREIGN KEY (generated_by_employee_id) REFERENCES employees(id)");

        try (Statement st = conn.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS variant_barcode_history (
                        id VARCHAR(100) NOT NULL,
                        product_variant_id VARCHAR(100) NOT NULL,
                        old_barcode VARCHAR(255) NULL,
                        new_barcode VARCHAR(255) NOT NULL,
                        barcode_format VARCHAR(50) NOT NULL,
                        barcode_source VARCHAR(50) NOT NULL,
                        status_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
                        reason VARCHAR(255) NULL,
                        generated_by_employee_id VARCHAR(100) NOT NULL,
                        generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (id),
                        CONSTRAINT fk_barcode_history_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
                        CONSTRAINT fk_barcode_history_employee FOREIGN KEY (generated_by_employee_id) REFERENCES employees(id)
                    )
                    """);
        }
    }
}
