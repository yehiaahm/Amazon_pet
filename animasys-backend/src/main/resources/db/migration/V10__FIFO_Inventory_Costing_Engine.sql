-- Flyway Migration V10: Enterprise FIFO Inventory Costing Engine & Immutable Allocation Ledger

-- 1. Create or enhance Inventory Batches (Cost Layers)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    supplier_id VARCHAR(36) NULL,
    purchase_invoice_id VARCHAR(36) NULL,
    batch_number VARCHAR(100) NOT NULL,
    unit_cost DECIMAL(15, 4) NOT NULL, -- Exact purchase cost per unit
    initial_quantity INT NOT NULL,
    remaining_quantity INT NOT NULL,
    purchase_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, EXHAUSTED, EXPIRED, QUARANTINED
    version INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_ib_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ib_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ib_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_ib_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL
);

-- Index for optimized FIFO retrieval with pessimistic locking
CREATE INDEX idx_batches_fifo_lookup 
ON inventory_batches (tenant_id, product_variant_id, status, purchase_date ASC, id ASC);

-- 2. Sale Item Batch Allocation Ledger (Maps line items to consumed purchase batches)
CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
    id VARCHAR(36) PRIMARY KEY,
    sale_item_id VARCHAR(36) NOT NULL,
    inventory_batch_id VARCHAR(36) NOT NULL,
    quantity_allocated INT NOT NULL,
    unit_cost_at_sale DECIMAL(15, 4) NOT NULL, -- Snapshot unit cost from batch at sale time
    total_allocated_cost DECIMAL(15, 4) NOT NULL, -- quantity_allocated * unit_cost_at_sale
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_siba_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_siba_batch FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
);

CREATE INDEX idx_siba_item ON sale_item_batch_allocations (sale_item_id);
CREATE INDEX idx_siba_batch ON sale_item_batch_allocations (inventory_batch_id);

-- 3. Enhance sale_items with immutable financial snapshot columns (H2 & MySQL compatible)
ALTER TABLE sale_items ADD COLUMN cogs DECIMAL(15, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE sale_items ADD COLUMN gross_profit DECIMAL(15, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE sale_items ADD COLUMN unit_cogs DECIMAL(15, 4) NOT NULL DEFAULT 0.0000;

-- 4. Immutable Inventory Movement & Financial Ledger
CREATE TABLE IF NOT EXISTS inventory_ledger_transactions (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    warehouse_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    inventory_batch_id VARCHAR(36) NULL,
    transaction_type VARCHAR(40) NOT NULL, -- PURCHASE_RECEIPT, SALE_DEDUCTION, CUSTOMER_RETURN, SUPPLIER_RETURN, SHRINKAGE_ADJUSTMENT, EXPIRED_WRITE_OFF, TRANSFER_OUT, TRANSFER_IN
    reference_type VARCHAR(50) NOT NULL, -- SALE_INVOICE, PURCHASE_INVOICE, ADJUSTMENT_DOC, TRANSFER_DOC
    reference_id VARCHAR(36) NOT NULL,
    quantity_change INT NOT NULL, -- Positive for IN, Negative for OUT
    unit_cost DECIMAL(15, 4) NOT NULL,
    total_cost DECIMAL(15, 4) NOT NULL,
    employee_id VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ilt_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ilt_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ilt_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ilt_batch FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_ilt_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX idx_ilt_tenant_variant ON inventory_ledger_transactions (tenant_id, product_variant_id, created_at);
CREATE INDEX idx_ilt_reference ON inventory_ledger_transactions (reference_type, reference_id);

-- 5. Inventory Adjustments & Audit Tables
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    warehouse_id VARCHAR(36) NOT NULL,
    adjustment_number VARCHAR(50) NOT NULL UNIQUE,
    reason VARCHAR(50) NOT NULL, -- SHRINKAGE, DAMAGED, EXPIRED, COUNT_DISCREPANCY, FOUND
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    requested_by_id VARCHAR(36) NOT NULL,
    approved_by_id VARCHAR(36) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    CONSTRAINT fk_ia_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ia_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ia_requested FOREIGN KEY (requested_by_id) REFERENCES employees(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ia_approved FOREIGN KEY (approved_by_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
    id VARCHAR(36) PRIMARY KEY,
    adjustment_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    inventory_batch_id VARCHAR(36) NULL,
    system_quantity INT NOT NULL,
    counted_quantity INT NOT NULL,
    quantity_difference INT NOT NULL,
    unit_cost DECIMAL(15, 4) NOT NULL,
    total_variance_cost DECIMAL(15, 4) NOT NULL,
    CONSTRAINT fk_iai_adj FOREIGN KEY (adjustment_id) REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
    CONSTRAINT fk_iai_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_iai_batch FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL
);

-- 6. Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    transfer_number VARCHAR(50) NOT NULL UNIQUE,
    source_warehouse_id VARCHAR(36) NOT NULL,
    target_warehouse_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, IN_TRANSIT, COMPLETED, CANCELLED
    requested_by_id VARCHAR(36) NOT NULL,
    shipped_at TIMESTAMP NULL,
    received_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_st_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_st_src_wh FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_tgt_wh FOREIGN KEY (target_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_user FOREIGN KEY (requested_by_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id VARCHAR(36) PRIMARY KEY,
    stock_transfer_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    inventory_batch_id VARCHAR(36) NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(15, 4) NOT NULL,
    CONSTRAINT fk_sti_transfer FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_batch FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
);
