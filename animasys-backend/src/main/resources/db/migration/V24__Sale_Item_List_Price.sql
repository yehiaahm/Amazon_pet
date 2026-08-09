-- Entire migration is MySQL-only (see V18 for why): the ADD COLUMN,
-- backfill UPDATE, and final NOT NULL are wrapped together so H2 skips all
-- three consistently instead of running the UPDATE against a column that
-- was never added.
/*!
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items' AND COLUMN_NAME = 'list_price');
SET @sql := IF(@col = 0, 'ALTER TABLE sale_items ADD COLUMN list_price DECIMAL(10, 2) NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE sale_items SET list_price = price WHERE list_price IS NULL;

SET @sql := 'ALTER TABLE sale_items MODIFY COLUMN list_price DECIMAL(10, 2) NOT NULL';
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
*/
