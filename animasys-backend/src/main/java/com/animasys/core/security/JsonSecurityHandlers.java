package com.animasys.core.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public final class JsonSecurityHandlers {

    private static final String UNAUTHORIZED_JSON =
            "{\"success\":false,\"message\":\"Authentication required or token invalid\"}";
    private static final String FORBIDDEN_JSON =
            "{\"success\":false,\"message\":\"Access denied: You do not have permissions for this operation\"}";

    private JsonSecurityHandlers() {
    }

    public static AuthenticationEntryPoint authenticationEntryPoint() {
        return JsonSecurityHandlers::writeUnauthorized;
    }

    public static AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> writeForbidden(response);
    }

    public static void writeUnauthorized(HttpServletRequest request, HttpServletResponse response,
                                         AuthenticationException authException) throws IOException {
        writeUnauthorized(response);
    }

    public static void writeForbidden(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(FORBIDDEN_JSON);
    }

    private static void writeUnauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(UNAUTHORIZED_JSON);
    }
}
