package com.animasys.core.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityPathUtilsTest {

    @Test
    void normalizesTrailingSlash() {
        assertThat(SecurityPathUtils.isPublicPath("/auth/login")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/v1/products")).isFalse();
        assertThat(SecurityPathUtils.isPublicPath("/index.html")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/actuator/health")).isTrue();
    }
}
