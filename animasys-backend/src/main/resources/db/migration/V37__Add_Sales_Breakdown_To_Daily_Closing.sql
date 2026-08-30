ALTER TABLE daily_closings ADD COLUMN cash_sales_total DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE daily_closings ADD COLUMN card_sales_total DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE daily_closings ADD COLUMN instapay_sales_total DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE daily_closings ADD COLUMN vodafone_sales_total DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE daily_closings ADD COLUMN total_sales DECIMAL(15, 2) DEFAULT 0.00;
