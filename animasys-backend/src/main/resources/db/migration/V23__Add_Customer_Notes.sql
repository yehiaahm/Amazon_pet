-- V23: Add internal notes column to customers table
-- Private staff remarks shown at POS when the customer is selected.

-- Previously wrapped in MySQL-only "/*! ... */" (silent no-op on H2).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT NULL;
