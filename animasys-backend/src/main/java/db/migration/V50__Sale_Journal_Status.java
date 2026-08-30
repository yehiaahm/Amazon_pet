package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Tracks whether the accounting journal(s) for a completed sale have
 * actually been posted (journal_status: PENDING / POSTED / FAILED — see
 * journal_failure_reason). Backfill marks a sale POSTED only where its
 * exact revenue journal already exists; everything else defaults to
 * PENDING so JournalPostingExecutor's reconciliation sweep picks it up.
 *
 * Java migration (not plain .sql) because "ADD COLUMN IF NOT EXISTS" is not
 * valid MySQL syntax — see ConditionalDdl.
 */
public class V50__Sale_Journal_Status extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        ConditionalDdl.addColumnIfMissing(conn, "sales", "journal_status", "VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
        ConditionalDdl.addColumnIfMissing(conn, "sales", "journal_failure_reason", "VARCHAR(1000) NULL");

        try (Statement st = conn.createStatement()) {
            st.execute("""
                    UPDATE sales s
                    SET journal_status = 'POSTED'
                    WHERE s.status = 'COMPLETED'
                      AND EXISTS (
                        SELECT 1 FROM journals j
                        WHERE j.description = CONCAT('Customer POS checkout invoice: ', s.sale_number)
                      )
                    """);
            st.execute("CREATE INDEX idx_sales_journal_status ON sales(journal_status)");
        }
    }
}
