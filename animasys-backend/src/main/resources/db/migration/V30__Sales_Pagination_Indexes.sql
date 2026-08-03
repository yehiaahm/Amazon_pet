-- Sprint 5.3A: indexes for paginated sales list and filtered analytics lookups

CREATE INDEX idx_sales_employee_date ON sales (employee_id, date DESC);

CREATE INDEX idx_sales_date ON sales (date DESC);

CREATE INDEX idx_sales_customer_date ON sales (customer_id, date DESC);

CREATE INDEX idx_sales_status_date ON sales (status, date DESC);

CREATE INDEX idx_sales_sale_number ON sales (sale_number);

CREATE INDEX idx_sale_items_sale_id ON sale_items (sale_id);

CREATE INDEX idx_sale_items_name ON sale_items (name);
