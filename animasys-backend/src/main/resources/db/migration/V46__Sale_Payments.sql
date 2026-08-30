CREATE TABLE sale_payments (
    id VARCHAR(36) PRIMARY KEY,
    sale_id VARCHAR(36) NOT NULL,
    method VARCHAR(20) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
CREATE INDEX idx_sale_payments_sale_id ON sale_payments(sale_id);
