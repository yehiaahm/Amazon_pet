-- V23: Add internal notes column to customers table
-- Private staff remarks shown at POS when the customer is selected.

SET @col_notes := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customers'
      AND COLUMN_NAME = 'notes'
);
SET @sql_notes := IF(
    @col_notes = 0,
    'ALTER TABLE customers ADD COLUMN notes TEXT NULL',
    'SELECT 1'
);
PREPARE stmt_notes FROM @sql_notes;
EXECUTE stmt_notes;
DEALLOCATE PREPARE stmt_notes;
