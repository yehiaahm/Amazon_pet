-- V23: Add internal notes column to customers table
-- Private staff remarks shown at POS when the customer is selected.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT NULL;
