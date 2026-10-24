package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.Optional;
import java.util.Set;

@Component
@Slf4j
public class JwtTokenProvider {

    // Placeholder values that ship in .env.example / documentation — never valid in a real deployment.
    private static final Set<String> KNOWN_PLACEHOLDER_SECRETS = Set.of(
            "change-me-to-a-long-random-32plus-char-secret"
    );
    private static final int MIN_SECRET_BYTES = 32; // 256 bits, minimum for HS256

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Value("${app.jwt.expiration-ms}")
    private long jwtExpirationMs;

    @PostConstruct
    void validateSecretOrFail() {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException(
                    "app.jwt.secret (JWT_SECRET) is not set. Refusing to start: a missing signing " +
                    "key means tokens cannot be issued or verified safely.");
        }
        if (KNOWN_PLACEHOLDER_SECRETS.contains(jwtSecret.trim())) {
            throw new IllegalStateException(
                    "app.jwt.secret (JWT_SECRET) is still set to the placeholder value from .env.example. " +
                    "Set a unique, random, private secret before starting in any non-local environment.");
        }
        if (jwtSecret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "app.jwt.secret (JWT_SECRET) is too short (" + jwtSecret.length() + " chars). " +
                    "HS256 requires at least " + MIN_SECRET_BYTES + " bytes of key material.");
        }
    }

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Private claim carrying {@code Employee.tokenVersion} at mint time, which
     * {@link JwtAuthenticationFilter} compares against the employee's current value to
     * honour logouts and PIN changes.
     */
    public static final String TOKEN_VERSION_CLAIM = "tv";

    public String generateToken(Authentication authentication) {
        return buildToken(resolveUsername(authentication), resolveTokenVersion(authentication));
    }

    /**
     * Mints a token for an employee entity directly. Needed when the caller has just changed
     * that employee's token version: the principal in the SecurityContext still holds the old
     * value, so going through {@link #generateToken(Authentication)} would stamp the token
     * with a version that has already been revoked, making it dead on arrival.
     */
    public String generateToken(Employee employee) {
        return buildToken(employee.getUsername(), employee.getTokenVersion());
    }

    private String buildToken(String username, int tokenVersion) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .setSubject(username)
                .claim(TOKEN_VERSION_CLAIM, tokenVersion)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    private int resolveTokenVersion(Authentication authentication) {
        if (authentication.getPrincipal() instanceof UserPrincipal principal
                && principal.getEmployee() != null) {
            return principal.getEmployee().getTokenVersion();
        }
        return 0;
    }

    private String resolveUsername(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof UserPrincipal userPrincipal) {
            return userPrincipal.getUsername();
        }
        if (principal instanceof org.springframework.security.core.userdetails.UserDetails details) {
            return details.getUsername();
        }
        if (principal instanceof String s && !s.isBlank()) {
            return s;
        }
        String name = authentication.getName();
        if (name != null && !name.isBlank()) {
            return name;
        }
        throw new IllegalStateException("Cannot resolve username from authentication principal");
    }

    public String getUsernameFromJwt(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();

        return claims.getSubject();
    }

    /**
     * Verifies the signature and expiry and returns the claims in one pass, or empty when the
     * token is malformed, expired or not signed by this deployment's key.
     *
     * Preferred over {@link #validateToken} + {@link #getUsernameFromJwt}, which parse the
     * same token twice, and needed because callers now have to read {@code iat} as well as
     * the subject to apply {@code Employee.tokensValidFrom}.
     */
    public Optional<Claims> parseClaims(String token) {
        try {
            return Optional.of(Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(token)
                    .getBody());
        } catch (Exception ex) {
            log.warn("JWT token validation failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public boolean validateToken(String token) {
        return parseClaims(token).isPresent();
    }
}
