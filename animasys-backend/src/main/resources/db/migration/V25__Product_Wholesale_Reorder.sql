ALTER TABLE products
    ADD COLUMN reorder_level INT NOT NULL DEFAULT 0;

ALTER TABLE product_variants
    ADD COLUMN wholesale_price DECIMAL(10, 2) NULL;
