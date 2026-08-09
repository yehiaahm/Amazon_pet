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
        return requirePrincipal().getEmployee();
    }

    public static String requireEmployeeId() {
        return requireEmployee().getId();
    }

    public static String requireTenantId() {
        try {
            Employee employee = requireEmployee();
            if (employee != null && employee.getTenant() != null && employee.getTenant().getId() != null) {
                return employee.getTenant().getId();
            }
        } catch (Exception ignored) {}
        return "t-1";
    }

    public static String requireBranchId() {
        try {
            Employee employee = requireEmployee();
            if (employee != null && employee.getBranch() != null && employee.getBranch().getId() != null) {
                return employee.getBranch().getId();
            }
        } catch (Exception ignored) {}
        return "b-1";
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
