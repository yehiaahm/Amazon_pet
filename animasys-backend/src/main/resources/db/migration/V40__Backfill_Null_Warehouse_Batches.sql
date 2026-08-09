-- V32's backfill for legacy NULL warehouse_id rows only ran inside a MySQL-only
-- /*! ... */ conditional block. Straggler inventory_batches rows with a NULL
-- warehouse_id are invisible to warehouse-scoped FIFO allocation queries and
-- crash tenant stock reconciliation (InventoryStockSyncService). Re-run the
-- backfill unconditionally so it applies regardless of engine or whether V32's
-- guarded block actually executed on a given database.
UPDATE inventory_batches SET warehouse_id = 'wh-shelf' WHERE warehouse_id IS NULL;
