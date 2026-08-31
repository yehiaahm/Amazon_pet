package com.animasys.core.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.beans.factory.annotation.Value;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final UserPrincipalService userDetailsService;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final PermissionEnforcementFilter permissionEnforcementFilter;

    @Value("${app.cors.allowed-origins:}")
    private String allowedOrigins;

    @Value("${app.security.public-swagger:false}")
    private boolean publicSwagger;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(headers -> headers
                .contentTypeOptions(Customizer.withDefaults())
                .frameOptions(frame -> frame.deny())
                .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"))
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(JsonSecurityHandlers.authenticationEntryPoint())
                .accessDeniedHandler(JsonSecurityHandlers.accessDeniedHandler())
            )
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers("/auth/**").permitAll()
                    .requestMatchers("/actuator/health").permitAll()
                    .requestMatchers("/", "/index.html", "/assets/**", "/*.js", "/*.css", "/*.ico", "/*.png", "/*.svg", "/static/**").permitAll();
                if (publicSwagger) {
                    auth.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll();
                }
                auth.anyRequest().authenticated();
            })
            .authenticationProvider(daoAuthenticationProvider())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(permissionEnforcementFilter, JwtAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Beyond the explicit APP_CORS_ALLOWED_ORIGINS list, also allow whatever origin the
     * request itself came from IF that origin's host matches this request's own Host
     * header — i.e. the browser is loading this same site's own domain (true for every
     * production deploy per this app's same-origin architecture, see backendUrl.ts).
     * This is safe: the Origin header is set by the browser and cannot be forged by page
     * script, so a genuine cross-site request still carries the attacker's real origin and
     * still fails this check — it only ever reflects a domain back at itself. Added after
     * a real incident: a fresh Railway deploy's own domain wasn't in APP_CORS_ALLOWED_ORIGINS
     * yet, which 403'd its own <script type="module"> tags (always CORS-mode, even same-origin)
     * and its own login POST — i.e. the app couldn't talk to itself until that env var was set.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> explicitOrigins = parseAllowedOrigins();
        return request -> {
            CorsConfiguration configuration = new CorsConfiguration();
            List<String> origins = new ArrayList<>(explicitOrigins);
            String requestOrigin = request.getHeader(HttpHeaders.ORIGIN);
            if (requestOrigin != null && isSameHost(requestOrigin, request.getHeader(HttpHeaders.HOST))
                    && origins.stream().noneMatch(requestOrigin::equalsIgnoreCase)) {
                origins.add(requestOrigin);
            }
            configuration.setAllowedOrigins(origins);
            configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
            configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Cache-Control", "X-Requested-With", "X-Request-Id", "Idempotency-Key"));
            configuration.setAllowCredentials(true);
            return configuration;
        };
    }

    /** Compares hostnames only (ignores scheme/port) since TLS-terminating proxies like
     * Railway forward requests to this app over plain HTTP, making request.getScheme()
     * unreliable for reconstructing the browser's real https:// origin. */
    static boolean isSameHost(String origin, String hostHeader) {
        if (hostHeader == null || hostHeader.isBlank()) {
            return false;
        }
        try {
            String originHost = URI.create(origin).getHost();
            String requestHost = hostHeader.split(":", 2)[0].trim();
            return originHost != null && originHost.equalsIgnoreCase(requestHost);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private List<String> parseAllowedOrigins() {
        if (allowedOrigins == null || allowedOrigins.isBlank()) {
            // Desktop UI (localhost:8080) and Vite dev server; avoid empty list → CORS 403
            return List.of(
                    "http://localhost:8080",
                    "http://127.0.0.1:8080",
                    "http://localhost:5173",
                    "http://127.0.0.1:5173"
            );
        }
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toList();
    }

    @Bean
    public DaoAuthenticationProvider daoAuthenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(DaoAuthenticationProvider daoAuthenticationProvider) {
        // Explicit ProviderManager avoids Spring Boot wiring a default provider that returns
        // org.springframework.security.core.userdetails.User instead of UserPrincipal.
        return new ProviderManager(daoAuthenticationProvider);
    }
}
