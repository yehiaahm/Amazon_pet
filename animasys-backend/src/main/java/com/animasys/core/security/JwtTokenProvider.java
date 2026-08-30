package com.animasys.core.security;

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

    public String generateToken(Authentication authentication) {
        String username = resolveUsername(authentication);
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationMs);

        return Jwts.builder()
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
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

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(token);
            return true;
        } catch (Exception ex) {
            log.warn("JWT token validation failed: {}", ex.getMessage());
        }
        return false;
    }
}
