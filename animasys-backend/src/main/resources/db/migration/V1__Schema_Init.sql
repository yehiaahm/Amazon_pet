-- 1. Tenants & Hierarchy
CREATE TABLE tenants (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subdomain VARCHAR(50) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branches (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    phone VARCHAR(30),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE employees (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    branch_id VARCHAR(36) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL, -- OWNER, MANAGER, CASHIER, GROOMER
    active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- 2. Warehouses & Stock Inventory
CREATE TABLE warehouses (
    id VARCHAR(36) PRIMARY KEY,
    branch_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE categories (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE products (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    -- No inline UNIQUE here (deliberately, not an oversight): V18 later adds a
    -- tenant-scoped composite unique constraint (tenant_id, sku) instead, since
    -- a bare column-level UNIQUE on sku would wrongly forbid two different
    -- tenants from ever using the same SKU. Auto-generated constraint names
    -- for an inline UNIQUE are non-deterministic across engines (verified: H2
    -- names it e.g. CONSTRAINT_C4), so V18 previously had to dynamically look
    -- up and drop whatever name got assigned before adding the real one —
    -- simpler to just never create the column-level constraint at all.
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    min_stock_limit INT NOT NULL DEFAULT 10,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE product_variants (
    id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL, -- e.g. "10kg Bag", "2kg Bag"
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE product_batches (
    id VARCHAR(36) PRIMARY KEY,
    product_variant_id VARCHAR(36) NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE stock_movements (
    id VARCHAR(36) PRIMARY KEY,
    warehouse_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    quantity INT NOT NULL, -- Positive for stock in, negative for stock out
    type VARCHAR(20) NOT NULL, -- SALE, PURCHASE, ADJUSTMENT, TRANSFER
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    employee_id VARCHAR(36) NOT NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);

-- 3. CRM (Customers & Pets)
CREATE TABLE customers (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE pets (
    id VARCHAR(36) PRIMARY KEY,
    customer_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    species VARCHAR(20) NOT NULL, -- DOG, CAT, BIRD, OTHER
    breed VARCHAR(100),
    age INT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 4. POS Sessions & Sales
CREATE TABLE pos_sessions (
    id VARCHAR(36) PRIMARY KEY,
    branch_id VARCHAR(36) NOT NULL,
    opened_by_id VARCHAR(36) NOT NULL,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL DEFAULT NULL,
    opening_balance DECIMAL(10,2) NOT NULL,
    closing_balance DECIMAL(10,2) NULL DEFAULT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (opened_by_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE TABLE sales (
    id VARCHAR(36) PRIMARY KEY,
    sale_number VARCHAR(50) UNIQUE NOT NULL,
    pos_session_id VARCHAR(36) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20) NOT NULL, -- CASH, CARD, MOBILE
    employee_id VARCHAR(36) NOT NULL,
    customer_id VARCHAR(36) NULL DEFAULT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pos_session_id) REFERENCES pos_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE sale_items (
    id VARCHAR(36) PRIMARY KEY,
    sale_id VARCHAR(36) NOT NULL,
    type VARCHAR(10) NOT NULL, -- PRODUCT, SERVICE
    item_id VARCHAR(36) NOT NULL, -- ProductVariant ID or Service ID
    name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- 5. Grooming Services & Booking Appointments
CREATE TABLE services (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE appointments (
    id VARCHAR(36) PRIMARY KEY,
    pet_id VARCHAR(36) NOT NULL,
    service_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL, -- groomer id
    date_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, CANCELLED
    notes VARCHAR(255),
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);

-- 6. Accounting & Expenses Ledgers
CREATE TABLE bank_accounts (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE expenses (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    branch_id VARCHAR(36) NOT NULL,
    category VARCHAR(30) NOT NULL, -- RENT, SALARY, UTILITIES, SUPPLIES
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    description VARCHAR(255),
    paid_from VARCHAR(10) NOT NULL, -- CASH, BANK
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE journals (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR(255) NOT NULL,
    total_debit DECIMAL(12,2) NOT NULL,
    total_credit DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE journal_entries (
    id VARCHAR(36) PRIMARY KEY,
    journal_id VARCHAR(36) NOT NULL,
    account_code VARCHAR(50) NOT NULL, -- e.g., 'CASH_DRAWER', 'SALES_REVENUE'
    type VARCHAR(6) NOT NULL, -- DEBIT, CREDIT
    amount DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
);

CREATE TABLE daily_closings (
    id VARCHAR(36) PRIMARY KEY,
    branch_id VARCHAR(36) NOT NULL,
    cashbox_id VARCHAR(36) NOT NULL,
    opening_balance DECIMAL(10,2) NOT NULL,
    closing_balance DECIMAL(10,2) NOT NULL,
    system_expected DECIMAL(10,2) NOT NULL,
    physical_actual DECIMAL(10,2) NOT NULL,
    difference DECIMAL(10,2) NOT NULL,
    closed_by_id VARCHAR(36) NOT NULL,
    date DATE NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (closed_by_id) REFERENCES employees(id) ON DELETE RESTRICT
);

-- 7. Audit Logging
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    action VARCHAR(100) NOT NULL,
    affected_entity VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    old_state TEXT,
    new_state TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);
