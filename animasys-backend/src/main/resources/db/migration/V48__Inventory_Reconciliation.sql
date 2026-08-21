-- Inventory Reconciliation / Stock Count via Excel import.
--
-- Adds a second import mode ("INVENTORY_COUNT") alongside the existing default
-- ("ADD_STOCK"). In ADD_STOCK mode the Excel quantity is added on top of current
-- stock (unchanged behavior). In INVENTORY_COUNT mode the Excel quantity is the
-- final counted quantity, and the system computes/persists the adjustment needed
-- to reach it, writing an audit trail row per product via inventory_adjustments.

ALTER TABLE import_sessions ADD COLUMN import_mode VARCHAR(20) NOT NULL DEFAULT 'ADD_STOCK';

ALTER TABLE import_session_items ADD COLUMN resolved_variant_id VARCHAR(50) NULL;
ALTER TABLE import_session_items ADD COLUMN resolved_warehouse_id VARCHAR(50) NULL;
ALTER TABLE import_session_items ADD COLUMN system_quantity INT NULL;
ALTER TABLE import_session_items ADD COLUMN counted_quantity INT NULL;
ALTER TABLE import_session_items ADD COLUMN adjustment_quantity INT NULL;

-- Traceability from an inventory adjustment back to the Excel import that produced it.
ALTER TABLE inventory_adjustments ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE inventory_adjustments ADD COLUMN import_session_id VARCHAR(50) NULL;
ALTER TABLE inventory_adjustments ADD COLUMN import_session_item_id VARCHAR(50) NULL;
ALTER TABLE inventory_adjustments ADD CONSTRAINT fk_ia_import_session FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_inventory_adjustments_import_session ON inventory_adjustments(import_session_id);

-- Save Mapping: lets a tenant reuse a column-header -> system-field mapping across uploads
-- instead of re-picking columns every time, as long as the saved mapping still applies.
CREATE TABLE import_mapping_presets (
    id          VARCHAR(50)  PRIMARY KEY,
    tenant_id   VARCHAR(50)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    import_mode VARCHAR(20)  NOT NULL DEFAULT 'ADD_STOCK',
    mapping     TEXT         NOT NULL, -- JSON object: raw header -> ImportField code
    created_by  VARCHAR(50)  NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT uk_import_mapping_presets_tenant_name UNIQUE (tenant_id, name)
);
