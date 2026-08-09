-- Entire migration is MySQL-only (see V18 for why): wrapped together so H2
-- skips the ADD COLUMN, backfill UPDATE, and NOT NULL/FK steps consistently
-- instead of running the UPDATE against a column that was never added.
/*!
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_batches' AND COLUMN_NAME = 'warehouse_id');
SET @sql := IF(@col = 0, 'ALTER TABLE inventory_batches ADD COLUMN warehouse_id VARCHAR(255)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE inventory_batches SET warehouse_id = 'wh-shelf' WHERE warehouse_id IS NULL;

SET @sql := 'ALTER TABLE inventory_batches MODIFY warehouse_id VARCHAR(255) NOT NULL';
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_batches' AND CONSTRAINT_NAME = 'fk_inventory_batches_warehouse');
SET @sql := IF(@fk = 0, 'ALTER TABLE inventory_batches ADD CONSTRAINT fk_inventory_batches_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
*/
