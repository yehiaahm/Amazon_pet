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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
 * End-to-end coverage for the Admin/employee PIN policy bug: the login keypad
 * (Login.tsx) can only ever submit a 4-digit numeric PIN, so every write path
 * that sets an employee's PIN (create employee, change password, first-setup,
 * the /auth/pin-login read path itself) must reject anything else.
 */
@AutoConfigureMockMvc
class EmployeePinPolicyIntegrationTest extends IntegrationTestBase {

    @Autowired private MockMvc mockMvc;
    @Autowired private EmployeeController employeeController;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private Tenant tenant;
    private Branch branch;
    private Employee owner;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-pin-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Pin Policy Tenant")
                .subdomain("pin-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build());
        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("b-pin-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant).name("Main").build());

        owner = Employee.builder()
                .id("e-pin-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("owner_pin_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash(passwordEncoder.encode("1234"))
                .fullName("Owner")
                .email("owner_pin_" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build();
        employeeRepository.save(owner);
    }

    // ─── Change password: reject anything that isn't exactly 4 digits ─────────

    @ParameterizedTest
    @ValueSource(strings = {"123", "12345", "12a4", "12-4", "12 4", ""})
    void changePasswordRejectsAnyPinThatIsNotExactlyFourDigits(String badPin) {
        authenticate(owner);
        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword(badPin);

        assertThatThrownBy(() -> employeeController.changePassword(owner.getId(), request))
                .isInstanceOf(BusinessRuleException.class);

        // The original PIN must still work — the rejected change must not have partially applied.
        Employee reloaded = employeeRepository.findById(owner.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("1234", reloaded.getPasswordHash())).isTrue();
    }

    @Test
    void changePasswordAcceptsAValidFourDigitPinAndOldPinStopsWorking() {
        authenticate(owner);
        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("5678");

        employeeController.changePassword(owner.getId(), request);

        Employee reloaded = employeeRepository.findById(owner.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("5678", reloaded.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("1234", reloaded.getPasswordHash())).isFalse();
    }

    @Test
    void changePasswordPreservesALeadingZeroAsAString() {
        authenticate(owner);
        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("0123");

        employeeController.changePassword(owner.getId(), request);

        Employee reloaded = employeeRepository.findById(owner.getId()).orElseThrow();
        assertThat(passwordEncoder.matches("0123", reloaded.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches("123", reloaded.getPasswordHash())).isFalse();
    }

    // ─── Create employee: same policy applies, so a new account is never born unusable ──

    @Test
    void createEmployeeRejectsAPasswordLongerThanFourDigits() {
        authenticate(owner);
        EmployeeController.EmployeeCreateRequest request = new EmployeeController.EmployeeCreateRequest();
        request.setUsername("new_cashier_" + UUID.randomUUID().toString().substring(0, 8));
        request.setPassword("202600"); // the exact shape of the reported bug, just longer
        request.setFullName("New Cashier");
        request.setRole("CASHIER");

        assertThatThrownBy(() -> employeeController.createEmployee(request))
                .isInstanceOf(BusinessRuleException.class);
    }

    // ─── Full login round trip through the real HTTP endpoint ─────────────────

    @Test
    void loginRoundTrip_changingPinThenLoggingInWithOldAndNewPin() throws Exception {
        authenticate(owner);
        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("5678");
        employeeController.changePassword(owner.getId(), request);

        mockMvc.perform(post("/auth/pin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pin\":\"5678\",\"tenantId\":\"" + tenant.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(post("/auth/pin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pin\":\"1234\",\"tenantId\":\"" + tenant.getId() + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    @ParameterizedTest
    @ValueSource(strings = {"123", "12345", "12a4", "20-26"})
    void pinLoginEndpointRejectsMalformedPinsBeforeEvenQueryingTheDatabase(String badPin) throws Exception {
        mockMvc.perform(post("/auth/pin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pin\":\"" + badPin + "\",\"tenantId\":\"" + tenant.getId() + "\"}"))
                .andExpect(status().isBadRequest());
    }
}
