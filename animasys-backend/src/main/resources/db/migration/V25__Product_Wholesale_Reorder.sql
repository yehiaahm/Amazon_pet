-- Previously wrapped in MySQL-only "/*! ... */" (silent no-op on H2).
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INT NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2) NULL;
