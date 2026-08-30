package com.animasys.modules.iam.controller;

import com.animasys.core.audit.AuditLog;
import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
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

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmployeeControllerIntegrationTest extends IntegrationTestBase {

    @Autowired
    private EmployeeController employeeController;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private BranchRepository branchRepository;

    private Tenant tenant;
    private Employee owner;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("Employee Delete Tenant")
                .subdomain("emp-del-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);

        Branch branch = Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Main")
                .address("Cairo")
                .build();
        branchRepository.save(branch);

        owner = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("owner_del_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Owner")
                .email("owner_del_" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build();
        employeeRepository.save(owner);

        bootstrapTenantRoles(tenant);
        authenticate(owner);
    }

    @Test
    void deletingAnEmployeeWithLinkedRecordsFailsWithAClearMessageInsteadOfARawDbError() {
        Employee groomer = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(owner.getBranch())
                .username("bob_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Bob")
                .email("bob_" + UUID.randomUUID() + "@test.com")
                .role("GROOMER")
                .active(true)
                .build();
        employeeRepository.save(groomer);

        auditLogRepository.save(AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .employee(groomer)
                .action("LOGIN")
                .affectedEntity("Employee")
                .entityId(groomer.getId())
                .timestamp(Instant.now())
                .build());

        assertThatThrownBy(() -> employeeController.deleteEmployee(groomer.getId()))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("Bob")
                .hasMessageContaining("سجلات مرتبطة");

        // The employee must still exist - the failed delete must not have left it half-deleted.
        assertThat(employeeRepository.findById(groomer.getId())).isPresent();
    }

    @Test
    void deletingAnEmployeeWithNoLinkedRecordsSucceeds() {
        Employee unused = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(owner.getBranch())
                .username("unused_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Unused Employee")
                .email("unused_" + UUID.randomUUID() + "@test.com")
                .role("CASHIER")
                .active(true)
                .build();
        employeeRepository.save(unused);

        employeeController.deleteEmployee(unused.getId());

        assertThat(employeeRepository.findById(unused.getId())).isEmpty();
    }
}
