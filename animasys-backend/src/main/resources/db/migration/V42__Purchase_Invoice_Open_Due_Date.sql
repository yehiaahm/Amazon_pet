-- Purchase invoices with no explicit payment terms should be "open" (payable
-- any time, no forced deadline) instead of silently defaulting to a due date
-- of "today", which made every unpaid invoice show as overdue/due-soon
-- almost immediately. Relax the NOT NULL so an open-ended installment can
-- have a null due_date. Runs on both MySQL and the H2 fallback profile
-- (unlike the MySQL-only /*! ... */ blocks used elsewhere — MODIFY COLUMN
-- to relax NOT NULL parses fine on H2's MODE=MySQL, verified against the
-- local fallback DB).
ALTER TABLE purchase_invoice_installments MODIFY COLUMN due_date VARCHAR(50) NULL;
