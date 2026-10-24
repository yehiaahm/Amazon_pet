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

    @Test
    void treatsRootLevelBundleFilesAsPublic() {
        assertThat(SecurityPathUtils.isPublicPath("/")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/main.js")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/styles.css")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/favicon.ico")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/logo.png")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/vite.svg")).isTrue();
    }

    @Test
    void keepsNestedViteAssetsPublic() {
        assertThat(SecurityPathUtils.isPublicPath("/assets/index-a1b2c3.js")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/assets/index-a1b2c3.css")).isTrue();
        assertThat(SecurityPathUtils.isPublicPath("/static/img/logo.png")).isTrue();
    }

    /**
     * The extension test must not apply to nested paths: an API URL that merely ends in an
     * asset extension is not a static file, and treating it as one skipped both security
     * filters for that request.
     */
    @Test
    void doesNotTreatAnApiPathEndingInAnAssetExtensionAsPublic() {
        assertThat(SecurityPathUtils.isPublicPath("/v1/products/evil.js")).isFalse();
        assertThat(SecurityPathUtils.isPublicPath("/v1/employees/e-1.png")).isFalse();
        assertThat(SecurityPathUtils.isPublicPath("/v1/admin/factory-reset.css")).isFalse();
        assertThat(SecurityPathUtils.isPublicPath("/v1/sales/x.svg")).isFalse();
        assertThat(SecurityPathUtils.isPublicPath("/v1/roles/index.html")).isFalse();
    }
}
