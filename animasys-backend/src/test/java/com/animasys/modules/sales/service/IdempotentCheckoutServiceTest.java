package com.animasys.modules.sales.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.dto.CreateSaleRequest;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Covers the idempotency branches not already exercised by
 * ExecutiveAssessmentTest (which only checks COMPLETED replay): the missing
 * header guard, a still-fresh concurrent PROCESSING row, and a stale
 * PROCESSING row (crashed request) being taken over and completed.
 */
class IdempotentCheckoutServiceTest extends IntegrationTestBase {

    @Autowired private IdempotentCheckoutService idempotentCheckoutService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private FifoCostingService fifoCostingService;

    private Tenant tenant;
    private Employee manager;
    private POSSession posSession;
    private Warehouse warehouse;

    @BeforeEach
    void setUpData() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-idem-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Idempotency Test Tenant")
                .subdomain("idem-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-idem-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main Branch")
                .build());

        warehouse = warehouseRepository.save(Warehouse.builder()
                .id("wh-idem-" + UUID.randomUUID().toString().substring(0, 8))
                .branch(branch)
                .name("Default WH")
                .code("WH-IDEM")
                .build());

        manager = employeeRepository.save(Employee.builder()
                .id("e-idem-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("mgr-idem-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Manager User")
                .email("mgr-idem-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build());

        posSession = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(manager)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());

        authenticate(manager);
    }

    private ProductVariant createTestVariant(String sku, int initialStock, BigDecimal price, BigDecimal cost) {
        String uniqueSku = sku + "-" + UUID.randomUUID().toString().substring(0, 8);
        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Cat-" + uniqueSku)
                .build());
        Product product = productRepository.save(Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku(uniqueSku)
                .name("Product " + uniqueSku)
                .category(category)
                .build());
        return variantRepository.save(ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .sku(uniqueSku)
                .name("Variant " + uniqueSku)
                .price(price)
                .cost(cost)
                .stockQuantity(initialStock)
                .build());
    }

    private CreateSaleRequest buildRequest() {
        CreateSaleRequest req = new CreateSaleRequest();
        req.setPosSessionId(posSession.getId());
        req.setTotalAmount(new BigDecimal("100.00"));
        req.setPaymentMethod("CASH");
        req.setTax(BigDecimal.ZERO);
        return req;
    }

    @Test
    @DisplayName("Rejects checkout with a missing Idempotency-Key")
    void rejectsMissingIdempotencyKey() {
        CreateSaleRequest req = buildRequest();
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> idempotentCheckoutService.processCheckout(null, req, List.of(), tenant.getId(), manager.getId()));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());

        ex = assertThrows(ResponseStatusException.class,
                () -> idempotentCheckoutService.processCheckout("  ", req, List.of(), tenant.getId(), manager.getId()));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    @DisplayName("Returns 409 when a fresh PROCESSING row for the same key already exists")
    void conflictsOnFreshConcurrentProcessingRow() {
        String idempotencyKey = "IDEM-CONC-" + UUID.randomUUID();
        // Simulate another in-flight request that already inserted the PROCESSING row moments ago.
        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (idempotency_key, tenant_id, status, created_at) VALUES (?, ?, 'PROCESSING', ?)",
                idempotencyKey, tenant.getId(), Timestamp.from(Instant.now()));

        CreateSaleRequest req = buildRequest();
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> idempotentCheckoutService.processCheckout(idempotencyKey, req, List.of(), tenant.getId(), manager.getId()));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    @DisplayName("Takes over a stale (crashed) PROCESSING row and completes the sale")
    void takesOverStaleProcessingRow() {
        ProductVariant variant = createTestVariant("IDEM-STALE-001", 10, new BigDecimal("100.00"), new BigDecimal("40.00"));
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, null,
                "BATCH-STALE", new BigDecimal("40.00"), 10,
                java.time.LocalDate.now().plusMonths(6), Instant.now(), manager.getId());

        String idempotencyKey = "IDEM-STALE-" + UUID.randomUUID();
        // Simulate a request that crashed mid-checkout: PROCESSING row older than the 60s takeover threshold.
        Timestamp staleTimestamp = Timestamp.from(Instant.now().minus(120, ChronoUnit.SECONDS));
        jdbcTemplate.update(
                "INSERT INTO idempotency_keys (idempotency_key, tenant_id, status, created_at) VALUES (?, ?, 'PROCESSING', ?)",
                idempotencyKey, tenant.getId(), staleTimestamp);

        CreateSaleRequest req = buildRequest();
        SaleItem item = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .quantity(1)
                .price(new BigDecimal("100.00"))
                .build();

        long salesCountBefore = saleRepository.count();

        Sale sale = idempotentCheckoutService.processCheckout(idempotencyKey, req, List.of(item), tenant.getId(), manager.getId());

        assertNotNull(sale);
        assertEquals(salesCountBefore + 1, saleRepository.count());

        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM idempotency_keys WHERE idempotency_key = ?", String.class, idempotencyKey);
        assertEquals("COMPLETED", status);
    }

    /**
     * Real concurrency test (not simulated via direct DB row insertion, unlike the two
     * tests above): fires genuinely simultaneous checkout requests carrying the SAME
     * Idempotency-Key from N real threads, racing tryInsertProcessing's unique-constraint
     * insert. Regardless of which threads win/lose the race (some may get 409 CONFLICT if
     * they observe a still-fresh PROCESSING row; that is an acceptable, documented outcome
     * of this design, not a bug), the invariants that must never break under real concurrency
     * are: exactly one Sale is ever created for this key, and stock is deducted exactly once
     * — never a duplicate sale, duplicate payment, or duplicate stock deduction.
     */
    @Test
    @DisplayName("Concurrency: N simultaneous requests with the same Idempotency-Key never create more than one sale")
    void simultaneousDuplicateRequestsCreateExactlyOneSale() throws InterruptedException {
        int initialStock = 20;
        ProductVariant variant = createTestVariant("IDEM-RACE-001", initialStock, new BigDecimal("100.00"), new BigDecimal("40.00"));
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, null,
                "BATCH-RACE", new BigDecimal("40.00"), initialStock,
                java.time.LocalDate.now().plusMonths(6), Instant.now(), manager.getId());

        String idempotencyKey = "IDEM-RACE-" + UUID.randomUUID();
        int totalThreads = 10;
        ExecutorService executorService = Executors.newFixedThreadPool(totalThreads);
        CountDownLatch ready = new CountDownLatch(totalThreads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(totalThreads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger conflictCount = new AtomicInteger(0);
        AtomicInteger otherFailureCount = new AtomicInteger(0);
        Set<String> saleIdsSeen = ConcurrentHashMap.newKeySet();

        for (int i = 0; i < totalThreads; i++) {
            executorService.submit(() -> {
                try {
                    authenticate(manager);
                    CreateSaleRequest req = buildRequest();
                    SaleItem item = SaleItem.builder()
                            .type("PRODUCT")
                            .itemId(variant.getId())
                            .quantity(1)
                            .price(new BigDecimal("100.00"))
                            .build();
                    ready.countDown();
                    start.await();
                    Sale sale = idempotentCheckoutService.processCheckout(
                            idempotencyKey, req, List.of(item), tenant.getId(), manager.getId());
                    saleIdsSeen.add(sale.getId());
                    successCount.incrementAndGet();
                } catch (ResponseStatusException ex) {
                    if (ex.getStatusCode() == HttpStatus.CONFLICT) {
                        conflictCount.incrementAndGet();
                    } else {
                        otherFailureCount.incrementAndGet();
                    }
                } catch (Exception ex) {
                    otherFailureCount.incrementAndGet();
                } finally {
                    done.countDown();
                }
            });
        }

        ready.await(5, TimeUnit.SECONDS);
        start.countDown();
        assertTrue(done.await(30, TimeUnit.SECONDS), "All concurrent checkout attempts must finish within 30s");
        executorService.shutdown();

        long salesForKey = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM idempotency_keys WHERE idempotency_key = ? AND status = 'COMPLETED'",
                Long.class, idempotencyKey);
        assertEquals(1, salesForKey, "Exactly one idempotency_keys row must reach COMPLETED for this key");

        assertTrue(successCount.get() >= 1, "At least one concurrent request must succeed");
        assertEquals(1, saleIdsSeen.size(), "Every successful/replayed response must reference the exact same Sale id — never a distinct duplicate");
        assertEquals(totalThreads, successCount.get() + conflictCount.get() + otherFailureCount.get());
        assertEquals(0, otherFailureCount.get(),
                "Every concurrent attempt must resolve to either a successful sale or a clean 409 CONFLICT — no other failure mode");

        int remainingStock = variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity();
        assertEquals(initialStock - 1, remainingStock,
                "Stock must be deducted exactly once (for the single real sale), never once per concurrent attempt");
    }
}
