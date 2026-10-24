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
import lombok.extern.slf4j.Slf4j;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    /**
     * Budget for the whole tenant's PIN keypad in one window, deliberately well above the
     * per-address limit: every member of staff shares this bucket, so ten mistyped PINs in
     * fifteen minutes is an ordinary busy afternoon rather than an attack. It raises the cost
     * of walking the PIN space from many addresses without locking a shop out of its own till.
     *
     * It raises cost; it does not make a short numeric PIN safe. That is what widening
     * {@link com.animasys.core.security.PinPolicy} to allow longer PINs is for.
     */
    private static final int MAX_PIN_LOGIN_ATTEMPTS_PER_TENANT = 60;

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
        // Throttled per account as well as per source address. On its own the IP bucket is
        // bypassed by simply spreading guesses over several addresses, which against a
        // four-to-ten digit PIN is the whole attack; the account bucket does not care where
        // the attempts come from. A correct password clears it, so the only person who can be
        // locked out by their own typing is the account holder.
        String accountKey = accountKey(loginRequest.getUsername());
        loginRateLimiter.checkAllowed(rateLimitKey);
        loginRateLimiter.checkAllowed(accountKey);

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
            loginRateLimiter.recordFailure(accountKey);
            throw ex;
        }
        loginRateLimiter.recordSuccess(rateLimitKey);
        loginRateLimiter.recordSuccess(accountKey);

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
        String tenantKey = pinLoginTenantKey(tenantId);
        loginRateLimiter.checkAllowed(tenantKey, MAX_PIN_LOGIN_ATTEMPTS_PER_TENANT);

        List<Employee> employees = employeeRepository.findByTenantId(tenantId);
        List<Employee> matches = new ArrayList<>();
        for (Employee emp : employees) {
            if (emp.getPasswordHash() == null
                    || !passwordEncoder.matches(pinRequest.getPin(), emp.getPasswordHash())) {
                continue;
            }
            matches.add(emp);
        }
        if (matches.isEmpty()) {
            loginRateLimiter.recordFailure(rateLimitKey);
            loginRateLimiter.recordFailure(tenantKey);
            throw new BusinessRuleException("رمز الدخول السري غير صحيح!");
        }
        if (matches.size() > 1) {
            // This used to pick the most privileged match (pinLoginRoleRank preferred OWNER),
            // which turned a PIN collision into a privilege grant: guess any employee's PIN,
            // get signed in as whoever shares it with the most authority. Since usernames are
            // not supplied here there is no way to tell which account was meant, so refuse.
            // PIN uniqueness is enforced on every write path, so this is a guard for data that
            // predates that rule rather than something a user should normally hit.
            loginRateLimiter.recordFailure(rateLimitKey);
            loginRateLimiter.recordFailure(tenantKey);
            log.warn("PIN login refused: {} accounts in tenant {} share this PIN", matches.size(), tenantId);
            throw new BusinessRuleException(
                    "هذا الرمز مستخدم لأكثر من حساب. يرجى تغيير الرمز من شاشة الموظفين أو الدخول باسم المستخدم.");
        }
        Employee matched = matches.get(0);
        String matchedUsername = matched.getUsername();

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(matchedUsername, pinRequest.getPin())
            );
        } catch (org.springframework.security.core.AuthenticationException ex) {
            loginRateLimiter.recordFailure(rateLimitKey);
            loginRateLimiter.recordFailure(tenantKey);
            throw ex;
        }
        loginRateLimiter.recordSuccess(rateLimitKey);
        loginRateLimiter.recordSuccess(tenantKey);

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

    /** Throttle bucket for one account, independent of where the attempts come from. */
    private static String accountKey(String username) {
        String normalized = username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
        return "account:" + normalized;
    }

    /**
     * Throttle bucket for a whole tenant's keypad. PIN login carries no username, so there is
     * no account to charge an attempt to until one matches — without this, spreading guesses
     * across addresses left the PIN space effectively unthrottled.
     */
    private static String pinLoginTenantKey(String tenantId) {
        return "pin-login-tenant:" + tenantId;
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
