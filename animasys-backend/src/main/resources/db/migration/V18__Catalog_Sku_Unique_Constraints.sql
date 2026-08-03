-- Enforce NOT NULL + uniqueness after V16 backfill and V17 catalog merge.
-- Uses MySQL syntax (MODIFY COLUMN / DROP INDEX) rather than H2/Postgres forms.

ALTER TABLE product_variants MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE product_variants MODIFY COLUMN sku VARCHAR(50) NOT NULL;

-- Drop legacy single-column UNIQUE on products.sku (from V1), whatever MySQL named it
SET @legacy_sku_idx := (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'sku'
      AND NON_UNIQUE = 0
      AND INDEX_NAME <> 'PRIMARY'
      AND INDEX_NAME NOT IN ('uk_products_tenant_sku')
    LIMIT 1
);
SET @drop_legacy := IF(
    @legacy_sku_idx IS NULL,
    'SELECT 1',
    CONCAT('ALTER TABLE products DROP INDEX `', @legacy_sku_idx, '`')
);
PREPARE stmt_drop_legacy FROM @drop_legacy;
EXECUTE stmt_drop_legacy;
DEALLOCATE PREPARE stmt_drop_legacy;

SET @uk_products := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND CONSTRAINT_NAME = 'uk_products_tenant_sku'
);
SET @sql_uk_products := IF(
    @uk_products = 0,
    'ALTER TABLE products ADD CONSTRAINT uk_products_tenant_sku UNIQUE (tenant_id, sku)',
    'SELECT 1'
);
PREPARE stmt_uk_products FROM @sql_uk_products;
EXECUTE stmt_uk_products;
DEALLOCATE PREPARE stmt_uk_products;

SET @uk_pv_product := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_variants'
      AND CONSTRAINT_NAME = 'uk_product_variants_product'
);
SET @sql_uk_pv_product := IF(
    @uk_pv_product = 0,
    'ALTER TABLE product_variants ADD CONSTRAINT uk_product_variants_product UNIQUE (product_id)',
    'SELECT 1'
);
PREPARE stmt_uk_pv_product FROM @sql_uk_pv_product;
EXECUTE stmt_uk_pv_product;
DEALLOCATE PREPARE stmt_uk_pv_product;

SET @uk_pv_sku := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_variants'
      AND CONSTRAINT_NAME = 'uk_product_variants_tenant_sku'
);
SET @sql_uk_pv_sku := IF(
    @uk_pv_sku = 0,
    'ALTER TABLE product_variants ADD CONSTRAINT uk_product_variants_tenant_sku UNIQUE (tenant_id, sku)',
    'SELECT 1'
);
PREPARE stmt_uk_pv_sku FROM @sql_uk_pv_sku;
EXECUTE stmt_uk_pv_sku;
DEALLOCATE PREPARE stmt_uk_pv_sku;
