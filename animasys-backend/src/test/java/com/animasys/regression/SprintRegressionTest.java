package com.animasys.regression;

import com.animasys.core.security.AuthorizationChecker;
import com.animasys.core.security.SecurityUtils;
import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.config.AiStartupValidator;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.inventory.dto.ChunkImportRequest;
import com.animasys.modules.inventory.service.ImportService;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Sprint regression guardrails — documents fixed defects from Sprint 2A/3A/3B.
 */
@SpringBootTest
@ActiveProfiles("test")
class SprintRegressionTest extends IntegrationTestBase {

    @Autowired private AuthorizationChecker authorizationChecker;
    @Autowired private ImportService importService;

    @Test
    @DisplayName("Sprint 2A RBAC: authz denies endpoint permission when PERM_ authority missing")
    void sprint2A_authzDeniesWithoutPermission() {
        Tenant tenant = Tenant.builder().id("t-rbac").name("RBAC").subdomain("rbac").build();
        Employee employee = Employee.builder()
                .id("e-rbac")
                .username("cashier")
                .fullName("Cashier")
                .role("CASHIER")
                .tenant(tenant)
                .active(true)
                .build();

        UserPrincipal principal = new UserPrincipal(employee, List.of("inventory.view"));
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertFalse(authorizationChecker.has("sales.create_sale"));
        assertTrue(authorizationChecker.has("inventory.view"));
    }

    @Test
    @DisplayName("Sprint 3B permissions: ImportService.processChunk requires SecurityContext tenant")
    void sprint3B_importServiceRequiresSecurityContext() {
        SecurityContextHolder.clearContext();

        ChunkImportRequest chunk = new ChunkImportRequest();
        chunk.setEmployeeId("any-employee");
        chunk.setItems(Collections.emptyList());

        assertThrows(AccessDeniedException.class,
                () -> importService.processChunk("missing-session", chunk));
    }

    @Test
    @DisplayName("Sprint 3A AI fail-closed: production profile rejects mock mode at startup")
    void sprint3A_aiStartupValidatorBlocksMockInProduction() {
        AiProperties properties = new AiProperties();
        properties.setMockEnabled(true);
        properties.getGemini().setApiKey("configured-key");

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("production");

        AiStartupValidator validator = new AiStartupValidator(properties, environment);
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> validator.run(null));
        assertTrue(ex.getMessage().contains("mock mode"));
    }

    @Test
    @DisplayName("Sprint 3B permissions: SecurityUtils.requirePermission enforces PERM_ authorities")
    void sprint3B_requirePermissionEnforcesAuthorities() {
        Tenant tenant = Tenant.builder().id("t-perm").name("Perm").subdomain("perm").build();
        Employee employee = Employee.builder()
                .id("e-perm")
                .username("perm_user")
                .fullName("Perm User")
                .role("MANAGER")
                .tenant(tenant)
                .active(true)
                .build();

        UserPrincipal principal = new UserPrincipal(employee, List.of("settings.factory_reset"));
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                principal.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertDoesNotThrow(() -> SecurityUtils.requirePermission("settings.factory_reset"));
        assertThrows(AccessDeniedException.class,
                () -> SecurityUtils.requirePermission("employees.delete"));
    }
}
