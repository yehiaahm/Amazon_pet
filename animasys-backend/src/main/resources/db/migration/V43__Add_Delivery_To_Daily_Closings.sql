ALTER TABLE daily_closings ADD COLUMN delivery_orders_count INT NOT NULL DEFAULT 0;
ALTER TABLE daily_closings ADD COLUMN delivery_fees_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
