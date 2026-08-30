package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Enforce NOT NULL + uniqueness after V16 backfill and V17 catalog merge.
 *
 * The legacy single-column UNIQUE this used to find-and-drop from
 * `products.sku` no longer exists: V1__Schema_Init.sql now creates that
 * column without an inline UNIQUE, so there is nothing left to clean up here.
 *
 * Java migration (not plain .sql) because "ADD CONSTRAINT IF NOT EXISTS" is
 * not valid MySQL syntax — see ConditionalDdl.
 */
public class V18__Catalog_Sku_Unique_Constraints extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE product_variants MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL");
            st.execute("ALTER TABLE product_variants MODIFY COLUMN sku VARCHAR(50) NOT NULL");
        }

        ConditionalDdl.addConstraintIfMissing(conn, "products", "CONSTRAINT uk_products_tenant_sku UNIQUE (tenant_id, sku)");
        ConditionalDdl.addConstraintIfMissing(conn, "product_variants", "CONSTRAINT uk_product_variants_product UNIQUE (product_id)");
        ConditionalDdl.addConstraintIfMissing(conn, "product_variants", "CONSTRAINT uk_product_variants_tenant_sku UNIQUE (tenant_id, sku)");
    }
}
