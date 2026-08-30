package com.animasys.core.security;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class TenantIsolationRegressionTest extends IntegrationTestBase {

    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;

    private Employee employee;
    private Tenant tenant;

    @BeforeEach
    void seedEmployee() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-iso-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Isolation Tenant")
                .subdomain("iso-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("br-iso-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main")
                .address("Cairo")
                .build());

        employee = employeeRepository.save(Employee.builder()
                .id("e-iso-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("iso-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("hash")
                .fullName("Isolation User")
                .email("iso-" + UUID.randomUUID() + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());
    }

    @Test
    void requireTenantIdReturnsAuthenticatedEmployeeTenant() {
        authenticate(employee);

        assertEquals(tenant.getId(), SecurityUtils.requireTenantId());
    }

    @Test
    void requireTenantIdFailsWhenSecurityContextMissing() {
        assertThrows(AccessDeniedException.class, SecurityUtils::requireTenantId);
    }
}
