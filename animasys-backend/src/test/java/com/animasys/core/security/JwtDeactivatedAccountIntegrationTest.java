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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies that a JWT issued for an employee who is later deactivated stops
 * working immediately, instead of remaining valid until its natural expiry.
 * JwtAuthenticationFilter re-checks UserDetails.isEnabled() on every request.
 */
@AutoConfigureMockMvc
class JwtDeactivatedAccountIntegrationTest extends IntegrationTestBase {

    @Autowired private MockMvc mockMvc;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private Employee employee;

    @BeforeEach
    void setUp() {
        Tenant tenant = tenantRepository.save(Tenant.builder()
                .id("t-deact-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Deactivation Test Tenant")
                .subdomain("deact-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true).build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-deact-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant).name("Branch").build());

        employee = employeeRepository.save(Employee.builder()
                .id("e-deact-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant).branch(branch)
                .username("deact-user-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Deactivation Target")
                .email("deact-" + UUID.randomUUID() + "@example.com")
                .role("OWNER")
                .active(true)
                .build());
    }

    private String mintTokenFor(Employee emp) {
        UserPrincipal principal = new UserPrincipal(emp, List.of());
        Authentication auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        return jwtTokenProvider.generateToken(auth);
    }

    @Test
    void tokenWorksWhileAccountIsActive() throws Exception {
        String token = mintTokenFor(employee);

        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void tokenStopsWorkingImmediatelyAfterDeactivation() throws Exception {
        String token = mintTokenFor(employee);

        // Sanity check: token works before deactivation.
        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        employee.setActive(false);
        employeeRepository.save(employee);

        // Same token, same signature, not expired -- but the account behind it is now
        // deactivated. Before this fix, this would still return 200.
        mockMvc.perform(get("/v1/me/permissions").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }
}
