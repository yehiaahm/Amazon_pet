-- Loyalty System: per-customer balance, full ledger, tenant settings

CREATE TABLE loyalty_settings (
    tenant_id             VARCHAR(36)  PRIMARY KEY,
    enabled               BOOLEAN      NOT NULL DEFAULT FALSE,
    program_open          BOOLEAN      NOT NULL DEFAULT TRUE,
    earn_rate_percent     DECIMAL(6,2) NOT NULL DEFAULT 2.00,
    max_usage_percent     DECIMAL(6,2),
    max_usage_amount      DECIMAL(12,2),
    expiration_enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
    expiration_months     INT,
    CONSTRAINT fk_loyalty_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE loyalty_eligible_categories (
    tenant_id   VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    CONSTRAINT fk_loyalty_elig_cat_tenant FOREIGN KEY (tenant_id) REFERENCES loyalty_settings(tenant_id) ON DELETE CASCADE
);

CREATE TABLE loyalty_excluded_categories (
    tenant_id   VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    CONSTRAINT fk_loyalty_excl_cat_tenant FOREIGN KEY (tenant_id) REFERENCES loyalty_settings(tenant_id) ON DELETE CASCADE
);

CREATE TABLE loyalty_eligible_products (
    tenant_id  VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    CONSTRAINT fk_loyalty_elig_prod_tenant FOREIGN KEY (tenant_id) REFERENCES loyalty_settings(tenant_id) ON DELETE CASCADE
);

CREATE TABLE loyalty_excluded_products (
    tenant_id  VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    CONSTRAINT fk_loyalty_excl_prod_tenant FOREIGN KEY (tenant_id) REFERENCES loyalty_settings(tenant_id) ON DELETE CASCADE
);

CREATE TABLE loyalty_accounts (
    customer_id VARCHAR(36)  PRIMARY KEY,
    tenant_id   VARCHAR(36)  NOT NULL,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    updated_at  TIMESTAMP,
    CONSTRAINT fk_loyalty_account_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_loyalty_accounts_tenant ON loyalty_accounts(tenant_id);

CREATE TABLE loyalty_ledger_entries (
    id               VARCHAR(50)  PRIMARY KEY,
    tenant_id        VARCHAR(36)  NOT NULL,
    customer_id      VARCHAR(36)  NOT NULL,
    sale_id          VARCHAR(36),
    employee_id      VARCHAR(36),
    type             VARCHAR(20)  NOT NULL,
    amount           DECIMAL(12,2) NOT NULL,
    balance_before   DECIMAL(12,2) NOT NULL,
    balance_after    DECIMAL(12,2) NOT NULL,
    note             TEXT,
    related_entry_id VARCHAR(50),
    remaining_amount DECIMAL(12,2),
    expires_at       TIMESTAMP,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_loyalty_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_loyalty_ledger_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
    CONSTRAINT fk_loyalty_ledger_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE INDEX idx_loyalty_ledger_customer ON loyalty_ledger_entries(customer_id);
CREATE INDEX idx_loyalty_ledger_sale ON loyalty_ledger_entries(sale_id);
CREATE INDEX idx_loyalty_ledger_tenant_expiry ON loyalty_ledger_entries(tenant_id, type, expires_at);

ALTER TABLE sales ADD COLUMN loyalty_earned DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN loyalty_redeemed DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN loyalty_earned_reversed DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN loyalty_redeemed_reversed DECIMAL(12,2) NOT NULL DEFAULT 0.00;
