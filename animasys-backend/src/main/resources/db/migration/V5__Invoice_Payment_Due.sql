ALTER TABLE purchase_invoices ADD COLUMN due_date VARCHAR(50);
ALTER TABLE purchase_invoices ADD COLUMN payment_status VARCHAR(20) DEFAULT 'UNPAID';
ALTER TABLE purchase_invoices ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00;
