package com.animasys.core.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityConfigCorsTest {

    @Test
    void matchesWhenOriginHostEqualsRequestHost() {
        assertTrue(SecurityConfig.isSameHost("https://amazonpet-production.up.railway.app",
                "amazonpet-production.up.railway.app"));
    }

    @Test
    void ignoresSchemeAndPortDifferences() {
        // Railway forwards over plain HTTP internally, so the Host header carries no scheme,
        // and a non-default port on either side must not defeat the match.
        assertTrue(SecurityConfig.isSameHost("https://example.com:9999", "example.com"));
        assertTrue(SecurityConfig.isSameHost("https://example.com", "example.com:8080"));
    }

    @Test
    void rejectsGenuineCrossSiteOrigin() {
        assertFalse(SecurityConfig.isSameHost("https://evil.example.com",
                "amazonpet-production.up.railway.app"));
    }

    @Test
    void rejectsWhenHostHeaderMissing() {
        assertFalse(SecurityConfig.isSameHost("https://amazonpet-production.up.railway.app", null));
        assertFalse(SecurityConfig.isSameHost("https://amazonpet-production.up.railway.app", ""));
    }

    @Test
    void rejectsMalformedOrigin() {
        assertFalse(SecurityConfig.isSameHost("not-a-uri", "amazonpet-production.up.railway.app"));
    }

    /**
     * The tests above pin the predicate; this one pins the wiring that uses it, which is where
     * the safety of the whole arrangement actually lives.
     *
     * The CORS source reflects the caller's own Origin back as an allowed origin, together with
     * allowCredentials=true — which would be a serious hole if the reflection were
     * unconditional. It is safe only because it fires exclusively when the Origin's host equals
     * this request's own Host header, and page script cannot forge Host: a genuine cross-site
     * request still carries the attacker's real Origin and fails the comparison. That invariant
     * is load-bearing and invisible from the configuration alone, so it is asserted here.
     */
    @Test
    void reflectsAnOriginOnlyWhenItIsTheRequestsOwnHost() {
        SecurityConfig config = new SecurityConfig(null, null, null);
        ReflectionTestUtils.setField(config, "allowedOrigins", "");
        CorsConfigurationSource source = config.corsConfigurationSource();

        MockHttpServletRequest sameOrigin = new MockHttpServletRequest();
        sameOrigin.addHeader(HttpHeaders.ORIGIN, "https://shop.example.com");
        sameOrigin.addHeader(HttpHeaders.HOST, "shop.example.com");
        CorsConfiguration allowed = source.getCorsConfiguration(sameOrigin);
        assertNotNull(allowed);
        assertTrue(allowed.getAllowedOrigins().contains("https://shop.example.com"));
        assertEquals(Boolean.TRUE, allowed.getAllowCredentials());

        MockHttpServletRequest crossSite = new MockHttpServletRequest();
        crossSite.addHeader(HttpHeaders.ORIGIN, "https://evil.example.com");
        crossSite.addHeader(HttpHeaders.HOST, "shop.example.com");
        CorsConfiguration denied = source.getCorsConfiguration(crossSite);
        assertNotNull(denied);
        assertFalse(denied.getAllowedOrigins().contains("https://evil.example.com"));
    }
}
