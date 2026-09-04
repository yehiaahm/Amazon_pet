package com.animasys.modules.auth;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.JwtTokenProvider;
import com.animasys.core.security.LoginRateLimiter;
import com.animasys.core.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import com.animasys.modules.finance.domain.BankAccount;
import com.animasys.modules.finance.repository.BankAccountRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.iam.service.PermissionResolverService;
import com.animasys.modules.iam.service.RoleBootstrapService;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final EmployeeRepository employeeRepository;
    private final PasswordEncoder passwordEncoder;
    private final TenantRepository tenantRepository;

    /**
     * Only trust X-Forwarded-For when this deployment actually sits behind a
     * reverse proxy that sets it. Left off by default: with no proxy, an
     * unauthenticated caller could set this header themselves and spoof a
     * different rate-limit bucket per request, defeating login throttling.
     */
    @Value("${app.security.trust-proxy-headers:false}")
    private boolean trustProxyHeaders;
    private final BranchRepository branchRepository;
    private final WarehouseRepository warehouseRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PermissionResolverService permissionResolverService;
    private final RoleBootstrapService roleBootstrapService;
    private final LoginRateLimiter loginRateLimiter;

    @PostMapping("/login")
    public ResponseEntity<ApiResponseWrapper<JwtResponse>> authenticateEmployee(
            @Valid @RequestBody LoginRequest loginRequest, HttpServletRequest httpRequest) {
        String rateLimitKey = clientKey(httpRequest);
        loginRateLimiter.checkAllowed(rateLimitKey);

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            loginRequest.getUsername(),
                            loginRequest.getPassword()
                    )
            );
        } catch (org.springframework.security.core.AuthenticationException ex) {
            loginRateLimiter.recordFailure(rateLimitKey);
            throw ex;
        }
        loginRateLimiter.recordSuccess(rateLimitKey);

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);

        Employee employee = resolveEmployee(authentication, loginRequest.getUsername());

        JwtResponse jwtResponse = buildJwtResponse(jwt, employee);

        return ResponseEntity.ok(ApiResponseWrapper.success(jwtResponse, "Employee authenticated successfully"));
    }

    @PostMapping("/pin-login")
    public ResponseEntity<ApiResponseWrapper<JwtResponse>> pinLogin(
            @Valid @RequestBody PinLoginRequest pinRequest, HttpServletRequest httpRequest) {
        String rateLimitKey = clientKey(httpRequest);
        loginRateLimiter.checkAllowed(rateLimitKey);

        String tenantId = resolvePinLoginTenantId(pinRequest);
        List<Employee> employees = employeeRepository.findByTenantId(tenantId);
        Employee matched = null;
        for (Employee emp : employees) {
            if (emp.getPasswordHash() == null
                    || !passwordEncoder.matches(pinRequest.getPin(), emp.getPasswordHash())) {
                continue;
            }
            if (matched == null || pinLoginRoleRank(emp.getRole()) < pinLoginRoleRank(matched.getRole())) {
                matched = emp;
            }
        }
        if (matched == null) {
            loginRateLimiter.recordFailure(rateLimitKey);
            throw new BusinessRuleException("رمز الدخول السري غير صحيح!");
        }
        String matchedUsername = matched.getUsername();

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(matchedUsername, pinRequest.getPin())
            );
        } catch (org.springframework.security.core.AuthenticationException ex) {
            loginRateLimiter.recordFailure(rateLimitKey);
            throw ex;
        }
        loginRateLimiter.recordSuccess(rateLimitKey);

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);

        Employee employee = resolveEmployee(authentication, matchedUsername);

        JwtResponse jwtResponse = buildJwtResponse(jwt, employee);

        return ResponseEntity.ok(ApiResponseWrapper.success(jwtResponse, "PIN authentication successful"));
    }

    /**
     * Rate-limit key: client IP. Defaults to the raw socket address, which is
     * only spoofable by controlling the TCP connection itself. If this
     * deployment runs behind a trusted reverse proxy, set
     * APP_SECURITY_TRUST_PROXY_HEADERS=true so the real client IP (first hop
     * in X-Forwarded-For) is used instead of the proxy's own address.
     */
    private String clientKey(HttpServletRequest request) {
        if (trustProxyHeaders) {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            if (forwardedFor != null && !forwardedFor.isBlank()) {
                return forwardedFor.split(",")[0].trim();
            }
        }
        return request.getRemoteAddr();
    }

    // ─── FIRST-RUN SETUP ─────────────────────────────────────────────────────────

    /** Returns whether the system needs initial setup (no employees exist yet). */
    @GetMapping("/needs-setup")
    public ResponseEntity<ApiResponseWrapper<Map<String, Boolean>>> needsSetup() {
        boolean needsSetup = employeeRepository.count() == 0;
        return ResponseEntity.ok(ApiResponseWrapper.success(Map.of("needsSetup", needsSetup), "OK"));
    }

    /**
     * First-run wizard endpoint.
     * Creates the tenant, branch, warehouse, bank account, and OWNER employee.
     * Only works when the database has no employees — returns 409 if already set up.
     */
    @PostMapping("/first-setup")
    public ResponseEntity<ApiResponseWrapper<JwtResponse>> firstSetup(@Valid @RequestBody FirstSetupRequest req) {
        if (employeeRepository.count() > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponseWrapper.error("النظام مُهيَّأ بالفعل. يرجى تسجيل الدخول."));
        }

        // 1. Create Tenant (the shop)
        Tenant tenant = Tenant.builder()
                .id("t-1")
                .name(req.getShopName())
                .subdomain("main")
                .active(true)
                .build();
        tenantRepository.save(tenant);

        roleBootstrapService.ensureSystemRolesForTenant(tenant);

        // 2. Create Branch
        Branch branch = Branch.builder()
                .id("b-1")
                .tenant(tenant)
                .name(req.getShopName())
                .address("")
                .phone("")
                .build();
        branchRepository.save(branch);

        // 3. Create default Warehouse. Only one — a second "wh-main" warehouse used to be
        // created here too, but this app models a single stock location per shop; having two
        // let stock silently land somewhere POS never sells from (see V56__Retire_Backroom_Warehouse).
        warehouseRepository.save(Warehouse.builder().id("wh-shelf").branch(branch).name("رف المحل").code("WH-SHELF").build());

        // 4. Create Bank Account
        bankAccountRepository.save(BankAccount.builder().id("ba-1").tenant(tenant).name("الحساب الرئيسي").balance(BigDecimal.ZERO).build());

        // 5. Create OWNER employee
        String username = "owner";
        Employee owner = Employee.builder()
                .id("e-1")
                .tenant(tenant)
                .branch(branch)
                .username(username)
                .passwordHash(passwordEncoder.encode(req.getPin()))
                .fullName(req.getOwnerFullName())
                .email(username + "@" + "amazonpet.local")
                .role("OWNER")
                .active(true)
                .build();
        employeeRepository.save(owner);

        // 6. Auto-login the new owner
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, req.getPin())
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);

        JwtResponse jwtResponse = buildJwtResponse(jwt, owner);

        return ResponseEntity.ok(ApiResponseWrapper.success(jwtResponse, "تم إعداد النظام بنجاح! مرحباً بك."));
    }

    private JwtResponse buildJwtResponse(String jwt, Employee employee) {
        java.util.List<String> permissions = new java.util.ArrayList<>(
                permissionResolverService.resolvePermissionCodes(employee));
        return JwtResponse.builder()
                .token(jwt)
                .employeeId(employee.getId())
                .username(employee.getUsername())
                .fullName(employee.getFullName())
                .role(employee.getRole())
                .tenantId(employee.getTenant().getId())
                .branchId(employee.getBranch().getId())
                .permissions(permissions)
                .build();
    }

    private Employee resolveEmployee(Authentication authentication, String username) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof UserPrincipal userPrincipal) {
            Employee employee = userPrincipal.getEmployee();
            if (employee != null && employee.getTenant() != null && employee.getBranch() != null) {
                return employee;
            }
        }
        return employeeRepository.findByUsername(username)
                .orElseThrow(() -> new BusinessRuleException("تعذر تحميل بيانات الموظف بعد تسجيل الدخول"));
    }

    /** Lower rank = preferred when several employees share the same PIN (desktop shop login). */
    private static int pinLoginRoleRank(String role) {
        if (role == null) {
            return 99;
        }
        return switch (role) {
            case "OWNER" -> 0;
            case "MANAGER" -> 1;
            case "CASHIER" -> 2;
            case "GROOMER" -> 3;
            default -> 50;
        };
    }

    /**
     * PIN login is tenant-scoped. Optional {@code tenantId} in the request; otherwise resolves
     * the default desktop tenant ({@code main} subdomain).
     */
    private String resolvePinLoginTenantId(PinLoginRequest request) {
        if (request.getTenantId() != null && !request.getTenantId().isBlank()) {
            String tenantId = request.getTenantId().trim();
            if (!tenantRepository.existsById(tenantId)) {
                throw new BusinessRuleException("Tenant not found: " + tenantId);
            }
            return tenantId;
        }
        return tenantRepository.findBySubdomain("main")
                .map(Tenant::getId)
                .orElseThrow(() -> new BusinessRuleException("Unable to resolve tenant for PIN login"));
    }
}
