CREATE TABLE cash_deposits (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    branch_id VARCHAR(36) NOT NULL,
    source VARCHAR(30) NOT NULL, -- OWNER_INJECTION, LOAN, FLOAT_TOPUP, OTHER
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    description VARCHAR(255),
    deposited_to VARCHAR(10) NOT NULL, -- CASH, BANK
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

ALTER TABLE daily_closings ADD COLUMN cash_deposits_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- ─── Permission catalog ─────────────────────────────────────────────────────

INSERT INTO permissions (id, code, name, module) VALUES
('perm-finance-view-deposits',  'finance.view_deposits',  'View Cash Deposits',  'Finance'),
('perm-finance-add-deposit',    'finance.add_deposit',    'Add Cash Deposit',    'Finance'),
('perm-finance-delete-deposit', 'finance.delete_deposit', 'Delete Cash Deposit', 'Finance');

-- Deliberately OWNER-only: unlike expenses (CASHIER can log a cash outflow),
-- recording that cash was injected into the drawer is an admin-only control
-- so a cashier can never manufacture "extra" cash to cover a shortfall.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('finance.view_deposits', 'finance.add_deposit', 'finance.delete_deposit')
WHERE r.code = 'OWNER';
