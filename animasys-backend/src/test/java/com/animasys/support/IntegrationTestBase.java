package com.animasys.support;

import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.service.PermissionResolverService;
import com.animasys.modules.iam.service.RoleBootstrapService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    @Autowired
    protected PermissionResolverService permissionResolverService;

    @Autowired
    protected RoleBootstrapService roleBootstrapService;

    @BeforeEach
    void baseSetUp() {
        TestSecuritySupport.clear();
    }

    @AfterEach
    void baseTearDown() {
        TestSecuritySupport.clear();
    }

    protected void bootstrapTenantRoles(Tenant tenant) {
        roleBootstrapService.ensureSystemRolesForTenant(tenant);
    }

    protected void authenticate(Employee employee) {
        TestSecuritySupport.authenticate(employee, permissionResolverService);
    }
}
