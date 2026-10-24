package com.animasys.core.security;

import java.util.Locale;

/**
 * Privilege ordering for employee roles. Lower rank = more privileged.
 *
 * RBAC answers "may this employee edit employees at all"; it cannot answer "which
 * employees, and which roles may they hand out". Without that second question an
 * {@code employees.edit} holder could PUT their own record with role=OWNER, and a
 * MANAGER could overwrite the OWNER's login PIN — both full takeovers of an account
 * that outranks them. Call sites use this to keep a mutation inside the actor's own
 * level.
 *
 * Roles created through the custom-role flow are not in the built-in table and rank
 * below every built-in role, so a custom role can never be used to reach OWNER.
 */
public final class RoleHierarchy {

    /** Any role not in the built-in table (e.g. a custom shift-supervisor role). */
    private static final int UNKNOWN_ROLE_RANK = 50;

    /** No role at all ranks last, so a null role can never outrank a real one. */
    private static final int NO_ROLE_RANK = 99;

    private RoleHierarchy() {
    }

    /** Lower = more privileged. */
    public static int rankOf(String role) {
        if (role == null || role.isBlank()) {
            return NO_ROLE_RANK;
        }
        return switch (role.trim().toUpperCase(Locale.ROOT)) {
            case "OWNER" -> 0;
            case "MANAGER" -> 1;
            case "CASHIER" -> 2;
            case "GROOMER" -> 3;
            default -> UNKNOWN_ROLE_RANK;
        };
    }

    /**
     * Whether {@code actorRole} may act on, or hand out, {@code otherRole}.
     * Equal ranks are allowed (a manager may administer another manager), so the
     * boundary this enforces is "never upwards".
     */
    public static boolean canManage(String actorRole, String otherRole) {
        return rankOf(actorRole) <= rankOf(otherRole);
    }
}
