package com.animasys.core.security;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Set;

public final class SecurityPathUtils {

    private static final Set<String> PUBLIC_PREFIXES = Set.of(
            "/auth/",
            "/actuator/health",
            "/v3/api-docs",
            "/swagger-ui",
            "/static/",
            "/assets/"
    );

    private SecurityPathUtils() {
    }

    public static String resolvePath(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = stripContextPath(request.getRequestURI(), request.getContextPath());
        }
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path == null || path.isBlank() ? "/" : path;
    }

    public static boolean isPublicPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        if (isStaticAsset(path)) {
            return true;
        }
        return PUBLIC_PREFIXES.stream().anyMatch(path::startsWith);
    }

    public static boolean isSwaggerPath(String path) {
        return path != null && (path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui"));
    }

    /**
     * Only a file sitting at the site root counts, which is what SecurityConfig's
     * {@code "/*.js"}-style permitAll matchers actually allow (Ant {@code *} does not span a
     * {@code /}). Nested assets stay reachable through the {@code /assets/} and {@code /static/}
     * prefixes above.
     *
     * The extension checks used to be applied to the whole path, so <em>any</em> URL ending in
     * one of them — {@code /v1/products/anything.js} — was treated as public and skipped both
     * {@link JwtAuthenticationFilter} and {@link PermissionEnforcementFilter}. Spring's own
     * {@code anyRequest().authenticated()} still rejected those requests, so it was not
     * exploitable, but the two layers disagreeing about what "public" means is one broadened
     * matcher away from being an authentication bypass.
     */
    private static boolean isStaticAsset(String path) {
        if (path.equals("/") || path.equals("/index.html")) {
            return true;
        }
        if (path.indexOf('/', 1) >= 0) {
            return false;
        }
        return path.endsWith(".js")
                || path.endsWith(".css")
                || path.endsWith(".ico")
                || path.endsWith(".png")
                || path.endsWith(".svg");
    }

    private static String stripContextPath(String uri, String contextPath) {
        if (uri == null) {
            return "/";
        }
        if (contextPath != null && !contextPath.isBlank() && uri.startsWith(contextPath)) {
            String stripped = uri.substring(contextPath.length());
            return stripped.isBlank() ? "/" : stripped;
        }
        return uri;
    }
}
