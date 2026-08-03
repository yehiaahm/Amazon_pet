package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AuthorizationCheckerTest {

    private final AuthorizationChecker authorizationChecker = new AuthorizationChecker();

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void hasReturnsTrueWhenPrincipalHasPermAuthority() {
        authenticateWithPermissions(List.of("sales.create_sale", "inventory.view"));

        assertTrue(authorizationChecker.has("sales.create_sale"));
        assertTrue(authorizationChecker.has("inventory.view"));
    }

    @Test
    void hasReturnsFalseWhenPermissionMissing() {
        authenticateWithPermissions(List.of("inventory.view"));

        assertFalse(authorizationChecker.has("sales.create_sale"));
    }

    @Test
    void hasReturnsFalseForBlankOrNullPermission() {
        authenticateWithPermissions(List.of("inventory.view"));

        assertFalse(authorizationChecker.has(null));
        assertFalse(authorizationChecker.has(""));
        assertFalse(authorizationChecker.has("   "));
    }

    @Test
    void hasReturnsFalseWhenNotAuthenticated() {
        assertFalse(authorizationChecker.has("inventory.view"));
    }

    @Test
    void hasAnyAndHasAllCombineIndividualChecks() {
        authenticateWithPermissions(List.of("sales.create_sale", "inventory.view"));

        assertTrue(authorizationChecker.hasAny("sales.create_sale", "employees.delete"));
        assertFalse(authorizationChecker.hasAny("employees.delete", "finance.view_expenses"));
        assertTrue(authorizationChecker.hasAll("sales.create_sale", "inventory.view"));
        assertFalse(authorizationChecker.hasAll("sales.create_sale", "employees.delete"));
    }

    private static void authenticateWithPermissions(List<String> permissionCodes) {
        Tenant tenant = Tenant.builder().id("t-authz").name("Authz Tenant").subdomain("authz").build();
        Employee employee = Employee.builder()
                .id("e-authz")
                .username("authz_user")
                .fullName("Authz User")
                .role("CASHIER")
                .tenant(tenant)
                .active(true)
                .build();

        UserPrincipal principal = new UserPrincipal(employee, permissionCodes);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
