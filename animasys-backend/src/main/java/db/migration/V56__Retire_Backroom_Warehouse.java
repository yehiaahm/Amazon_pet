package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * This business runs a single physical stock location, but the app used to auto-provision a
 * second "wh-main" (Backroom Main Store / المخزن الرئيسي) warehouse for every shop. The
 * Inventory "Adjust Stock" screen picked whichever warehouse an unordered query happened to
 * return first, so manually-entered stock could silently land in wh-main while checkout only
 * ever sells from wh-shelf — the POS card would show units "available" that could never
 * actually be sold. DatabaseSeeder/AuthController no longer create wh-main; this migration
 * folds any stock already sitting there back into wh-shelf and retires the row.
 */
public class V56__Retire_Backroom_Warehouse extends BaseJavaMigration {

    private static final Logger log = LoggerFactory.getLogger(V56__Retire_Backroom_Warehouse.class);

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();

        try (Statement st = conn.createStatement()) {
            // Live inventory state — this corrects *where the stock currently is*, it isn't
            // rewriting history, so repointing it to wh-shelf is safe.
            st.execute("UPDATE inventory_batches SET warehouse_id = 'wh-shelf' WHERE warehouse_id = 'wh-main'");
            st.execute("DELETE FROM warehouse_stocks WHERE warehouse_id = 'wh-main'");

            // Audit trail rows: keep every record, just correct the warehouse tag so reports
            // that group by warehouse don't keep a dead "wh-main" bucket around.
            st.execute("UPDATE inventory_ledger_transactions SET warehouse_id = 'wh-shelf' WHERE warehouse_id = 'wh-main'");
            st.execute("UPDATE inventory_adjustments SET warehouse_id = 'wh-shelf' WHERE warehouse_id = 'wh-main'");
            st.execute("UPDATE stock_movements SET warehouse_id = 'wh-shelf' WHERE warehouse_id = 'wh-main'");
        }

        // Best-effort physical removal. stock_transfers.source/target_warehouse_id are
        // ON DELETE RESTRICT on purpose — a past transfer record must keep truthfully naming
        // the two warehouses actually involved, so we never rewrite it. If such history exists
        // for wh-main the delete below fails; in that case just mark the row retired instead of
        // failing the whole deployment over it.
        try (Statement st = conn.createStatement()) {
            st.execute("DELETE FROM warehouses WHERE id = 'wh-main'");
        } catch (SQLException e) {
            log.warn("wh-main still referenced by historical stock-transfer records; " +
                    "keeping the row but marking it retired instead of deleting it: {}", e.getMessage());
            try (Statement st = conn.createStatement()) {
                st.execute("UPDATE warehouses SET name = '(مؤرشف) المخزن الرئيسي - لا يُستخدم' WHERE id = 'wh-main'");
            }
        }
    }
}
