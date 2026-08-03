-- 1. Alter suppliers table to support tax number, phone and address
ALTER TABLE suppliers ADD COLUMN phone VARCHAR(50) NULL;
ALTER TABLE suppliers ADD COLUMN address VARCHAR(255) NULL;
ALTER TABLE suppliers ADD COLUMN tax_number VARCHAR(50) NULL;

-- 2. Create purchase_invoices table
CREATE TABLE purchase_invoices (
    id VARCHAR(36) PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date VARCHAR(50) NOT NULL,
    supplier_id VARCHAR(36) NULL,
    supplier_name VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    vat DECIMAL(10, 2) DEFAULT 0.00,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    shipping DECIMAL(10, 2) DEFAULT 0.00,
    net_total DECIMAL(10, 2) NOT NULL,
    grand_total DECIMAL(10, 2) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(36) NOT NULL,
    image_url LONGTEXT NULL,
    status VARCHAR(20) NOT NULL, -- DRAFT, COMPLETED
    fingerprint VARCHAR(255) UNIQUE NOT NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES employees(id)
);

-- 3. Create purchase_invoice_items table
CREATE TABLE purchase_invoice_items (
    id VARCHAR(36) PRIMARY KEY,
    purchase_invoice_id VARCHAR(36) NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    sku VARCHAR(100) NULL,
    cost DECIMAL(10, 2) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    confidence_name DECIMAL(3, 2) NULL,
    confidence_qty DECIMAL(3, 2) NULL,
    confidence_cost DECIMAL(3, 2) NULL,
    confidence_price DECIMAL(3, 2) NULL,
    FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
);
