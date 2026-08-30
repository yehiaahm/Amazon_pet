package db.migration;

import com.animasys.core.config.migration.ConditionalDdl;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Enforce customer phone uniqueness per tenant at the database level.
 *
 * Previously the only protection against duplicate customers was an
 * application-level check-then-insert in CustomerService.createCustomer.
 * Under concurrent requests with the same phone number, two requests can
 * both pass the check before either has committed its insert (confirmed:
 * 15 concurrent registrations -> 2 rows).
 *
 * We do NOT touch the existing `phone` column or delete/alter any customer
 * row to fix this. Instead we add `phone_dedupe_key`, kept equal to the
 * normalized phone value by the application on every insert/update, and put
 * the UNIQUE constraint on (tenant_id, phone_dedupe_key). MySQL/H2 unique
 * indexes treat NULL as distinct from every other NULL, so customers
 * without a phone number are never blocked by each other.
 *
 * For any pre-existing duplicate (tenant_id, phone) group, exactly one row
 * (the earliest by id) keeps its dedupe key; every other row's is cleared to
 * NULL — no customer record, name, phone, or history is deleted or modified.
 *
 * Java migration (not plain .sql) because "ADD COLUMN/CONSTRAINT IF NOT
 * EXISTS" is not valid MySQL syntax — see ConditionalDdl.
 */
public class V49__Customer_Phone_Uniqueness extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        ConditionalDdl.addColumnIfMissing(conn, "customers", "phone_dedupe_key", "VARCHAR(30) NULL");

        try (Statement st = conn.createStatement()) {
            st.execute("""
                    UPDATE customers
                    SET phone_dedupe_key = phone
                    WHERE phone IS NOT NULL AND phone <> ''
                    """);

            st.execute("""
                    UPDATE customers
                    SET phone_dedupe_key = NULL
                    WHERE id IN (
                        SELECT id FROM (
                            SELECT c.id AS id
                            FROM customers c
                            JOIN (
                                SELECT tenant_id, phone, MIN(id) AS keeper_id
                                FROM customers
                                WHERE phone IS NOT NULL AND phone <> ''
                                GROUP BY tenant_id, phone
                                HAVING COUNT(*) > 1
                            ) dup_groups ON dup_groups.tenant_id = c.tenant_id AND dup_groups.phone = c.phone
                            WHERE c.id <> dup_groups.keeper_id
                        ) AS non_keepers
                    )
                    """);
        }

        ConditionalDdl.addConstraintIfMissing(conn, "customers", "CONSTRAINT uk_customers_tenant_phone_dedupe UNIQUE (tenant_id, phone_dedupe_key)");
    }
}
