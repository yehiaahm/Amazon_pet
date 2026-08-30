package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Java migration (not plain .sql) because "ADD COLUMN IF NOT EXISTS" is not
 * valid MySQL syntax — see ConditionalDdl.
 */
public class V24__Sale_Item_List_Price extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        ConditionalDdl.addColumnIfMissing(conn, "sale_items", "list_price", "DECIMAL(10, 2) NULL");

        try (Statement st = conn.createStatement()) {
            st.execute("UPDATE sale_items SET list_price = price WHERE list_price IS NULL");
            st.execute("ALTER TABLE sale_items MODIFY COLUMN list_price DECIMAL(10, 2) NOT NULL");
        }
    }
}
