package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Add internal notes column to customers table — private staff remarks
 * shown at POS when the customer is selected.
 *
 * Java migration (not plain .sql) because "ADD COLUMN IF NOT EXISTS" is not
 * valid MySQL syntax — see ConditionalDdl.
 */
public class V23__Add_Customer_Notes extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        ConditionalDdl.addColumnIfMissing(context.getConnection(), "customers", "notes", "TEXT NULL");
    }
}
