package com.animasys.core.security;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Maps HTTP method + normalized API path to a required permission code.
 */
@Component
public class EndpointPermissionRegistry {

    private record Key(String method, String path) {}

    private final Map<Key, String> mappings = new HashMap<>();

    public EndpointPermissionRegistry() {
        registerEndpoints();
    }

    public Optional<String> resolve(String httpMethod, String requestUri) {
        String normalized = normalizePath(requestUri);
        String method = httpMethod != null ? httpMethod.toUpperCase(Locale.ROOT) : "GET";
        String direct = mappings.get(new Key(method, normalized));
        if (direct != null) {
            return Optional.of(direct);
        }
        for (Map.Entry<Key, String> entry : mappings.entrySet()) {
            if (!entry.getKey().method.equals(method)) {
                continue;
            }
            if (matchesPattern(entry.getKey().path, normalized)) {
                return Optional.of(entry.getValue());
            }
        }
        return Optional.empty();
    }

    private boolean matchesPattern(String pattern, String path) {
        if (!pattern.contains("{")) {
            return false;
        }
        String[] patternParts = pattern.split("/");
        String[] pathParts = path.split("/");
        if (patternParts.length != pathParts.length) {
            return false;
        }
        for (int i = 0; i < patternParts.length; i++) {
            String segment = patternParts[i];
            if (segment.startsWith("{") && segment.endsWith("}")) {
                continue;
            }
            if (!segment.equals(pathParts[i])) {
                return false;
            }
        }
        return true;
    }

    private String normalizePath(String uri) {
        if (uri == null) {
            return "/";
        }
        int query = uri.indexOf('?');
        String path = query >= 0 ? uri.substring(0, query) : uri;
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }

    private void map(String method, String path, String permission) {
        mappings.put(new Key(method.toUpperCase(Locale.ROOT), path), permission);
    }

    private void registerEndpoints() {
        // Employees & roles
        map("GET",    "/v1/employees",                              "employees.view");
        map("POST",   "/v1/employees",                              "employees.add");
        map("DELETE", "/v1/employees/{id}",                         "employees.delete");
        map("GET",    "/v1/roles",                                  "roles.view");
        map("GET",    "/v1/roles/permissions",                      "roles.view");
        map("GET",    "/v1/roles/{id}",                             "roles.view");
        map("POST",   "/v1/roles",                                  "roles.create");
        map("PUT",    "/v1/roles/{id}",                             "roles.edit");
        map("PUT",    "/v1/roles/{id}/permissions",                 "roles.assign_permissions");
        map("DELETE", "/v1/roles/{id}",                             "roles.delete");

        // Analytics / dashboard
        map("GET",    "/v1/analytics/dashboard",                    "dashboard.view");
        map("GET",    "/v1/analytics/kpis",                         "dashboard.financial_kpis");
        map("GET",    "/v1/analytics/alerts",                       "dashboard.alerts");

        // Products
        map("GET",    "/v1/products",                               "products.view");
        map("POST",   "/v1/products",                               "products.add");
        map("PUT",    "/v1/products/variants/{variantId}",          "products.edit");
        map("DELETE", "/v1/products/variants/{variantId}",          "products.delete");

        // Inventory — stock views & operations
        map("GET",    "/v1/inventory/warehouses",                   "inventory.view");
        map("GET",    "/v1/inventory/variants",                     "inventory.view");
        map("GET",    "/v1/inventory/low-stock",                    "inventory.view");
        map("GET",    "/v1/inventory/batches",                      "inventory.batch_management");
        map("GET",    "/v1/inventory/movements",                    "inventory.view_stock_history");
        map("GET",    "/v1/inventory/expiring",                     "inventory.expiry_management");
        map("PUT",    "/v1/inventory/variants/{id}/pricing",        "products.change_prices");
        map("POST",   "/v1/inventory/adjust",                       "inventory.stock_adjustment");
        map("POST",   "/v1/inventory/count",                        "inventory.inventory_count");
        map("POST",   "/v1/inventory/transfer",                     "inventory.warehouse_transfer");
        map("POST",   "/v1/inventory/reconcile",                    "inventory.stock_adjustment");
        map("DELETE", "/v1/inventory/batches/{id}",                 "inventory.batch_management");

        // Inventory — barcodes & labels
        map("POST",   "/v1/inventory/variants/{id}/barcode/generate", "products.print_barcode");
        map("DELETE", "/v1/inventory/variants/{id}/barcode",        "products.print_barcode");
        map("GET",    "/v1/inventory/variants/{id}/barcode",        "products.print_barcode");
        map("GET",    "/v1/inventory/variants/{id}/barcode/image",  "products.print_barcode");
        map("POST",   "/v1/inventory/variants/barcodes/pdf",        "products.print_barcode");
        map("POST",   "/v1/inventory/variants/barcodes/zpl",        "products.print_barcode");
        map("GET",    "/v1/inventory/system/printers",                "products.print_barcode");
        map("POST",   "/v1/inventory/variants/barcodes/print-direct", "products.print_barcode");
        map("GET",    "/v1/inventory/barcode-settings",               "settings.view");
        map("PUT",    "/v1/inventory/barcode-settings",               "settings.edit");

        // Inventory — QR labels
        map("GET",    "/v1/inventory/qr-labels/variants/{variantId}/payload",  "products.print_barcode");
        map("GET",    "/v1/inventory/qr-labels/variants/{variantId}/image",    "products.print_barcode");
        map("GET",    "/v1/inventory/qr-labels/variants/{variantId}/preview",  "products.print_barcode");
        map("POST",   "/v1/inventory/qr-labels/pdf",                  "products.print_barcode");
        map("POST",   "/v1/inventory/qr-labels/zpl",                  "products.print_barcode");

        // Inventory — catalog admin (SKU dedup)
        map("GET",    "/v1/inventory/catalog-admin/duplicate-skus/preview",       "products.edit");
        map("POST",   "/v1/inventory/catalog-admin/duplicate-skus/merge",       "settings.factory_reset");

        // FIFO costing
        map("POST",   "/v1/inventory/fifo/batches",                   "inventory.receive_stock");
        map("GET",    "/v1/inventory/fifo/batches/active/{productVariantId}", "inventory.view_stock_history");
        map("GET",    "/v1/inventory/fifo/valuation",                 "inventory.view_stock_history");
        map("GET",    "/v1/inventory/fifo/ledger/{productVariantId}", "inventory.view_stock_history");
        map("POST",   "/v1/inventory/fifo/write-off",                 "inventory.stock_adjustment");
        map("GET",    "/v1/inventory/fifo/strategy",                  "settings.view");
        map("PUT",    "/v1/inventory/fifo/strategy",                  "settings.edit");

        // Suppliers
        map("GET",    "/v1/suppliers",                                "products.manage_suppliers");
        map("POST",   "/v1/suppliers",                                "products.manage_suppliers");
        map("GET",    "/v1/suppliers/{id}",                           "products.manage_suppliers");
        map("PUT",    "/v1/suppliers/{id}",                           "products.manage_suppliers");
        map("DELETE", "/v1/suppliers/{id}",                           "products.manage_suppliers");

        // Purchase invoices
        map("GET",    "/v1/purchase-invoices",                        "purchases.view");
        map("POST",   "/v1/purchase-invoices",                        "purchases.create_invoice");
        map("GET",    "/v1/purchase-invoices/{id}",                   "purchases.view");
        map("PUT",    "/v1/purchase-invoices/{id}/pay",               "purchases.edit");

        // Import
        map("POST",   "/v1/import/session/start",                     "purchases.ocr_import");
        map("POST",   "/v1/import/session/{id}/chunk",                  "purchases.ocr_import");
        map("POST",   "/v1/import/session/{id}/finalize",               "purchases.ocr_import");
        map("POST",   "/v1/import/session/{id}/undo",                   "purchases.ocr_import");
        map("DELETE", "/v1/import/session/{id}",                        "settings.factory_reset");
        map("GET",    "/v1/import/history",                             "purchases.ocr_import");

        // POS / Sales
        map("GET",    "/v1/pos-sessions",                             "sales.open_shift");
        map("POST",   "/v1/pos-sessions/open",                        "sales.open_shift");
        map("POST",   "/v1/pos-sessions/{id}/close",                  "sales.close_shift");
        map("GET",    "/v1/pos-sessions/active",                      "sales.open_shift");
        map("GET",    "/v1/sales",                                    "sales.create_sale");
        map("POST",   "/v1/sales",                                    "sales.create_sale");
        map("GET",    "/v1/sales/{id}",                               "sales.create_sale");
        map("GET",    "/v1/sales/{id}/batch-allocations",             "sales.create_sale");
        map("POST",   "/v1/sales/{id}/refund",                        "sales.refund_sale");

        // Customers & pets
        map("GET",    "/v1/customers",                                "customers.view");
        map("POST",   "/v1/customers",                                "customers.add");
        map("GET",    "/v1/customers/{id}",                           "customers.view");
        map("PUT",    "/v1/customers/{id}",                           "customers.edit");
        map("DELETE", "/v1/customers/{id}",                           "customers.delete");
        map("GET",    "/v1/customers/{id}/pets",                      "pets.view");
        map("GET",    "/v1/customers/{id}/sales",                     "customers.view_purchase_history");
        map("GET",    "/v1/pets",                                     "pets.view");
        map("POST",   "/v1/pets",                                     "pets.add");
        map("PUT",    "/v1/pets/{id}",                                "pets.edit");
        map("DELETE", "/v1/pets/{id}",                                "pets.delete");

        // Grooming services & appointments
        map("GET",    "/v1/services",                                 "grooming.view_appointments");
        map("POST",   "/v1/services",                                 "grooming.edit_appointment");
        map("PUT",    "/v1/services/{id}",                            "grooming.edit_appointment");
        map("DELETE", "/v1/services/{id}",                            "grooming.edit_appointment");
        map("POST",   "/v1/services/seed-defaults",                   "grooming.edit_appointment");
        map("GET",    "/v1/appointments",                             "grooming.view_appointments");
        map("POST",   "/v1/appointments",                             "grooming.create_appointment");
        map("PATCH",  "/v1/appointments/{id}/status",                 "grooming.edit_appointment");

        // Boarding
        map("GET",    "/v1/boarding-reservations",                    "boarding.view_reservations");
        map("POST",   "/v1/boarding-reservations",                    "boarding.create_reservation");
        map("PUT",    "/v1/boarding-reservations/{id}/status",        "boarding.edit_reservation");
        map("DELETE", "/v1/boarding-reservations/{id}",               "boarding.cancel_reservation");

        // Finance
        map("GET",    "/v1/expenses",                                 "finance.view_expenses");
        map("POST",   "/v1/expenses",                                 "finance.add_expense");
        map("GET",    "/v1/expenses/{id}",                            "finance.view_expenses");
        map("DELETE", "/v1/expenses/{id}",                            "finance.delete_expense");
        map("GET",    "/v1/daily-closings",                           "finance.view_reports");
        map("POST",   "/v1/daily-closings",                           "finance.view_reports");
        map("GET",    "/v1/accounts-payable/dashboard",               "finance.view_reports");
        map("GET",    "/v1/accounts-payable/invoices/{invoiceId}/installments", "finance.view_reports");
        map("PUT",    "/v1/accounts-payable/invoices/{invoiceId}/installments", "finance.view_reports");
        map("PUT",    "/v1/accounts-payable/installments/{installmentId}/pay", "finance.view_reports");
        map("GET",    "/v1/accounts-payable/settings",                "finance.view_reports");
        map("PUT",    "/v1/accounts-payable/settings",                "finance.view_reports");

        // AI & admin
        map("GET",    "/v1/ai/insights",                              "ai.insights");
        map("POST",   "/v1/ai/ask",                                   "ai.use_assistant");
        map("POST",   "/v1/ai/analyze-invoice",                       "ai.ocr_analysis");
        map("POST",   "/v1/admin/factory-reset",                      "settings.factory_reset");
        map("GET",    "/v1/audit-logs",                               "settings.view");
    }
}
