package com.animasys.core.config.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Idempotent ALTER TABLE helpers for Flyway Java migrations.
 *
 * MySQL (unlike MariaDB) does not support "ADD COLUMN IF NOT EXISTS" /
 * "ADD CONSTRAINT IF NOT EXISTS" — it's a hard syntax error (1064) on real
 * MySQL, even though H2's MODE=MySQL accepts it leniently. That gap is what
 * broke V16 in production (confirmed via the actual JDBC exception), so
 * idempotent column/constraint adds are done here in Java against
 * INFORMATION_SCHEMA instead, which behaves identically on both engines.
 */
public final class ConditionalDdl {

    private ConditionalDdl() {
    }

    public static void addColumnIfMissing(Connection conn, String table, String column, String definition) throws SQLException {
        if (columnExists(conn, table, column)) {
            return;
        }
        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        }
    }

    public static boolean columnExists(Connection conn, String table, String column) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                        "WHERE UPPER(TABLE_SCHEMA) = UPPER(SCHEMA()) AND TABLE_NAME = ? AND COLUMN_NAME = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1) > 0;
            }
        }
    }

    /**
     * Matches on message text rather than a portable existence pre-check because
     * constraint metadata (CONSTRAINT_TYPE, index-backed uniques, FK names) isn't
     * uniform enough across MySQL/H2's INFORMATION_SCHEMA to check cleanly up front.
     */
    public static void addConstraintIfMissing(Connection conn, String table, String constraintDefinition) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE " + table + " ADD " + constraintDefinition);
        } catch (SQLException e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            if (msg.contains("duplicate") || msg.contains("already exists")) {
                return;
            }
            throw e;
        }
    }
}
