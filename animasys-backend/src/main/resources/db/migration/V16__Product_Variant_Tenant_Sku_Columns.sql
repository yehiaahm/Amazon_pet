-- Previously a placeholder ("Moved to Java CatalogMigrationLifecycle for H2
-- compatibility" — see CatalogMigrationLifecycle.ensureFutureColumnsForJpaCompatibility).
-- That Java-side patch only runs when upgrading an EXISTING pre-V17 database
-- (Flyway currentVersion == 17, mid-upgrade); a genuinely fresh install skips
-- straight to flyway.migrate() and never gets tenant_id/sku added at all,
-- so V18's later "MODIFY COLUMN tenant_id/sku" always failed on a fresh
-- database, on any engine — not something specific to H2. This migration now
-- does its own real job so a fresh install is self-sufficient; the Java
-- lifecycle patch is unaffected and keeps handling the upgrade-from-old-MySQL
-- case exactly as before (this file already ran there as a no-op).
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sku VARCHAR(50) NULL;

UPDATE product_variants pv
SET tenant_id = (SELECT p.tenant_id FROM products p WHERE p.id = pv.product_id),
    sku = (SELECT p.sku FROM products p WHERE p.id = pv.product_id)
WHERE pv.tenant_id IS NULL OR pv.sku IS NULL;
