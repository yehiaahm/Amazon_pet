package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Previously a placeholder ("Moved to Java CatalogMigrationLifecycle for H2
 * compatibility" — see CatalogMigrationLifecycle.ensureFutureColumnsForJpaCompatibility).
 * That Java-side patch only runs when upgrading an EXISTING pre-V17 database
 * (Flyway currentVersion == 17, mid-upgrade); a genuinely fresh install skips
 * straight to flyway.migrate() and never gets tenant_id/sku added at all, so
 * V18's later "MODIFY COLUMN tenant_id/sku" always failed on a fresh database.
 * This migration does that real job so a fresh install is self-sufficient.
 *
 * Written as a Java migration (not plain .sql) because "ADD COLUMN IF NOT
 * EXISTS" is not valid MySQL syntax (confirmed via production JDBC error
 * 1064) even though H2's MODE=MySQL silently accepts it — see ConditionalDdl.
 */
public class V16__Product_Variant_Tenant_Sku_Columns extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "tenant_id", "VARCHAR(36) NULL");
        ConditionalDdl.addColumnIfMissing(conn, "product_variants", "sku", "VARCHAR(50) NULL");

        try (Statement st = conn.createStatement()) {
            st.execute(
                    "UPDATE product_variants pv " +
                    "SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = pv.product_id), " +
                    "    sku = (SELECT p.sku FROM products p WHERE p.id = pv.product_id) " +
                    "WHERE pv.tenant_id IS NULL OR pv.sku IS NULL");
        }
    }
}
