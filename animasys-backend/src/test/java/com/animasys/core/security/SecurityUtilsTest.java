package com.animasys.core.security;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SecurityUtilsTest {

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void requireTenantIdReturnsLinkedTenant() {
        Tenant tenant = Tenant.builder().id("t-sec").name("Sec Tenant").subdomain("sec").build();
        Branch branch = Branch.builder().id("b-sec").tenant(tenant).name("Main").build();
        Employee employee = Employee.builder()
                .id("e-sec")
                .username("sec_user")
                .fullName("Sec User")
                .role("MANAGER")
                .tenant(tenant)
                .branch(branch)
                .active(true)
                .build();
        setAuthentication(employee, List.of("inventory.view"));

        assertEquals("t-sec", SecurityUtils.requireTenantId());
    }

    @Test
    void requireTenantIdFailsWhenEmployeeHasNoTenant() {
        Employee employee = Employee.builder()
                .id("e-no-tenant")
                .username("orphan")
                .fullName("Orphan")
                .role("CASHIER")
                .active(true)
                .build();
        setAuthentication(employee, List.of("inventory.view"));

        assertThrows(BusinessRuleException.class, SecurityUtils::requireTenantId);
    }

    @Test
    void requireTenantIdFailsWhenNotAuthenticated() {
        assertThrows(AccessDeniedException.class, SecurityUtils::requireTenantId);
    }

    /**
     * Regression: requireEmployee() used to dereference UserPrincipal.getEmployee()
     * without a null check, so any principal implementation returning a null employee
     * (a mocked/alternate UserDetails, or a future auth mechanism) NPE'd (500) instead
     * of failing closed with a clean auth error.
     */
    @Test
    void requireTenantIdFailsClosedWhenPrincipalHasNullEmployee() {
        UserPrincipal principal = org.mockito.Mockito.mock(UserPrincipal.class);
        org.mockito.Mockito.when(principal.getEmployee()).thenReturn(null);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThrows(AccessDeniedException.class, SecurityUtils::requireTenantId);
        assertThrows(AccessDeniedException.class, SecurityUtils::requireBranchId);
        assertThrows(AccessDeniedException.class, SecurityUtils::requireEmployeeId);
    }

    @Test
    void hasPermissionMatchesPermAuthorities() {
        Employee employee = employeeWithTenant("t-perm");
        setAuthentication(employee, List.of("sales.refund_sale", "products.view"));

        assertTrue(SecurityUtils.hasPermission("sales.refund_sale"));
        assertTrue(SecurityUtils.hasPermission("products.view"));
        assertFalse(SecurityUtils.hasPermission("settings.factory_reset"));
        assertFalse(SecurityUtils.hasPermission(null));
    }

    @Test
    void requirePermissionThrowsWhenMissing() {
        Employee employee = employeeWithTenant("t-req");
        setAuthentication(employee, List.of("inventory.view"));

        assertDoesNotThrow(() -> SecurityUtils.requirePermission("inventory.view"));
        AccessDeniedException ex = assertThrows(
                AccessDeniedException.class,
                () -> SecurityUtils.requirePermission("settings.factory_reset")
        );
        assertTrue(ex.getMessage().contains("settings.factory_reset"));
    }

    private static Employee employeeWithTenant(String tenantId) {
        Tenant tenant = Tenant.builder().id(tenantId).name("Tenant").subdomain("tenant").build();
        return Employee.builder()
                .id("e-" + tenantId)
                .username("user-" + tenantId)
                .fullName("User")
                .role("CASHIER")
                .tenant(tenant)
                .active(true)
                .build();
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
}
