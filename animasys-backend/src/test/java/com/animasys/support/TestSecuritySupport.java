package com.animasys.support;

import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.service.PermissionResolverService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Sets an authenticated SecurityContext for integration tests (RBAC + tenant isolation).
 */
public final class TestSecuritySupport {

    private TestSecuritySupport() {}

    public static void authenticate(Employee employee, PermissionResolverService permissionResolver) {
        List<String> codes = new ArrayList<>(permissionResolver.resolvePermissionCodes(employee));
        if (codes.isEmpty()) {
            codes.addAll(defaultIntegrationPermissions());
        }
        setAuthentication(employee, codes);
    }

    public static void authenticateWithPermissions(Employee employee, Collection<String> permissionCodes) {
        setAuthentication(employee, new ArrayList<>(permissionCodes));
    }

    public static void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void setAuthentication(Employee employee, List<String> permissionCodes) {
        UserPrincipal principal = new UserPrincipal(employee, permissionCodes);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /** Minimal superset for inventory/import/finance integration tests when Flyway roles are absent. */
    private static List<String> defaultIntegrationPermissions() {
        return List.of(
                "purchases.ocr_import",
                "purchases.view",
                "purchases.create_invoice",
                "inventory.view",
                "inventory.receive_stock",
                "inventory.stock_adjustment",
                "inventory.warehouse_transfer",
                "inventory.batch_management",
                "products.view",
                "products.add",
                "products.edit",
                "products.delete",
                "sales.create_sale",
                "sales.refund_sale",
                "sales.open_shift",
                "sales.close_shift",
                "settings.factory_reset",
                "employees.view",
                "finance.view_expenses",
                "finance.add_expense",
                "finance.delete_expense",
                "customers.view",
                "customers.add",
                "customers.edit",
                "customers.delete"
        );
    }
}
