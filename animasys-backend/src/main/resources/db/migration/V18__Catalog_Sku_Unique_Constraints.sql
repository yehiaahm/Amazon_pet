-- Enforce NOT NULL + uniqueness after V16 backfill and V17 catalog merge.
-- Keep migration SQL compatible with both MySQL and H2 test profile.

ALTER TABLE product_variants MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE product_variants MODIFY COLUMN sku VARCHAR(50) NOT NULL;

ALTER TABLE products ADD CONSTRAINT uk_products_tenant_sku UNIQUE (tenant_id, sku);
ALTER TABLE product_variants ADD CONSTRAINT uk_product_variants_product UNIQUE (product_id);
ALTER TABLE product_variants ADD CONSTRAINT uk_product_variants_tenant_sku UNIQUE (tenant_id, sku);
