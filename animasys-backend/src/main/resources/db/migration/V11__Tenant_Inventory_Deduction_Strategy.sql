-- Tenant-level FIFO / FEFO selection (P1)
ALTER TABLE tenants ADD COLUMN inventory_deduction_strategy VARCHAR(10) NOT NULL DEFAULT 'FIFO';
