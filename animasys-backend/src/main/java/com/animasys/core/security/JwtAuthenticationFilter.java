package com.animasys.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.animasys.core.config.RequestCorrelationFilter;
import com.animasys.modules.iam.domain.Employee;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final UserPrincipalService userPrincipalService;

    @Value("${app.security.public-swagger:false}")
    private boolean publicSwagger;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = SecurityPathUtils.resolvePath(request);
        if (SecurityPathUtils.isPublicPath(path)) {
            return true;
        }
        return publicSwagger && SecurityPathUtils.isSwaggerPath(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            String jwt = getJwtFromRequest(request);
            Optional<Claims> claims = StringUtils.hasText(jwt)
                    ? tokenProvider.parseClaims(jwt)
                    : Optional.empty();

            if (claims.isPresent()) {
                String username = claims.get().getSubject();

                UserDetails userDetails = userPrincipalService.loadUserByUsername(username);

                if (!userDetails.isEnabled() || !userDetails.isAccountNonLocked()) {
                    // Re-checked on every request (not just at login) so deactivating an
                    // employee takes effect immediately instead of waiting for their
                    // already-issued JWT to expire naturally.
                    log.warn("JWT rejected for deactivated account [{}]: {}",
                            MDC.get(RequestCorrelationFilter.MDC_REQUEST_ID), username);
                } else if (isRevoked(claims.get(), userDetails)) {
                    log.warn("JWT rejected as revoked [{}]: {}",
                            MDC.get(RequestCorrelationFilter.MDC_REQUEST_ID), username);
                } else {
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    SecurityContextHolder.getContext().setAuthentication(authentication);

                    if (userDetails instanceof UserPrincipal principal && principal.getEmployee() != null) {
                        Employee employee = principal.getEmployee();
                        if (employee.getTenant() != null && employee.getTenant().getId() != null) {
                            MDC.put("tenantId", employee.getTenant().getId());
                        }
                        if (employee.getId() != null) {
                            MDC.put("employeeId", employee.getId());
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("JWT authentication failed [{}]: {}", MDC.get(RequestCorrelationFilter.MDC_REQUEST_ID), ex.getMessage());
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove("tenantId");
            MDC.remove("employeeId");
        }
    }

    /**
     * Refuses a token whose revocation counter no longer matches the employee's, which is how
     * logout and PIN changes end sessions that are already running (see Employee.tokenVersion).
     *
     * A token predating this feature carries no counter; it is read as version 0, so such
     * tokens keep working until the account's first revocation bumps it past 0. That only
     * matters for the tokens already in circulation at deploy time, and they expire within a
     * day anyway.
     */
    private static boolean isRevoked(Claims claims, UserDetails userDetails) {
        if (!(userDetails instanceof UserPrincipal principal) || principal.getEmployee() == null) {
            return false;
        }
        Integer tokenVersion = claims.get(JwtTokenProvider.TOKEN_VERSION_CLAIM, Integer.class);
        int presented = tokenVersion != null ? tokenVersion : 0;
        return presented != principal.getEmployee().getTokenVersion();
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
