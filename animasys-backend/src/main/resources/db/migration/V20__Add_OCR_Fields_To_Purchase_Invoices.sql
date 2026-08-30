-- Add raw_ocr_json to purchase_invoices
ALTER TABLE purchase_invoices ADD COLUMN raw_ocr_json LONGTEXT NULL;

-- Add OCR fields to purchase_invoice_items
ALTER TABLE purchase_invoice_items ADD COLUMN barcode VARCHAR(100) NULL;
ALTER TABLE purchase_invoice_items ADD COLUMN lot_number VARCHAR(100) NULL;
ALTER TABLE purchase_invoice_items ADD COLUMN unit_name VARCHAR(50) NULL;
ALTER TABLE purchase_invoice_items ADD COLUMN conversion_factor INT NULL;
