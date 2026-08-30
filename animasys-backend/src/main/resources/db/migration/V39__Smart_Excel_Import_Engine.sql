-- Smart Excel/CSV product import engine (server-side parsing, session-based workflow)

CREATE TABLE import_sessions (
    id                  VARCHAR(50)  PRIMARY KEY,
    tenant_id           VARCHAR(50)  NOT NULL,
    uploaded_by         VARCHAR(50)  NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    file_size           BIGINT       NOT NULL,
    file_type           VARCHAR(10)  NOT NULL, -- XLSX, CSV
    status               VARCHAR(30) NOT NULL, -- PENDING_MAPPING, MAPPED, COMMITTING, COMPLETED, FAILED, CANCELLED
    column_headers       TEXT,                 -- JSON array of detected raw headers, in order
    column_mapping       TEXT,                 -- JSON object: header -> ImportField code (confirmed mapping)
    duplicate_strategy_default VARCHAR(20) NOT NULL DEFAULT 'SKIP', -- SKIP, UPDATE_EXISTING, CREATE_NEW
    total_rows           INT NOT NULL DEFAULT 0,
    new_rows             INT NOT NULL DEFAULT 0,
    update_rows          INT NOT NULL DEFAULT 0,
    duplicate_rows        INT NOT NULL DEFAULT 0,
    error_rows            INT NOT NULL DEFAULT 0,
    imported_count        INT NOT NULL DEFAULT 0,
    updated_count          INT NOT NULL DEFAULT 0,
    skipped_count          INT NOT NULL DEFAULT 0,
    failed_count            INT NOT NULL DEFAULT 0,
    execution_time_ms       BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at            TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE import_session_items (
    id                  VARCHAR(50)  PRIMARY KEY,
    session_id          VARCHAR(50)  NOT NULL,
    `row_number`        INT          NOT NULL,
    raw_data             TEXT        NOT NULL, -- JSON object: raw header -> raw cell text
    mapped_data          TEXT,                 -- JSON object: ImportField code -> normalized value
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, NEW, UPDATE, DUPLICATE, ERROR, IMPORTED, UPDATED, SKIPPED, FAILED
    duplicate_match_type  VARCHAR(20), -- SKU, BARCODE, NAME_VARIANT
    duplicate_product_id  VARCHAR(50),
    resolution            VARCHAR(20), -- UPDATE_EXISTING, SKIP, CREATE_NEW
    validation_errors     TEXT,        -- JSON array of {field, message}
    warnings               TEXT,       -- JSON array of {field, message}
    result_message         VARCHAR(500),
    FOREIGN KEY (session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_import_sessions_tenant ON import_sessions(tenant_id, created_at DESC);
CREATE INDEX idx_import_session_items_session ON import_session_items(session_id, `row_number`);
CREATE INDEX idx_import_session_items_status ON import_session_items(session_id, status);

-- Permission for the new import feature
INSERT INTO permissions (id, code, name, module) VALUES
('perm-products-import', 'products.import', 'Bulk Import Products (Excel/CSV)', 'Products');

-- Grant to existing OWNER/MANAGER roles (PermissionScope.ALL / ALL_EXCEPT_FACTORY_RESET already
-- include every permission row going forward for new tenants; this backfills existing tenants).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, 'perm-products-import'
FROM roles r
WHERE r.code IN ('OWNER', 'MANAGER');
