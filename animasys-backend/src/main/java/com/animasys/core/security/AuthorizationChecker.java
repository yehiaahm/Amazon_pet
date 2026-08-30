package com.animasys.core.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * SpEL-accessible authorization helper for {@code @PreAuthorize("@authz.has('permission.code')")}.
 */
@Component("authz")
public class AuthorizationChecker {

    public boolean has(String permissionCode) {
        if (permissionCode == null || permissionCode.isBlank()) {
            return false;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        String required = PermissionAuthority.toAuthority(permissionCode.trim());
        return auth.getAuthorities().stream()
                .anyMatch(a -> required.equals(a.getAuthority()));
    }

    public boolean hasAny(String... permissionCodes) {
        return Arrays.stream(permissionCodes).anyMatch(this::has);
    }

    public boolean hasAll(String... permissionCodes) {
        return Arrays.stream(permissionCodes).allMatch(this::has);
    }
}
