-- 1. Create Brands and Suppliers Tables
CREATE TABLE brands (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE suppliers (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    supplier_code VARCHAR(50) NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 2. Alter products table to link brand_id and supplier_id
ALTER TABLE products ADD COLUMN brand_id VARCHAR(36) NULL;
ALTER TABLE products ADD COLUMN supplier_id VARCHAR(36) NULL;
ALTER TABLE products ADD CONSTRAINT fk_product_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- 3. Create generic import_sessions and import_session_items tables
CREATE TABLE import_sessions (
    id VARCHAR(36) PRIMARY KEY,
    file_name VARCHAR(150) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL, -- SHA256 checksum
    status VARCHAR(20) NOT NULL, -- UPLOADING, PROCESSING, COMPLETED, FAILED, UNDONE
    uploaded_by VARCHAR(36) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duplicate_strategy VARCHAR(20) NOT NULL, -- SKIP, UPDATE, REPLACE
    target_type VARCHAR(50) NOT NULL, -- PRODUCTS, CUSTOMERS, SUPPLIERS
    total_rows INT DEFAULT 0,
    success_rows INT DEFAULT 0,
    warning_rows INT DEFAULT 0,
    error_rows INT DEFAULT 0,
    last_processed_row INT DEFAULT 0,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES employees(id)
);

CREATE TABLE import_session_items (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    `row_number` INT NOT NULL,
    status VARCHAR(20) NOT NULL, -- SUCCESS, WARNING, ERROR
    error_message VARCHAR(255) NULL,
    affected_entity_id VARCHAR(36) NULL, -- Refers to Product/Variant/etc. created or modified
    FOREIGN KEY (session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
);
