-- Duplicate SKU / variant merge runs at application startup via ProductVariantDuplicateMergeService
-- (Flyway cannot use Spring JPA here without circular dependency on entityManagerFactory).

SELECT 1;
