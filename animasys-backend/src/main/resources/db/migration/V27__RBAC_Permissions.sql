-- RBAC: permissions catalog (global), tenant-scoped roles, role-permission mappings

CREATE TABLE permissions (
    id          VARCHAR(50)  PRIMARY KEY,
    code        VARCHAR(100) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    module      VARCHAR(50)  NOT NULL,
    description VARCHAR(500)
);

CREATE TABLE roles (
    id          VARCHAR(50)  PRIMARY KEY,
    tenant_id   VARCHAR(50)  NOT NULL REFERENCES tenants(id),
    code        VARCHAR(50)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    system_role BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE role_permissions (
    role_id       VARCHAR(50) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(50) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);

-- ─── Permission catalog ─────────────────────────────────────────────────────

INSERT INTO permissions (id, code, name, module) VALUES
-- Dashboard
('perm-dashboard-view',           'dashboard.view',              'View Dashboard',              'Dashboard'),
('perm-dashboard-financial-kpis', 'dashboard.financial_kpis',    'View Financial KPIs',         'Dashboard'),
('perm-dashboard-charts',       'dashboard.charts',            'View Charts',                 'Dashboard'),
('perm-dashboard-alerts',         'dashboard.alerts',            'View Alerts',                 'Dashboard'),
-- Products
('perm-products-view',            'products.view',               'View Products',               'Products'),
('perm-products-add',             'products.add',                'Add Product',                 'Products'),
('perm-products-edit',            'products.edit',               'Edit Product',                'Products'),
('perm-products-delete',          'products.delete',             'Delete Product',              'Products'),
('perm-products-change-prices',   'products.change_prices',      'Change Prices',               'Products'),
('perm-products-print-barcode',   'products.print_barcode',      'Print Barcode',               'Products'),
('perm-products-manage-categories','products.manage_categories', 'Manage Categories',           'Products'),
('perm-products-manage-brands',   'products.manage_brands',      'Manage Brands',               'Products'),
('perm-products-manage-suppliers','products.manage_suppliers',  'Manage Suppliers',            'Products'),
-- Inventory
('perm-inventory-view',           'inventory.view',              'View Inventory',              'Inventory'),
('perm-inventory-receive',        'inventory.receive_stock',     'Receive Stock',               'Inventory'),
('perm-inventory-adjustment',     'inventory.stock_adjustment',  'Stock Adjustment',            'Inventory'),
('perm-inventory-count',          'inventory.inventory_count',   'Inventory Count',             'Inventory'),
('perm-inventory-batch',          'inventory.batch_management',  'Batch Management',            'Inventory'),
('perm-inventory-expiry',         'inventory.expiry_management', 'Expiry Management',           'Inventory'),
('perm-inventory-transfer',       'inventory.warehouse_transfer','Warehouse Transfer',          'Inventory'),
('perm-inventory-history',        'inventory.view_stock_history','View Stock History',          'Inventory'),
-- Sales (POS)
('perm-sales-open-shift',         'sales.open_shift',            'Open Shift',                  'Sales'),
('perm-sales-close-shift',        'sales.close_shift',           'Close Shift',                 'Sales'),
('perm-sales-create',             'sales.create_sale',           'Create Sale',                 'Sales'),
('perm-sales-discount',           'sales.apply_discount',        'Apply Discount',              'Sales'),
('perm-sales-override-price',     'sales.override_price',        'Override Price',              'Sales'),
('perm-sales-refund',             'sales.refund_sale',           'Refund Sale',                 'Sales'),
('perm-sales-void',               'sales.void_invoice',          'Void Invoice',                'Sales'),
('perm-sales-reprint',            'sales.reprint_invoice',       'Reprint Invoice',             'Sales'),
('perm-sales-thermal',            'sales.print_thermal_receipt', 'Print Thermal Receipt',       'Sales'),
('perm-sales-a4',                 'sales.print_a4_invoice',      'Print A4 Invoice',              'Sales'),
-- Customers
('perm-customers-view',           'customers.view',              'View Customers',              'Customers'),
('perm-customers-add',            'customers.add',               'Add Customer',                'Customers'),
('perm-customers-edit',           'customers.edit',              'Edit Customer',               'Customers'),
('perm-customers-delete',         'customers.delete',            'Delete Customer',             'Customers'),
('perm-customers-ban',            'customers.ban',               'Ban Customer',                'Customers'),
('perm-customers-loyalty',        'customers.manage_loyalty',    'Manage Loyalty',              'Customers'),
('perm-customers-history',        'customers.view_purchase_history','View Purchase History',    'Customers'),
-- Pets
('perm-pets-view',                'pets.view',                   'View Pets',                   'Pets'),
('perm-pets-add',                 'pets.add',                    'Add Pet',                     'Pets'),
('perm-pets-edit',                'pets.edit',                   'Edit Pet',                    'Pets'),
('perm-pets-delete',              'pets.delete',                 'Delete Pet',                  'Pets'),
-- Grooming
('perm-grooming-view',            'grooming.view_appointments',  'View Appointments',           'Grooming'),
('perm-grooming-create',          'grooming.create_appointment', 'Create Appointment',          'Grooming'),
('perm-grooming-edit',            'grooming.edit_appointment',   'Edit Appointment',            'Grooming'),
('perm-grooming-cancel',          'grooming.cancel_appointment', 'Cancel Appointment',          'Grooming'),
('perm-grooming-complete',        'grooming.complete_appointment','Complete Appointment',         'Grooming'),
-- Boarding
('perm-boarding-view',            'boarding.view_reservations',  'View Reservations',           'Boarding'),
('perm-boarding-create',          'boarding.create_reservation', 'Create Reservation',          'Boarding'),
('perm-boarding-edit',            'boarding.edit_reservation',   'Edit Reservation',            'Boarding'),
('perm-boarding-cancel',          'boarding.cancel_reservation', 'Cancel Reservation',          'Boarding'),
-- Purchases
('perm-purchases-view',           'purchases.view',              'View Purchases',              'Purchases'),
('perm-purchases-create',         'purchases.create_invoice',    'Create Purchase Invoice',     'Purchases'),
('perm-purchases-edit',           'purchases.edit',                'Edit Purchase',               'Purchases'),
('perm-purchases-return',         'purchases.return',            'Purchase Return',             'Purchases'),
('perm-purchases-ocr',            'purchases.ocr_import',        'OCR Import',                  'Purchases'),
-- Finance
('perm-finance-view-expenses',    'finance.view_expenses',       'View Expenses',               'Finance'),
('perm-finance-add-expense',      'finance.add_expense',         'Add Expense',                 'Finance'),
('perm-finance-edit-expense',     'finance.edit_expense',        'Edit Expense',                'Finance'),
('perm-finance-delete-expense',   'finance.delete_expense',      'Delete Expense',              'Finance'),
('perm-finance-view-profit',      'finance.view_profit',         'View Profit',                 'Finance'),
('perm-finance-view-reports',     'finance.view_reports',        'View Financial Reports',      'Finance'),
-- Reports
('perm-reports-view',             'reports.view',                'View Reports',                'Reports'),
('perm-reports-export-excel',     'reports.export_excel',        'Export Excel',                'Reports'),
('perm-reports-export-pdf',       'reports.export_pdf',          'Export PDF',                  'Reports'),
('perm-reports-print',            'reports.print',               'Print Reports',               'Reports'),
-- Employees
('perm-employees-view',           'employees.view',              'View Employees',              'Employees'),
('perm-employees-add',            'employees.add',               'Add Employee',                'Employees'),
('perm-employees-edit',           'employees.edit',              'Edit Employee',               'Employees'),
('perm-employees-delete',         'employees.delete',            'Delete Employee',             'Employees'),
-- Roles
('perm-roles-view',               'roles.view',                  'View Roles',                  'Roles'),
('perm-roles-create',             'roles.create',                'Create Role',                 'Roles'),
('perm-roles-edit',               'roles.edit',                  'Edit Role',                   'Roles'),
('perm-roles-delete',             'roles.delete',                'Delete Role',                 'Roles'),
('perm-roles-assign',             'roles.assign_permissions',    'Assign Permissions',          'Roles'),
-- Settings
('perm-settings-view',            'settings.view',               'View Settings',               'Settings'),
('perm-settings-edit',            'settings.edit',               'Edit Settings',               'Settings'),
('perm-settings-backup',          'settings.backup',             'Backup',                      'Settings'),
('perm-settings-restore',         'settings.restore',            'Restore',                     'Settings'),
('perm-settings-factory-reset',   'settings.factory_reset',      'Factory Reset',               'Settings'),
-- AI
('perm-ai-assistant',             'ai.use_assistant',            'Use AI Assistant',            'AI'),
('perm-ai-insights',              'ai.insights',                 'AI Insights',                 'AI'),
('perm-ai-ocr',                   'ai.ocr_analysis',             'OCR Analysis',                'AI');

-- Seed system roles for each existing tenant and assign default permissions
-- OWNER gets all permissions; MANAGER gets all except factory_reset;
-- CASHIER and GROOMER get operational subsets matching legacy behavior.

INSERT INTO roles (id, tenant_id, code, name, description, system_role)
SELECT 'role-' || t.id || '-owner',   t.id, 'OWNER',   'Owner',   'Full system access',           TRUE FROM tenants t;

INSERT INTO roles (id, tenant_id, code, name, description, system_role)
SELECT 'role-' || t.id || '-manager', t.id, 'MANAGER', 'Manager', 'Management and operations',    TRUE FROM tenants t;

INSERT INTO roles (id, tenant_id, code, name, description, system_role)
SELECT 'role-' || t.id || '-cashier', t.id, 'CASHIER', 'Cashier', 'Point of sale operations',     TRUE FROM tenants t;

INSERT INTO roles (id, tenant_id, code, name, description, system_role)
SELECT 'role-' || t.id || '-groomer', t.id, 'GROOMER', 'Groomer', 'Grooming and pet services',    TRUE FROM tenants t;

-- OWNER: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'OWNER';

-- MANAGER: all except factory_reset
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'MANAGER' AND p.code <> 'settings.factory_reset';

-- CASHIER: POS, inventory view, customers view, boarding, grooming, daily closing, analytics
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'sales.open_shift','sales.close_shift','sales.create_sale','sales.apply_discount',
    'sales.override_price','sales.refund_sale','sales.void_invoice','sales.reprint_invoice',
    'sales.print_thermal_receipt','sales.print_a4_invoice',
    'inventory.view','products.view','products.print_barcode',
    'customers.view','customers.view_purchase_history',
    'boarding.view_reservations','boarding.create_reservation','boarding.edit_reservation',
    'grooming.view_appointments','grooming.create_appointment','grooming.edit_appointment',
    'grooming.complete_appointment',
    'finance.view_expenses','finance.add_expense',
    'dashboard.view'
)
WHERE r.code = 'CASHIER';

-- GROOMER: grooming, pets, customers view, boarding view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'grooming.view_appointments','grooming.create_appointment','grooming.edit_appointment',
    'grooming.cancel_appointment','grooming.complete_appointment',
    'pets.view','pets.add','pets.edit',
    'customers.view',
    'boarding.view_reservations','boarding.create_reservation'
)
WHERE r.code = 'GROOMER';
