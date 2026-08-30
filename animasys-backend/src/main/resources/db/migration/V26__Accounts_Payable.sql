-- Accounts Payable: installments, payment type, reminder settings

ALTER TABLE purchase_invoices ADD COLUMN payment_type VARCHAR(20) NOT NULL DEFAULT 'LUMP_SUM';

CREATE TABLE purchase_invoice_installments (
    id VARCHAR(50) PRIMARY KEY,
    purchase_invoice_id VARCHAR(50) NOT NULL,
    installment_number INT NOT NULL,
    due_date VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    paid_at TIMESTAMP NULL,
    notes VARCHAR(500),
    CONSTRAINT fk_installment_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
);

CREATE INDEX idx_installment_invoice ON purchase_invoice_installments(purchase_invoice_id);
CREATE INDEX idx_installment_due_date ON purchase_invoice_installments(due_date);
CREATE INDEX idx_installment_status ON purchase_invoice_installments(status);

CREATE TABLE accounts_payable_settings (
    tenant_id VARCHAR(50) PRIMARY KEY,
    reminder_days_before_due INT NOT NULL DEFAULT 7,
    CONSTRAINT fk_ap_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Backfill: create single installment for existing unpaid/partial invoices.
-- Derives the id from the invoice id (not UUID(), which H2 doesn't have —
-- CONCAT/SUBSTRING/REPLACE below are ANSI-portable) so this backfill runs
-- identically on MySQL and the H2 fallback profile.
INSERT INTO purchase_invoice_installments (id, purchase_invoice_id, installment_number, due_date, amount, paid_amount, status)
SELECT
    CONCAT('inst-', pi.id),
    pi.id,
    1,
    COALESCE(pi.due_date, pi.invoice_date),
    pi.grand_total,
    COALESCE(pi.paid_amount, 0),
    CASE
        WHEN pi.payment_status = 'PAID' THEN 'PAID'
        WHEN COALESCE(pi.paid_amount, 0) > 0 THEN 'PARTIALLY_PAID'
        ELSE 'PENDING'
    END
FROM purchase_invoices pi
WHERE NOT EXISTS (
    SELECT 1 FROM purchase_invoice_installments pii WHERE pii.purchase_invoice_id = pi.id
);
