package com.animasys.core.security;

/**
 * Prefix used for Spring Security granted authorities derived from RBAC permissions.
 */
public final class PermissionAuthority {
    public static final String PREFIX = "PERM_";

    private PermissionAuthority() {}

    public static String toAuthority(String permissionCode) {
        return PREFIX + permissionCode;
    }

    public static boolean isPermissionAuthority(String authority) {
        return authority != null && authority.startsWith(PREFIX);
    }

    public static String fromAuthority(String authority) {
        if (!isPermissionAuthority(authority)) {
            return null;
        }
        return authority.substring(PREFIX.length());
    }
}
