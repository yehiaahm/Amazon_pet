package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Java migration (not plain .sql) because "ADD COLUMN IF NOT EXISTS" is not
 * valid MySQL syntax — see ConditionalDdl.
 */
public class V25__Product_Wholesale_Reorder extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        ConditionalDdl.addColumnIfMissing(context.getConnection(), "products", "reorder_level", "INT NOT NULL DEFAULT 0");
        ConditionalDdl.addColumnIfMissing(context.getConnection(), "product_variants", "wholesale_price", "DECIMAL(10, 2) NULL");
    }
}
