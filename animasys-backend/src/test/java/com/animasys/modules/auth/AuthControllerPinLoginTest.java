package com.animasys.modules.auth;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.JwtTokenProvider;
import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.finance.repository.BankAccountRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.iam.service.PermissionResolverService;
import com.animasys.modules.iam.service.RoleBootstrapService;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerPinLoginTest {

    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private TenantRepository tenantRepository;
    @Mock private BranchRepository branchRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private BankAccountRepository bankAccountRepository;
    @Mock private PermissionResolverService permissionResolverService;
    @Mock private RoleBootstrapService roleBootstrapService;

    @InjectMocks private AuthController authController;

    private Tenant tenant;
    private Branch branch;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-auth").name("Shop").subdomain("main").build();
        branch = Branch.builder().id("b-auth").tenant(tenant).name("Main").build();
    }

    @Test
    void pinLogin_validPinReturnsJwt() {
        Employee cashier = Employee.builder()
                .id("e-cashier").username("cashier").role("CASHIER")
                .tenant(tenant).branch(branch).passwordHash("hash-cashier").build();

        PinLoginRequest request = new PinLoginRequest();
        request.setPin("2026");

        when(tenantRepository.findBySubdomain("main")).thenReturn(Optional.of(tenant));
        when(employeeRepository.findByTenantId("t-auth")).thenReturn(List.of(cashier));
        when(passwordEncoder.matches("2026", "hash-cashier")).thenReturn(true);

        Authentication auth = new UsernamePasswordAuthenticationToken(
                new UserPrincipal(cashier, List.of("sales.create_sale")), null, List.of());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(tokenProvider.generateToken(auth)).thenReturn("jwt-token");
        when(permissionResolverService.resolvePermissionCodes(cashier)).thenReturn(Set.of("sales.create_sale"));

        ResponseEntity<ApiResponseWrapper<JwtResponse>> response = authController.pinLogin(request);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("jwt-token", response.getBody().getData().getToken());
        assertEquals("t-auth", response.getBody().getData().getTenantId());
    }

    @Test
    void pinLogin_invalidPinThrowsBusinessRuleException() {
        PinLoginRequest request = new PinLoginRequest();
        request.setPin("0000");

        when(tenantRepository.findBySubdomain("main")).thenReturn(Optional.of(tenant));
        when(employeeRepository.findByTenantId("t-auth")).thenReturn(List.of());

        assertThrows(BusinessRuleException.class, () -> authController.pinLogin(request));
    }

    @Test
    void pinLogin_sharedPinPrefersHighestRole() {
        Employee cashier = Employee.builder()
                .id("e-cashier").username("cashier").role("CASHIER")
                .tenant(tenant).branch(branch).passwordHash("hash").build();
        Employee owner = Employee.builder()
                .id("e-owner").username("owner").role("OWNER")
                .tenant(tenant).branch(branch).passwordHash("hash").build();

        PinLoginRequest request = new PinLoginRequest();
        request.setPin("2026");
        request.setTenantId("t-auth");

        when(tenantRepository.existsById("t-auth")).thenReturn(true);
        when(employeeRepository.findByTenantId("t-auth")).thenReturn(List.of(cashier, owner));
        when(passwordEncoder.matches("2026", "hash")).thenReturn(true);

        Authentication auth = new UsernamePasswordAuthenticationToken(
                new UserPrincipal(owner, List.of()), null, List.of());
        when(authenticationManager.authenticate(argThat(token ->
                token instanceof UsernamePasswordAuthenticationToken up
                        && "owner".equals(up.getPrincipal())))).thenReturn(auth);
        when(tokenProvider.generateToken(auth)).thenReturn("owner-jwt");
        when(permissionResolverService.resolvePermissionCodes(owner)).thenReturn(Set.of());

        ResponseEntity<ApiResponseWrapper<JwtResponse>> response = authController.pinLogin(request);

        assertEquals("e-owner", response.getBody().getData().getEmployeeId());
    }

    @Test
    void pinLogin_unknownTenantIdThrows() {
        PinLoginRequest request = new PinLoginRequest();
        request.setPin("2026");
        request.setTenantId("missing");

        when(tenantRepository.existsById("missing")).thenReturn(false);

        assertThrows(BusinessRuleException.class, () -> authController.pinLogin(request));
    }

    @Test
    void needsSetup_returnsTrueWhenNoEmployees() {
        when(employeeRepository.count()).thenReturn(0L);

        ResponseEntity<ApiResponseWrapper<java.util.Map<String, Boolean>>> response = authController.needsSetup();

        assertTrue(response.getBody().getData().get("needsSetup"));
    }
}
