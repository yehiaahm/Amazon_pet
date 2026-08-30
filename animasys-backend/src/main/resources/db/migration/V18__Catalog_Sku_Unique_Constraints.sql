-- Enforce NOT NULL + uniqueness after V16 backfill and V17 catalog merge.
--
-- Previously wrapped in MySQL-only "/*! ... */" executable comments, which made
-- this whole migration a silent no-op on H2 (H2 parses "/*! ... */" as a plain
-- SQL comment, unlike MySQL which executes its contents) — meaning a fresh H2
-- database could never actually get these NOT NULL/uniqueness guarantees.
-- Rewritten to plain portable syntax: MODIFY COLUMN and ADD CONSTRAINT IF NOT
-- EXISTS both run for real on MySQL 8.0.29+ and on H2 2.x's MODE=MySQL
-- (verified against H2 2.2.224).
--
-- The legacy single-column UNIQUE this used to find-and-drop from
-- `products.sku` no longer exists: V1__Schema_Init.sql now creates that
-- column without an inline UNIQUE, so there is nothing left to clean up here.

ALTER TABLE product_variants MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL;
ALTER TABLE product_variants MODIFY COLUMN sku VARCHAR(50) NOT NULL;

ALTER TABLE products ADD CONSTRAINT IF NOT EXISTS uk_products_tenant_sku UNIQUE (tenant_id, sku);
ALTER TABLE product_variants ADD CONSTRAINT IF NOT EXISTS uk_product_variants_product UNIQUE (product_id);
ALTER TABLE product_variants ADD CONSTRAINT IF NOT EXISTS uk_product_variants_tenant_sku UNIQUE (tenant_id, sku);
