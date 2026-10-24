package com.animasys.modules.auth;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.controller.EmployeeController;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /auth/pin-login identifies an account by hashing the typed PIN against every employee in the
 * tenant — no username is involved. When two accounts shared a PIN it used to resolve the tie
 * by signing you in as whichever of them held the most authority (pinLoginRoleRank preferred
 * OWNER), so a cashier whose PIN happened to collide with the owner's got the owner's session,
 * and guessing *any* employee's PIN was enough to be handed the most privileged match.
 *
 * Two changes close that: a collision is now refused outright, and the write paths will not
 * create one in the first place.
 */
@AutoConfigureMockMvc
class PinLoginAmbiguityIntegrationTest extends IntegrationTestBase {

    @Autowired private MockMvc mockMvc;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private EmployeeController employeeController;

    private Tenant tenant;
    private Branch branch;
    private Employee owner;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-amb-" + suffix())
                .name("Ambiguity Tenant")
                .subdomain("amb-" + suffix())
                .active(true)
                .build());
        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("b-amb-" + suffix())
                .tenant(tenant).name("Main").build());

        owner = saveEmployee("OWNER", "4321");
    }

    @Test
    void aUniquePinSignsInThatAccount() throws Exception {
        mockMvc.perform(pinLogin("4321"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.role").value("OWNER"));
    }

    /**
     * The escalation. A shared PIN must not resolve to the stronger account — nor to the
     * weaker one, since there is genuinely no way to tell which was meant.
     */
    @Test
    void aSharedPinIsRefusedInsteadOfPickingTheMorePrivilegedAccount() throws Exception {
        saveEmployee("CASHIER", "4321");

        mockMvc.perform(pinLogin("4321"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void anUnknownPinIsStillRejected() throws Exception {
        mockMvc.perform(pinLogin("9999"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    // ─── The write paths will not create a collision ─────────────────────────

    @Test
    void creatingAnEmployeeWithAnAlreadyUsedPinIsRefused() {
        authenticate(owner);

        EmployeeController.EmployeeCreateRequest request = new EmployeeController.EmployeeCreateRequest();
        request.setUsername("clash_" + suffix());
        request.setPassword("4321"); // the owner's PIN
        request.setFullName("Clashing Cashier");
        request.setRole("CASHIER");

        assertThatThrownBy(() -> employeeController.createEmployee(request))
                .isInstanceOf(BusinessRuleException.class);

        assertThat(employeeRepository.findByUsername(request.getUsername())).isEmpty();
    }

    @Test
    void changingAPinToOneAlreadyUsedIsRefused() {
        Employee cashier = saveEmployee("CASHIER", "1111");
        authenticate(owner);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("4321"); // the owner's PIN

        assertThatThrownBy(() -> employeeController.changePassword(cashier.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        // The old PIN must survive a rejected change.
        Employee reloaded = employeeRepository.findById(cashier.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("1111", reloaded.getPasswordHash())).isTrue();
    }

    /** Re-setting an account to the PIN it already has is not a collision with itself. */
    @Test
    void keepingYourOwnPinIsNotTreatedAsACollision() {
        authenticate(owner);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("4321");
        request.setCurrentPassword("4321");

        employeeController.changePassword(owner.getId(), request);

        Employee reloaded = employeeRepository.findById(owner.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("4321", reloaded.getPasswordHash())).isTrue();
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder pinLogin(String pin) {
        return post("/auth/pin-login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pin\":\"" + pin + "\",\"tenantId\":\"" + tenant.getId() + "\"}");
    }

    private Employee saveEmployee(String role, String pin) {
        String id = suffix();
        return employeeRepository.save(Employee.builder()
                .id("e-amb-" + id)
                .tenant(tenant)
                .branch(branch)
                .username(role.toLowerCase() + "_amb_" + id)
                .passwordHash(passwordEncoder.encode(pin))
                .fullName(role + " " + id)
                .email(role.toLowerCase() + "_amb_" + id + "@test.com")
                .role(role)
                .active(true)
                .build());
    }

    private static String suffix() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
