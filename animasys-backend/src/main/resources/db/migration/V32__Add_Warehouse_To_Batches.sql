-- Previously wrapped in MySQL-only "/*! ... */" (silent no-op on H2), which
-- is exactly why V40 later had to unconditionally re-run the backfill UPDATE
-- below for any database where this guarded block never actually executed.
-- Rewritten to plain portable DDL that both engines run for real.
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(255);

UPDATE inventory_batches SET warehouse_id = 'wh-shelf' WHERE warehouse_id IS NULL;

ALTER TABLE inventory_batches MODIFY COLUMN warehouse_id VARCHAR(255) NOT NULL;

ALTER TABLE inventory_batches ADD CONSTRAINT IF NOT EXISTS fk_inventory_batches_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
