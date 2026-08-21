/** Permission codes — must match backend permissions table. */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_FINANCIAL_KPIS: 'dashboard.financial_kpis',
  DASHBOARD_CHARTS: 'dashboard.charts',
  DASHBOARD_ALERTS: 'dashboard.alerts',

  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_ADD: 'products.add',
  PRODUCTS_EDIT: 'products.edit',
  PRODUCTS_DELETE: 'products.delete',
  PRODUCTS_CHANGE_PRICES: 'products.change_prices',
  PRODUCTS_IMPORT: 'products.import',
  PRODUCTS_PRINT_BARCODE: 'products.print_barcode',
  PRODUCTS_MANAGE_CATEGORIES: 'products.manage_categories',
  PRODUCTS_MANAGE_BRANDS: 'products.manage_brands',
  PRODUCTS_MANAGE_SUPPLIERS: 'products.manage_suppliers',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_RECEIVE: 'inventory.receive_stock',
  INVENTORY_ADJUSTMENT: 'inventory.stock_adjustment',
  INVENTORY_COUNT: 'inventory.inventory_count',
  INVENTORY_BATCH: 'inventory.batch_management',
  INVENTORY_EXPIRY: 'inventory.expiry_management',
  INVENTORY_TRANSFER: 'inventory.warehouse_transfer',
  INVENTORY_HISTORY: 'inventory.view_stock_history',

  SALES_OPEN_SHIFT: 'sales.open_shift',
  SALES_CLOSE_SHIFT: 'sales.close_shift',
  SALES_CREATE: 'sales.create_sale',
  SALES_DISCOUNT: 'sales.apply_discount',
  SALES_OVERRIDE_PRICE: 'sales.override_price',
  SALES_REFUND: 'sales.refund_sale',
  SALES_VOID: 'sales.void_invoice',
  SALES_REPRINT: 'sales.reprint_invoice',
  SALES_THERMAL: 'sales.print_thermal_receipt',
  SALES_A4: 'sales.print_a4_invoice',

  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_ADD: 'customers.add',
  CUSTOMERS_EDIT: 'customers.edit',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_BAN: 'customers.ban',
  CUSTOMERS_LOYALTY: 'customers.manage_loyalty',
  CUSTOMERS_HISTORY: 'customers.view_purchase_history',

  PETS_VIEW: 'pets.view',
  PETS_ADD: 'pets.add',
  PETS_EDIT: 'pets.edit',
  PETS_DELETE: 'pets.delete',

  GROOMING_VIEW: 'grooming.view_appointments',
  GROOMING_CREATE: 'grooming.create_appointment',
  GROOMING_EDIT: 'grooming.edit_appointment',
  GROOMING_CANCEL: 'grooming.cancel_appointment',
  GROOMING_COMPLETE: 'grooming.complete_appointment',

  BOARDING_VIEW: 'boarding.view_reservations',
  BOARDING_CREATE: 'boarding.create_reservation',
  BOARDING_EDIT: 'boarding.edit_reservation',
  BOARDING_CANCEL: 'boarding.cancel_reservation',

  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE: 'purchases.create_invoice',
  PURCHASES_EDIT: 'purchases.edit',
  PURCHASES_RETURN: 'purchases.return',
  PURCHASES_OCR: 'purchases.ocr_import',

  FINANCE_VIEW_EXPENSES: 'finance.view_expenses',
  FINANCE_ADD_EXPENSE: 'finance.add_expense',
  FINANCE_EDIT_EXPENSE: 'finance.edit_expense',
  FINANCE_DELETE_EXPENSE: 'finance.delete_expense',
  FINANCE_VIEW_PROFIT: 'finance.view_profit',
  FINANCE_VIEW_REPORTS: 'finance.view_reports',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT_EXCEL: 'reports.export_excel',
  REPORTS_EXPORT_PDF: 'reports.export_pdf',
  REPORTS_PRINT: 'reports.print',

  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_ADD: 'employees.add',
  EMPLOYEES_EDIT: 'employees.edit',
  EMPLOYEES_DELETE: 'employees.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT: 'roles.edit',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN: 'roles.assign_permissions',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_BACKUP: 'settings.backup',
  SETTINGS_RESTORE: 'settings.restore',
  SETTINGS_FACTORY_RESET: 'settings.factory_reset',

  AI_ASSISTANT: 'ai.use_assistant',
  AI_INSIGHTS: 'ai.insights',
  AI_OCR: 'ai.ocr_analysis',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/** Maps sidebar module IDs to required view permission(s). */
export const MODULE_PERMISSIONS: Record<string, PermissionCode | PermissionCode[]> = {
  'dashboard-executive': [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.DASHBOARD_FINANCIAL_KPIS],
  'dashboard-financial': PERMISSIONS.DASHBOARD_FINANCIAL_KPIS,
  'dashboard-inventory': PERMISSIONS.INVENTORY_VIEW,
  'dashboard-operations': PERMISSIONS.DASHBOARD_CHARTS,
  'loyalty-dashboard': PERMISSIONS.CUSTOMERS_LOYALTY,
  'pos': PERMISSIONS.SALES_CREATE,
  'invoices': PERMISSIONS.SALES_REPRINT,
  'inventory': PERMISSIONS.INVENTORY_VIEW,
  'crm': PERMISSIONS.CUSTOMERS_VIEW,
  'pets': PERMISSIONS.PETS_VIEW,
  'services': PERMISSIONS.GROOMING_VIEW,
  'boarding': PERMISSIONS.BOARDING_VIEW,
  'employees': PERMISSIONS.EMPLOYEES_VIEW,
  'roles': PERMISSIONS.ROLES_VIEW,
  'finance': PERMISSIONS.FINANCE_VIEW_EXPENSES,
  'reports': [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.FINANCE_VIEW_REPORTS],
  'ai': [PERMISSIONS.AI_ASSISTANT, PERMISSIONS.AI_INSIGHTS],
};

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
  description?: string;
}

export interface PermissionModuleGroup {
  module: string;
  permissions: PermissionItem[];
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description?: string;
  systemRole: boolean;
  employeeCount: number;
  permissionCount: number;
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  description?: string;
  systemRole: boolean;
  employeeCount: number;
  permissionCodes: string[];
}
