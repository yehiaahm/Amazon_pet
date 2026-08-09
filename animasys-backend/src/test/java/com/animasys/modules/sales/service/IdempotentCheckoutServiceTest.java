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
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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
}
