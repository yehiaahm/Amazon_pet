-- brands.name was globally unique in the JPA entity, but findOrCreate is tenant-scoped.
-- Align DB with tenant-scoped uniqueness: (tenant_id, name).

ALTER TABLE brands ADD CONSTRAINT uk_brands_tenant_name UNIQUE (tenant_id, name);
