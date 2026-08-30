package com.animasys.modules.core;

import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
public class FlywayMigrationTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("Database should migrate cleanly and specific columns should exist")
    void testFlywayMigrationsSucceed() {
        assertNotNull(jdbcTemplate);
        
        // Verify V33 migration: cash_expenses_total exists on daily_closings
        Integer countV33 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_NAME = 'daily_closings' AND COLUMN_NAME = 'cash_expenses_total'", 
                Integer.class);
        assertTrue(countV33 != null && countV33 > 0, "Migration V33 failed: cash_expenses_total column is missing");

        // Verify V32 migration: warehouse_id exists on inventory_batches
        Integer countV32 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_NAME = 'inventory_batches' AND COLUMN_NAME = 'warehouse_id'",
                Integer.class);
        assertTrue(countV32 != null && countV32 > 0, "Migration V32 failed: warehouse_id column is missing");

        // Verify V37 migration: sales breakdown columns exist on daily_closings
        // (DailyClosing entity maps these fields; POSSessionService.closeSession populates
        // them on every shift close, and Finance/Dashboard read them via GET /v1/daily-closings)
        String[] v37Columns = {
                "cash_sales_total", "card_sales_total", "instapay_sales_total",
                "vodafone_sales_total", "total_sales"
        };
        for (String column : v37Columns) {
            Integer countV37 = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_NAME = 'daily_closings' AND COLUMN_NAME = ?",
                    Integer.class, column);
            assertTrue(countV37 != null && countV37 > 0, "Migration V37 failed: " + column + " column is missing");
        }
    }
}
