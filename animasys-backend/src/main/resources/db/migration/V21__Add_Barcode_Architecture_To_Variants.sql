-- Barcode architecture (idempotent for MySQL desktop upgrades where columns may
-- already exist from CatalogMigrationLifecycle pre-create at V17).

CREATE TABLE IF NOT EXISTS barcode_sequences (
    tenant_id VARCHAR(100) NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 1000000,
    PRIMARY KEY (tenant_id)
);

CREATE TABLE IF NOT EXISTS tenant_barcode_settings (
    tenant_id VARCHAR(100) NOT NULL,
    auto_generate_barcode BOOLEAN NOT NULL DEFAULT TRUE,
    default_barcode_format VARCHAR(50) NOT NULL DEFAULT 'CODE_128',
    default_label_size VARCHAR(50) NOT NULL DEFAULT '50x25',
    include_price BOOLEAN NOT NULL DEFAULT TRUE,
    include_name BOOLEAN NOT NULL DEFAULT TRUE,
    include_sku BOOLEAN NOT NULL DEFAULT TRUE,
    default_template_style VARCHAR(50) NOT NULL DEFAULT 'PET_SHOP_SMALL',
    PRIMARY KEY (tenant_id)
);

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode VARCHAR(255) DEFAULT NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode_format VARCHAR(50) DEFAULT NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS generated_by_employee_id VARCHAR(100) DEFAULT NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode_source VARCHAR(50) DEFAULT NULL;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode_status VARCHAR(50) DEFAULT 'ACTIVE';

ALTER TABLE product_variants ADD CONSTRAINT uk_product_variants_tenant_barcode UNIQUE (tenant_id, barcode);
ALTER TABLE product_variants ADD CONSTRAINT fk_variants_generated_by_employee FOREIGN KEY (generated_by_employee_id) REFERENCES employees(id);

CREATE TABLE IF NOT EXISTS variant_barcode_history (
    id VARCHAR(100) NOT NULL,
    product_variant_id VARCHAR(100) NOT NULL,
    old_barcode VARCHAR(255) NULL,
    new_barcode VARCHAR(255) NOT NULL,
    barcode_format VARCHAR(50) NOT NULL,
    barcode_source VARCHAR(50) NOT NULL,
    status_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    reason VARCHAR(255) NULL,
    generated_by_employee_id VARCHAR(100) NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_barcode_history_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_barcode_history_employee FOREIGN KEY (generated_by_employee_id) REFERENCES employees(id)
);
