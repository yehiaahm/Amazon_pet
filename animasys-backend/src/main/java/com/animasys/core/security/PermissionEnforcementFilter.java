package com.animasys.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * Enforces RBAC permissions on mapped API endpoints after JWT authentication.
 * Enforces the same permission codes declared on controllers via {@code @authz.has(...)}.
 */
@Component
@RequiredArgsConstructor
public class PermissionEnforcementFilter extends OncePerRequestFilter {

    private final EndpointPermissionRegistry registry;
    private final AuthorizationChecker authorizationChecker;

    @Value("${app.security.public-swagger:false}")
    private boolean publicSwagger;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (shouldSkip(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !(auth.getPrincipal() instanceof String)) {
            String path = SecurityPathUtils.resolvePath(request);
            Optional<String> required = registry.resolve(request.getMethod(), path);
            if (required.isPresent()) {
                if (!authorizationChecker.has(required.get())) {
                    JsonSecurityHandlers.writeForbidden(response);
                    return;
                }
            } else if (path.startsWith("/v1/")) {
                // Fail closed: any authenticated API endpoint not explicitly
                // registered here has no declared permission and must be denied,
                // rather than silently allowed through to the controller.
                JsonSecurityHandlers.writeForbidden(response);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean shouldSkip(HttpServletRequest request) {
        String path = SecurityPathUtils.resolvePath(request);
        if (SecurityPathUtils.isPublicPath(path)) {
            return true;
        }
        if (publicSwagger && SecurityPathUtils.isSwaggerPath(path)) {
            return true;
        }
        if (path.startsWith("/v1/me/")) {
            return true;
        }
        return path.matches("/v1/employees/[^/]+/password");
    }
}
