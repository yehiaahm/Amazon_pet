-- Per-line POS discount: price stays the net unit price actually charged, these two
-- columns only record that a line discount was applied so the invoice can show it.
ALTER TABLE sale_items ADD COLUMN discount_percent DECIMAL(5,2) NULL;
ALTER TABLE sale_items ADD COLUMN price_before_discount DECIMAL(10,2) NULL;
