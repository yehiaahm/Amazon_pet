package com.animasys.core.security;

import com.animasys.modules.iam.controller.EmployeeController;
import com.animasys.modules.iam.controller.MeController;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers server-side token revocation (Employee.tokenVersion).
 *
 * Auth is stateless, so before this existed a token could not be taken back: logging out only
 * deleted the browser's copy, and changing a PIN left sessions opened with the old PIN alive
 * for the rest of the token's 24-hour lifetime. These tests drive real HTTP so the check in
 * JwtAuthenticationFilter is what is actually being exercised.
 *
 * The counter replaced a "valid from" timestamp that compared against the token's own
 * issued-at. Because JWT carries that only to whole-second precision, a token minted in the
 * same second as a revocation was indistinguishable from one minted just after it, so logging
 * out moments after logging in revoked nothing. Two tests below pin that behaviour down
 * precisely because they are what caught it.
 */
@AutoConfigureMockMvc
class TokenRevocationIntegrationTest extends IntegrationTestBase {

    @Autowired private MockMvc mockMvc;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private MeController meController;
    @Autowired private EmployeeController employeeController;

    private Tenant tenant;
    private Employee owner;
    private Employee cashier;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-rev-" + suffix())
                .name("Revocation Tenant")
                .subdomain("rev-" + suffix())
                .active(true)
                .build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-rev-" + suffix())
                .tenant(tenant).name("Main").build());

        owner = saveEmployee(branch, "OWNER", "1111");
        cashier = saveEmployee(branch, "CASHIER", "2222");
    }

    // ─── The filter honours the counter ──────────────────────────────────────

    @Test
    void aTokenIsAcceptedWhileNothingHasBeenRevoked() throws Exception {
        String token = login(owner);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void aTokenIsRejectedOnceTheCounterMoves() throws Exception {
        String token = login(owner);

        bumpTokenVersion(owner);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenMintedAfterARevocationWorks() throws Exception {
        bumpTokenVersion(owner);

        String freshToken = login(owner);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + freshToken))
                .andExpect(status().isOk());
    }

    /**
     * Revoking and signing straight back in must leave the new token working. The timestamp
     * design could only get this right by being lenient about same-second tokens, which is
     * exactly what made logout fail to revoke.
     */
    @Test
    void signingBackInImmediatelyAfterARevocationWorks() throws Exception {
        login(owner);
        bumpTokenVersion(owner);

        String freshToken = login(owner);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + freshToken))
                .andExpect(status().isOk());
    }

    // ─── Logout revokes ──────────────────────────────────────────────────────

    @Test
    void logoutBumpsTheCounter() {
        authenticate(owner);
        int before = reload(owner).getTokenVersion();

        meController.logout();

        assertThat(reload(owner).getTokenVersion()).isEqualTo(before + 1);
    }

    /**
     * The regression case: login and logout land in the same second here, which the previous
     * timestamp comparison could not tell apart, so the token survived its own logout.
     */
    @Test
    void aTokenStopsWorkingImmediatelyAfterLoggingOutWithIt() throws Exception {
        String token = login(owner);

        mockMvc.perform(post("/v1/me/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/v1/me/logout"))
                .andExpect(status().isUnauthorized());
    }

    // ─── A PIN change ends existing sessions ─────────────────────────────────

    /** Also a same-second case: the cashier's token is minted moments before the reset. */
    @Test
    void anAdminResetEvictsTheTargetAndReturnsNoReplacementToken() throws Exception {
        String cashierToken = login(cashier);
        authenticate(owner);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");
        var response = employeeController.changePassword(cashier.getId(), request).getBody();

        // The eviction is the point of an admin reset, so there is nothing to hand back.
        assertThat(response).isNotNull();
        assertThat(response.getData().getToken()).isNull();

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + cashierToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void changingYourOwnPinHandsBackAWorkingReplacementToken() throws Exception {
        authenticate(owner);

        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");
        request.setCurrentPassword("1111");
        var response = employeeController.changePassword(owner.getId(), request).getBody();

        assertThat(response).isNotNull();
        String replacement = response.getData().getToken();
        assertThat(replacement).isNotBlank();

        // Without this the caller would be signed out by their own successful request.
        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + replacement))
                .andExpect(status().isOk());
    }

    @Test
    void aTokenFromBeforeYourOwnPinChangeStopsWorking() throws Exception {
        String oldToken = login(owner);

        authenticate(owner);
        EmployeeController.PasswordChangeRequest request = new EmployeeController.PasswordChangeRequest();
        request.setNewPassword("9999");
        request.setCurrentPassword("1111");
        employeeController.changePassword(owner.getId(), request);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + oldToken))
                .andExpect(status().isUnauthorized());
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    /** Logs in over real HTTP so the returned token is one the app actually minted. */
    private String login(Employee employee) throws Exception {
        String pin = employee.getId().equals(owner.getId()) ? "1111" : "2222";
        String body = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + employee.getUsername() + "\",\"password\":\"" + pin + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        int start = body.indexOf("\"token\":\"") + 9;
        return body.substring(start, body.indexOf('"', start));
    }

    /** Stands in for any revocation — logout, PIN change — without going through one. */
    private void bumpTokenVersion(Employee employee) {
        Employee stored = reload(employee);
        stored.setTokenVersion(stored.getTokenVersion() + 1);
        employeeRepository.save(stored);
    }

    private Employee saveEmployee(Branch branch, String role, String pin) {
        String id = suffix();
        return employeeRepository.save(Employee.builder()
                .id("e-rev-" + id)
                .tenant(tenant)
                .branch(branch)
                .username(role.toLowerCase() + "_rev_" + id)
                .passwordHash(passwordEncoder.encode(pin))
                .fullName(role + " " + id)
                .email(role.toLowerCase() + "_rev_" + id + "@test.com")
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
