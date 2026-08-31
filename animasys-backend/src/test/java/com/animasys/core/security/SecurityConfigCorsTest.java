package com.animasys.core.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
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
}
