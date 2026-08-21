package com.animasys.core.security;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.domain.Employee;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Resolves the authenticated employee / tenant from the SecurityContext.
 * Controllers must never trust tenantId or employeeId from the client body/query.
 */
public final class SecurityUtils {

    private SecurityUtils() {}

    public static UserPrincipal requirePrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal principal)) {
            throw new AccessDeniedException("Authentication required");
        }
        return principal;
    }

    public static Employee requireEmployee() {
        Employee employee = requirePrincipal().getEmployee();
        if (employee == null) {
            throw new AccessDeniedException("Authenticated principal has no linked employee");
        }
        return employee;
    }

    public static String requireEmployeeId() {
        return requireEmployee().getId();
    }

    public static String requireTenantId() {
        Employee employee = requireEmployee();
        if (employee.getTenant() == null || employee.getTenant().getId() == null) {
            throw new BusinessRuleException("Employee is not linked to a tenant");
        }
        return employee.getTenant().getId();
    }

    public static String requireBranchId() {
        Employee employee = requireEmployee();
        if (employee.getBranch() == null || employee.getBranch().getId() == null) {
            throw new BusinessRuleException("Employee is not linked to a branch");
        }
        return employee.getBranch().getId();
    }

    public static void requireAnyRole(String... roles) {
        String role = requireEmployee().getRole();
        Set<String> allowed = Arrays.stream(roles).map(String::toUpperCase).collect(Collectors.toSet());
        if (role == null || !allowed.contains(role.toUpperCase())) {
            throw new AccessDeniedException("Insufficient role. Required one of: " + allowed);
        }
    }

    public static boolean hasPermission(String permissionCode) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || permissionCode == null) {
            return false;
        }
        String required = PermissionAuthority.toAuthority(permissionCode);
        return auth.getAuthorities().stream()
                .anyMatch(a -> required.equals(a.getAuthority()));
    }

    public static void requirePermission(String permissionCode) {
        if (!hasPermission(permissionCode)) {
            throw new AccessDeniedException("Insufficient permission: " + permissionCode);
        }
    }
}
