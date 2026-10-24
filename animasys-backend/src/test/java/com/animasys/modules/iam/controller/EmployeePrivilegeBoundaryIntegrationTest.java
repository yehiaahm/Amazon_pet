package com.animasys.modules.iam.controller;

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
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Privilege-boundary coverage for the employee admin endpoints.
 *
 * {@code employees.edit} / {@code employees.add} are single permissions and MANAGER holds
 * both, so RBAC alone cannot stop a manager from reaching the owner's record. Three ways
 * out of a MANAGER account and into the OWNER's used to be open:
 *   - PUT /v1/employees/{id} with role=OWNER (the role came straight off the request body),
 *   - PUT /v1/employees/{ownerId}/password (the body check only asked for "OWNER or MANAGER"),
 *   - POST /v1/employees with role=OWNER, then log in as the account just minted.
 * Each is now bounded by {@link com.animasys.core.security.RoleHierarchy}, and a self PIN
 * change has to re-prove the current PIN.
 */
class EmployeePrivilegeBoundaryIntegrationTest extends IntegrationTestBase {

    @Autowired private EmployeeController employeeController;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private Tenant tenant;
    private Branch branch;
    private Employee owner;
    private Employee manager;
    private Employee cashier;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-priv-" + suffix())
                .name("Privilege Boundary Tenant")
                .subdomain("priv-" + suffix())
                .active(true)
                .build());
        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("b-priv-" + suffix())
                .tenant(tenant).name("Main").build());

        owner = saveEmployee("OWNER", "1111");
        manager = saveEmployee("MANAGER", "2222");
        cashier = saveEmployee("CASHIER", "3333");
    }

    // ─── Role grants may never point upwards ─────────────────────────────────

    @Test
    void managerCannotPromoteACashierToOwner() {
        authenticate(manager);

        EmployeeController.EmployeeUpdateRequest request = new EmployeeController.EmployeeUpdateRequest();
        request.setRole("OWNER");

        assertThatThrownBy(() -> employeeController.updateEmployee(cashier.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(reload(cashier).getRole()).isEqualTo("CASHIER");
    }

    @Test
    void managerCannotPromoteThemselfToOwner() {
        authenticate(manager);

        EmployeeController.EmployeeUpdateRequest request = new EmployeeController.EmployeeUpdateRequest();
        request.setRole("OWNER");

        assertThatThrownBy(() -> employeeController.updateEmployee(manager.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(reload(manager).getRole()).isEqualTo("MANAGER");
    }

    @Test
    void managerCannotCreateAnOwnerAccount() {
        authenticate(manager);

        EmployeeController.EmployeeCreateRequest request = new EmployeeController.EmployeeCreateRequest();
        request.setUsername("minted_owner_" + suffix());
        request.setPassword("4321");
        request.setFullName("Minted Owner");
        request.setRole("OWNER");

        assertThatThrownBy(() -> employeeController.createEmployee(request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(employeeRepository.findByUsername(request.getUsername())).isEmpty();
    }

    @Test
    void ownerCanStillPromoteACashierToManager() {
        authenticate(owner);

        EmployeeController.EmployeeUpdateRequest request = new EmployeeController.EmployeeUpdateRequest();
        request.setRole("MANAGER");

        employeeController.updateEmployee(cashier.getId(), request);

        assertThat(reload(cashier).getRole()).isEqualTo("MANAGER");
    }

    /** Self-demotion stays allowed — the custom-role flow in Employees.tsx relies on it. */
    @Test
    void managerCanAssignThemselvesALessPrivilegedCustomRole() {
        authenticate(manager);

        EmployeeController.EmployeeUpdateRequest request = new EmployeeController.EmployeeUpdateRequest();
        request.setRole("SHIFT_SUPERVISOR");

        employeeController.updateEmployee(manager.getId(), request);

        assertThat(reload(manager).getRole()).isEqualTo("SHIFT_SUPERVISOR");
    }

    // ─── A more privileged record is off limits entirely ─────────────────────

    @Test
    void managerCannotEditTheOwnerRecord() {
        authenticate(manager);

        EmployeeController.EmployeeUpdateRequest request = new EmployeeController.EmployeeUpdateRequest();
        request.setFullName("Hijacked");
        request.setActive(false);

        assertThatThrownBy(() -> employeeController.updateEmployee(owner.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        Employee reloaded = reload(owner);
        assertThat(reloaded.getFullName()).isNotEqualTo("Hijacked");
        assertThat(reloaded.isActive()).isTrue();
    }

    @Test
    void managerCannotResetTheOwnerPin() {
        authenticate(manager);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");

        assertThatThrownBy(() -> employeeController.changePassword(owner.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        // The owner's own PIN must still be the only one that works.
        Employee reloaded = reload(owner);
        assertThat(passwordEncoder.matches("1111", reloaded.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("9999", reloaded.getPasswordHash())).isFalse();
    }

    @Test
    void ownerCanStillResetALowerRankedPin() {
        authenticate(owner);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");

        employeeController.changePassword(cashier.getId(), request);

        assertThat(passwordEncoder.matches("9999", reload(cashier).getPasswordHash())).isTrue();
    }

    // ─── Changing your own PIN re-proves you know it ──────────────────────────

    @Test
    void selfPinChangeIsRejectedWithoutTheCurrentPin() {
        authenticate(manager);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");

        assertThatThrownBy(() -> employeeController.changePassword(manager.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(passwordEncoder.matches("2222", reload(manager).getPasswordHash())).isTrue();
    }

    @Test
    void selfPinChangeIsRejectedWithAWrongCurrentPin() {
        authenticate(manager);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");
        request.setCurrentPassword("0000");

        assertThatThrownBy(() -> employeeController.changePassword(manager.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(passwordEncoder.matches("2222", reload(manager).getPasswordHash())).isTrue();
    }

    @Test
    void selfPinChangeSucceedsWithTheCorrectCurrentPin() {
        authenticate(manager);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");
        request.setCurrentPassword("2222");

        employeeController.changePassword(manager.getId(), request);

        Employee reloaded = reload(manager);
        assertThat(passwordEncoder.matches("9999", reloaded.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("2222", reloaded.getPasswordHash())).isFalse();
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private Employee saveEmployee(String role, String pin) {
        String id = suffix();
        return employeeRepository.save(Employee.builder()
                .id("e-priv-" + id)
                .tenant(tenant)
                .branch(branch)
                .username(role.toLowerCase() + "_priv_" + id)
                .passwordHash(passwordEncoder.encode(pin))
                .fullName(role + " " + id)
                .email(role.toLowerCase() + "_priv_" + id + "@test.com")
                .role(role)
                .active(true)
                .build());
    }

    private Employee reload(Employee employee) {
        return employeeRepository.findById(employee.getId()).orElseThrow();
    }

    private static String suffix() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
