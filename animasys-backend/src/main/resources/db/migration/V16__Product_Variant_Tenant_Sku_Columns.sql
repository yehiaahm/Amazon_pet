-- Denormalize tenant + SKU on product_variants for (tenant_id, sku) uniqueness.
-- MySQL 8 does not support ADD COLUMN IF NOT EXISTS — use information_schema guards.

SET @col_tenant := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'tenant_id'
);
SET @sql_tenant := IF(
    @col_tenant = 0,
    'ALTER TABLE product_variants ADD COLUMN tenant_id VARCHAR(36) NULL',
    'SELECT 1'
);
PREPARE stmt_tenant FROM @sql_tenant;
EXECUTE stmt_tenant;
DEALLOCATE PREPARE stmt_tenant;

SET @col_sku := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'sku'
);
SET @sql_sku := IF(
    @col_sku = 0,
    'ALTER TABLE product_variants ADD COLUMN sku VARCHAR(50) NULL',
    'SELECT 1'
);
PREPARE stmt_sku FROM @sql_sku;
EXECUTE stmt_sku;
DEALLOCATE PREPARE stmt_sku;

UPDATE product_variants pv
SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = pv.product_id),
    sku = (SELECT p.sku FROM products p WHERE p.id = pv.product_id)
WHERE pv.tenant_id IS NULL OR pv.sku IS NULL;
