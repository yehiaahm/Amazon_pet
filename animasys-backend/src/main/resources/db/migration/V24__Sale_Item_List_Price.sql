ALTER TABLE sale_items ADD COLUMN list_price DECIMAL(10, 2) NULL;

UPDATE sale_items SET list_price = price WHERE list_price IS NULL;

ALTER TABLE sale_items MODIFY COLUMN list_price DECIMAL(10, 2) NOT NULL;
