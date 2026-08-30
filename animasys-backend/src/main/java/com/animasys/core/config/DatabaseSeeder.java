package com.animasys.core.config;

import com.animasys.modules.finance.domain.BankAccount;
import com.animasys.modules.finance.repository.BankAccountRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.iam.service.RoleBootstrapService;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.services.domain.GroomingService;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Ensures the desktop install always has a usable login identity.
 *
 * Core org + default employees are created whenever the employees table is empty
 * (independent of demo catalog seeding). Optional PIN sync repairs mismatched
 * hashes from older builds where Login.tsx PINs did not match DatabaseSeeder.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DatabaseSeeder implements CommandLineRunner {

    /** Current product defaults (PIN keypad /auth/pin-login). */
    public static final String DEFAULT_OWNER_USERNAME = "owner_marwan";
    public static final String DEFAULT_CASHIER_USERNAME = "cashier_amir";
    public static final String DEFAULT_GROOMER_USERNAME = "groomer_bob";
    public static final String DEFAULT_OWNER_FULL_NAME = "Marwan";
    public static final String DEFAULT_CASHIER_FULL_NAME = "Amir";
    public static final String DEFAULT_GROOMER_FULL_NAME = "Bob";
    /** Legacy fixed PIN, kept only as the repair target for already-shipped installs (see syncKnownAccountPins). */
    public static final String DEFAULT_OWNER_PIN = "2026";
    public static final String DEFAULT_CASHIER_PIN = "2026";
    public static final String DEFAULT_GROOMER_PIN = "2026";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final TenantRepository tenantRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;
    private final WarehouseRepository warehouseRepository;
    private final GroomingServiceRepository serviceRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final RoleBootstrapService roleBootstrapService;

    @Value("${app.seed-demo-data:false}")
    private boolean seedDemoData;

    /**
     * When true (desktop packaged app), re-apply known default PINs for the
     * standard and legacy usernames so login cannot drift from the UI keypad.
     */
    @Value("${app.sync-default-pins:false}")
    private boolean syncDefaultPins;

    @Override
    public void run(String... args) {
        Tenant tenant = ensureTenant();
        roleBootstrapService.ensureSystemRolesForTenant(tenant);
        Branch branch = ensureBranch(tenant);
        ensureWarehouses(branch);
        ensureBankAccount(tenant);

        if (employeeRepository.count() == 0) {
            log.info("No employees found — creating default login accounts");
            createDefaultEmployees(tenant, branch);
        } else {
            ensureGroomerExists(tenant, branch);
        }

        if (syncDefaultPins) {
            syncKnownAccountPins();
            syncKnownAccountProfiles();
        }

        if (seedDemoData) {
            seedStandardServices(tenant);
        }
    }

    private Tenant ensureTenant() {
        return tenantRepository.findById("t-1").map(existing -> {
            if (!"main".equals(existing.getSubdomain())) {
                existing.setSubdomain("main");
                existing.setName("Amazon Pet Main Center");
                existing.setActive(true);
                return tenantRepository.save(existing);
            }
            return existing;
        }).orElseGet(() ->
                tenantRepository.save(Tenant.builder()
                        .id("t-1")
                        .name("Amazon Pet Main Center")
                        .subdomain("main")
                        .active(true)
                        .build()));
    }

    private Branch ensureBranch(Tenant tenant) {
        return branchRepository.findById("b-1").orElseGet(() ->
                branchRepository.save(Branch.builder()
                        .id("b-1")
                        .tenant(tenant)
                        .name("Main Downtown Branch")
                        .address("77 Enterprise Way")
                        .phone("+123456789")
                        .build()));
    }

    private void ensureWarehouses(Branch branch) {
        if (!warehouseRepository.existsById("wh-shelf")) {
            warehouseRepository.save(Warehouse.builder()
                    .id("wh-shelf")
                    .branch(branch)
                    .name("Retail Shelves WH")
                    .code("WH-SHELF")
                    .build());
        }
        if (!warehouseRepository.existsById("wh-main")) {
            warehouseRepository.save(Warehouse.builder()
                    .id("wh-main")
                    .branch(branch)
                    .name("Backroom Main Store")
                    .code("WH-MAIN")
                    .build());
        }
    }

    private void ensureBankAccount(Tenant tenant) {
        if (!bankAccountRepository.existsById("ba-1")) {
            bankAccountRepository.save(BankAccount.builder()
                    .id("ba-1")
                    .tenant(tenant)
                    .name("Corporate Operating Bank Account")
                    .balance(BigDecimal.ZERO)
                    .build());
        }
    }

    private void createDefaultEmployees(Tenant tenant, Branch branch) {
        // Fresh install: never ship a known/fixed PIN. Generate distinct random
        // 4-digit PINs per account and surface them once via the log so whoever
        // is standing up this install can hand them to the client.
        Set<String> usedPins = new LinkedHashSet<>();
        String ownerPin = generateUnusedPin(usedPins);
        String cashierPin = generateUnusedPin(usedPins);
        String groomerPin = generateUnusedPin(usedPins);

        employeeRepository.save(Employee.builder()
                .id("e-1")
                .tenant(tenant)
                .branch(branch)
                .username(DEFAULT_OWNER_USERNAME)
                .passwordHash(passwordEncoder.encode(ownerPin))
                .fullName(DEFAULT_OWNER_FULL_NAME)
                .email("marwan@amazonpet.com")
                .role("OWNER")
                .active(true)
                .build());

        employeeRepository.save(Employee.builder()
                .id("e-2")
                .tenant(tenant)
                .branch(branch)
                .username(DEFAULT_CASHIER_USERNAME)
                .passwordHash(passwordEncoder.encode(cashierPin))
                .fullName(DEFAULT_CASHIER_FULL_NAME)
                .email("amir@amazonpet.com")
                .role("CASHIER")
                .active(true)
                .build());

        employeeRepository.save(Employee.builder()
                .id("e-3")
                .tenant(tenant)
                .branch(branch)
                .username(DEFAULT_GROOMER_USERNAME)
                .passwordHash(passwordEncoder.encode(groomerPin))
                .fullName(DEFAULT_GROOMER_FULL_NAME)
                .email("bob@amazonpet.com")
                .role("GROOMER")
                .active(true)
                .build());

        log.warn("First-run setup generated new login PINs — record these now, they will not be logged again: " +
                        "owner({})={}, cashier({})={}, groomer({})={}",
                DEFAULT_OWNER_USERNAME, ownerPin, DEFAULT_CASHIER_USERNAME, cashierPin, DEFAULT_GROOMER_USERNAME, groomerPin);
    }

    private String generateUnusedPin(Set<String> usedPins) {
        String pin;
        do {
            pin = String.format("%04d", RANDOM.nextInt(10000));
        } while (!usedPins.add(pin));
        return pin;
    }

    /** Idempotent: ensure groomer e-3 exists on already-seeded databases. */
    private void ensureGroomerExists(Tenant tenant, Branch branch) {
        if (employeeRepository.existsById("e-3")) {
            return;
        }
        String groomerPin = generateUnusedPin(new LinkedHashSet<>());
        employeeRepository.save(Employee.builder()
                .id("e-3")
                .tenant(tenant)
                .branch(branch)
                .username(DEFAULT_GROOMER_USERNAME)
                .passwordHash(passwordEncoder.encode(groomerPin))
                .fullName(DEFAULT_GROOMER_FULL_NAME)
                .email("bob@amazonpet.com")
                .role("GROOMER")
                .active(true)
                .build());
        log.warn("Backfilled missing groomer account '{}' with a new PIN: {}", DEFAULT_GROOMER_USERNAME, groomerPin);
    }

    /**
     * Re-hash known default / legacy usernames to the PINs expected by the login UI.
     * Does not touch custom employee accounts.
     */
    private void syncKnownAccountPins() {
        Map<String, String> expectedPins = new LinkedHashMap<>();
        // Current product defaults (used by /auth/pin-login)
        expectedPins.put(DEFAULT_OWNER_USERNAME, DEFAULT_OWNER_PIN);
        expectedPins.put(DEFAULT_CASHIER_USERNAME, DEFAULT_CASHIER_PIN);
        expectedPins.put(DEFAULT_GROOMER_USERNAME, DEFAULT_GROOMER_PIN);
        // First-setup wizard account + legacy packaged usernames
        expectedPins.put("owner", DEFAULT_OWNER_PIN);
        expectedPins.put("owner_yahia", DEFAULT_OWNER_PIN);
        expectedPins.put("cashier_alice", DEFAULT_CASHIER_PIN);

        int repaired = 0;
        for (Map.Entry<String, String> entry : expectedPins.entrySet()) {
            var employeeOpt = employeeRepository.findByUsername(entry.getKey());
            if (employeeOpt.isEmpty()) {
                continue;
            }
            Employee employee = employeeOpt.get();
            if (employee.getPasswordHash() != null && !employee.getPasswordHash().isBlank()) {
                // Do NOT overwrite employee passwords on startup — user password changes must be preserved permanently!
                continue;
            }
            employee.setPasswordHash(passwordEncoder.encode(entry.getValue()));
            employeeRepository.save(employee);
            repaired++;
            log.info("Initialized missing PIN hash for default account '{}'", entry.getKey());
        }
        if (repaired > 0) {
            log.info("Synchronized {} default account PIN hash(es) with the login UI", repaired);
        }
    }

    /** Fix legacy demo names (e.g. Sarah Connor on owner_yahia) for packaged desktop installs. */
    private void syncKnownAccountProfiles() {
        Map<String, String> expectedNames = new LinkedHashMap<>();
        expectedNames.put(DEFAULT_OWNER_USERNAME, DEFAULT_OWNER_FULL_NAME);
        expectedNames.put("owner", DEFAULT_OWNER_FULL_NAME);
        expectedNames.put("owner_yahia", DEFAULT_OWNER_FULL_NAME);
        expectedNames.put(DEFAULT_CASHIER_USERNAME, DEFAULT_CASHIER_FULL_NAME);
        expectedNames.put("cashier_alice", DEFAULT_CASHIER_FULL_NAME);
        expectedNames.put(DEFAULT_GROOMER_USERNAME, DEFAULT_GROOMER_FULL_NAME);

        int updated = 0;
        for (Map.Entry<String, String> entry : expectedNames.entrySet()) {
            var opt = employeeRepository.findByUsername(entry.getKey());
            if (opt.isEmpty()) {
                continue;
            }
            Employee employee = opt.get();
            if (entry.getValue().equals(employee.getFullName())) {
                continue;
            }
            employee.setFullName(entry.getValue());
            employeeRepository.save(employee);
            updated++;
            log.info("Updated display name for '{}' to '{}'", entry.getKey(), entry.getValue());
        }

        employeeRepository.findById("e-1").ifPresent(owner -> {
            if (!"OWNER".equals(owner.getRole())) {
                return;
            }
            boolean changed = false;
            if (!DEFAULT_OWNER_FULL_NAME.equals(owner.getFullName())) {
                owner.setFullName(DEFAULT_OWNER_FULL_NAME);
                changed = true;
            }
            if ("owner_yahia".equals(owner.getUsername())
                    && employeeRepository.findByUsername(DEFAULT_OWNER_USERNAME).isEmpty()) {
                owner.setUsername(DEFAULT_OWNER_USERNAME);
                owner.setEmail("marwan@amazonpet.com");
                changed = true;
                log.info("Renamed legacy owner username to '{}'", DEFAULT_OWNER_USERNAME);
            }
            if (changed) {
                employeeRepository.save(owner);
            }
        });

        if (updated > 0) {
            log.info("Synchronized {} default employee display name(s)", updated);
        }
    }

    private void seedStandardServices(Tenant tenant) {
        var defaults = java.util.List.of(
                GroomingService.builder().id("svc-1").tenant(tenant).name("حمام وتنشيف كامل (Full Grooming & Bath)").price(new BigDecimal("180.00")).durationMinutes(45).build(),
                GroomingService.builder().id("svc-2").tenant(tenant).name("قص وتصفيف شعر (Haircut & Styling)").price(new BigDecimal("250.00")).durationMinutes(60).build(),
                GroomingService.builder().id("svc-3").tenant(tenant).name("قص وتظليم أظافر + تنظيف أذن (Nail & Ear Care)").price(new BigDecimal("80.00")).durationMinutes(20).build(),
                GroomingService.builder().id("svc-4").tenant(tenant).name("تطعيمات وفحص طبي دوري (Vaccination & Health Check)").price(new BigDecimal("350.00")).durationMinutes(30).build(),
                GroomingService.builder().id("svc-5").tenant(tenant).name("تنظيف وتلميع أسنان (Pet Dental Cleaning)").price(new BigDecimal("200.00")).durationMinutes(40).build(),
                GroomingService.builder().id("svc-6").tenant(tenant).name("علاج وبخ طفيليات وحشرات (Flea & Tick Treatment)").price(new BigDecimal("150.00")).durationMinutes(25).build(),
                GroomingService.builder().id("svc-7").tenant(tenant).name("إقامة وفندقة ليلة واحدة (Pet Boarding - 1 Night)").price(new BigDecimal("300.00")).durationMinutes(1440).build(),
                GroomingService.builder().id("svc-8").tenant(tenant).name("تركيب شريحة تتبع إلكترونية (Microchip Installation)").price(new BigDecimal("450.00")).durationMinutes(15).build(),
                GroomingService.builder().id("svc-9").tenant(tenant).name("حمام طبي وتطهير جلد (Medicated Bath)").price(new BigDecimal("220.00")).durationMinutes(50).build(),
                GroomingService.builder().id("svc-10").tenant(tenant).name("تدريب وتعديل سلوك أليف (Behavior Training)").price(new BigDecimal("400.00")).durationMinutes(60).build()
        );
        for (GroomingService svc : defaults) {
            if (!serviceRepository.existsById(svc.getId())) {
                serviceRepository.save(svc);
            }
        }
    }
}
