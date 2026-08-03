-- Denormalize tenant + SKU on product_variants for (tenant_id, sku) uniqueness.
-- Keep this migration ANSI-compatible so it runs in both MySQL and H2 test profile.

ALTER TABLE product_variants ADD COLUMN tenant_id VARCHAR(36) NULL;
ALTER TABLE product_variants ADD COLUMN sku VARCHAR(50) NULL;

UPDATE product_variants pv
SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = pv.product_id),
    sku = (SELECT p.sku FROM products p WHERE p.id = pv.product_id)
WHERE pv.tenant_id IS NULL OR pv.sku IS NULL;
