package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Java migration (not plain .sql) because "ADD COLUMN/CONSTRAINT IF NOT
 * EXISTS" is not valid MySQL syntax — see ConditionalDdl.
 */
public class V32__Add_Warehouse_To_Batches extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        ConditionalDdl.addColumnIfMissing(conn, "inventory_batches", "warehouse_id", "VARCHAR(255)");

        try (Statement st = conn.createStatement()) {
            st.execute("UPDATE inventory_batches SET warehouse_id = 'wh-shelf' WHERE warehouse_id IS NULL");
            st.execute("ALTER TABLE inventory_batches MODIFY COLUMN warehouse_id VARCHAR(255) NOT NULL");
        }

        ConditionalDdl.addConstraintIfMissing(conn, "inventory_batches",
                "CONSTRAINT fk_inventory_batches_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)");
    }
}
