-- Previously wrapped in MySQL-only "/*! ... */" (silent no-op on H2), which
-- meant a fresh H2 database never got this column at all. Rewritten to plain
-- portable DDL — safe to run unconditionally since ADD COLUMN IF NOT EXISTS
-- makes it idempotent and the UPDATE only touches rows still NULL.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS list_price DECIMAL(10, 2) NULL;

UPDATE sale_items SET list_price = price WHERE list_price IS NULL;

ALTER TABLE sale_items MODIFY COLUMN list_price DECIMAL(10, 2) NOT NULL;
