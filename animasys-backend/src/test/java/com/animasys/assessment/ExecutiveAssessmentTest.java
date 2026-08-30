package com.animasys.assessment;

import com.animasys.core.exception.InsufficientStockException;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.dto.CreateSaleRequest;
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.dto.SaleRefundResult;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.sales.service.IdempotentCheckoutService;
import com.animasys.modules.sales.service.SaleService;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class ExecutiveAssessmentTest extends IntegrationTestBase {

    @Autowired private MockMvc mockMvc;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private InventoryBatchRepository batchRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private SaleItemRepository saleItemRepository;
    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private SaleService saleService;
    @Autowired private IdempotentCheckoutService idempotentCheckoutService;
    @Autowired private TransactionTemplate transactionTemplate;

    private Tenant tenant;
    private Branch branch;
    private Employee manager;
    private Employee cashier;
    private POSSession posSession;
    private Warehouse warehouse;

    @BeforeEach
    void setUpData() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-exec-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Executive Assessment Tenant")
                .subdomain("exec-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("b-exec-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main Branch")
                .build());

        warehouse = warehouseRepository.save(Warehouse.builder()
                .id("wh-exec-" + UUID.randomUUID().toString().substring(0, 8))
                .branch(branch)
                .name("Default WH")
                .code("WH-EX")
                .build());

        manager = employeeRepository.save(Employee.builder()
                .id("e-mgr-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("mgr-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Manager User")
                .email("mgr-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build());

        cashier = employeeRepository.save(Employee.builder()
                .id("e-cash-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("cashier-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Cashier User")
                .email("cashier-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("CASHIER")
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

    @Test
    @DisplayName("A) Concurrency Test: 2 Parallel Threads Competing for 1 Remaining Unit")
    void testConcurrencyControlOnProductVariant() throws InterruptedException {
        ProductVariant variant = createTestVariant("CONC-SKU-001", 1, new BigDecimal("100.00"), new BigDecimal("50.00"));
        
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, null,
                "BATCH-CONC", new BigDecimal("50.00"), 1, LocalDate.now().plusMonths(6), Instant.now(), manager.getId()
        );

        int totalThreads = 2;
        ExecutorService executorService = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(totalThreads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger conflictOrFailCount = new AtomicInteger(0);
        String runSuffix = UUID.randomUUID().toString().substring(0, 8);

        for (int i = 0; i < totalThreads; i++) {
            final int index = i;
            executorService.submit(() -> {
                try {
                    authenticate(manager);
                    transactionTemplate.executeWithoutResult(status -> {
                        Sale sale = Sale.builder()
                                .id(UUID.randomUUID().toString())
                                .saleNumber("CONC-INV-" + runSuffix + "-" + index)
                                .posSession(posSession)
                                .employee(manager)
                                .totalAmount(new BigDecimal("100.00"))
                                .tax(BigDecimal.ZERO)
                                .discount(BigDecimal.ZERO)
                                .paymentMethod("CASH")
                                .status("COMPLETED")
                                .build();
                        saleRepository.save(sale);

                        SaleItem item = SaleItem.builder()
                                .id(UUID.randomUUID().toString())
                                .sale(sale)
                                .name("Item-" + index)
                                .type("PRODUCT")
                                .itemId(variant.getId())
                                .quantity(1)
                                .price(new BigDecimal("100.00"))
                                .listPrice(new BigDecimal("100.00"))
                                .cost(BigDecimal.ZERO)
                                .build();
                        saleItemRepository.save(item);

                        fifoCostingService.allocateSaleItemFifo(tenant.getId(), warehouse.getId(), item, manager.getId());
                    });
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    conflictOrFailCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executorService.shutdown();

        System.out.println("=== CONCURRENCY TEST RESULT ===");
        System.out.println("Total Threads Attempted: " + totalThreads);
        System.out.println("Successful Sales: " + successCount.get());
        System.out.println("Blocked/Conflict Sales: " + conflictOrFailCount.get());

        assertEquals(1, successCount.get(), "Exactly 1 concurrent attempt must succeed for 1 unit of stock");
        assertEquals(1, conflictOrFailCount.get(), "Exactly 1 concurrent attempt must fail/conflict due to stock exhaustion lock");
    }

    @Test
    @DisplayName("B) Idempotency Test: Duplicate Idempotency-Key Header")
    void testIdempotencyDuplicateRequest() {
        ProductVariant variant = createTestVariant("IDEM-SKU-001", 10, new BigDecimal("100.00"), new BigDecimal("40.00"));
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, null,
                "BATCH-IDEM", new BigDecimal("40.00"), 10, LocalDate.now().plusMonths(6), Instant.now(), manager.getId()
        );

        String idempotencyKey = "IDEM-KEY-" + UUID.randomUUID();

        CreateSaleRequest req = new CreateSaleRequest();
        req.setPosSessionId(posSession.getId());
        req.setTotalAmount(new BigDecimal("100.00"));
        req.setPaymentMethod("CASH");
        req.setTax(BigDecimal.ZERO);
        req.getDiscount();

        SaleItem item = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .quantity(1)
                .price(new BigDecimal("100.00"))
                .build();

        long salesCountBefore = saleRepository.count();

        // First Execution
        Sale sale1 = idempotentCheckoutService.processCheckout(idempotencyKey, req, List.of(item), tenant.getId(), manager.getId());
        long salesCountAfterFirst = saleRepository.count();

        // Duplicate Second Execution with identical Idempotency-Key
        Sale sale2 = idempotentCheckoutService.processCheckout(idempotencyKey, req, List.of(item), tenant.getId(), manager.getId());
        long salesCountAfterSecond = saleRepository.count();

        System.out.println("=== IDEMPOTENCY TEST RESULT ===");
        System.out.println("Sale 1 ID: " + sale1.getId());
        System.out.println("Sale 2 ID: " + sale2.getId());
        System.out.println("Sales Count Before: " + salesCountBefore);
        System.out.println("Sales Count After First Call: " + salesCountAfterFirst);
        System.out.println("Sales Count After Second Call: " + salesCountAfterSecond);

        assertEquals(sale1.getId(), sale2.getId(), "Duplicate idempotency request must return identical sale record");
        assertEquals(salesCountBefore + 1, salesCountAfterFirst, "First call must create 1 sale");
        assertEquals(salesCountAfterFirst, salesCountAfterSecond, "Second call MUST NOT duplicate invoice in database");
    }

    @Test
    @DisplayName("C) Partial Refund + FIFO Math Verification")
    void testPartialRefundFifoMath() {
        // Initial Stock Purchase Batch: 10 units @ 40.00 EGP cost, sell price 100.00 EGP
        ProductVariant variant = createTestVariant("FIFO-MATH-001", 0, new BigDecimal("100.00"), new BigDecimal("40.00"));
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, null,
                "BATCH-MATH", new BigDecimal("40.00"), 10, LocalDate.now().plusMonths(12), Instant.now(), manager.getId()
        );

        int initialStock = variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity();
        System.out.println("--- BEFORE SALE ---");
        System.out.println("Initial Stock Quantity: " + initialStock);

        // Action 1: Sell 3 units @ 100.00 EGP each
        SaleItem item = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .name("Test Product")
                .quantity(3)
                .price(new BigDecimal("100.00"))
                .cost(BigDecimal.ZERO)
                .build();

        Sale sale = saleService.createSale(
                posSession.getId(), manager.getId(), null,
                new BigDecimal("300.00"), BigDecimal.ZERO, BigDecimal.ZERO, "CASH", List.of(item)
        );

        SaleItem soldItem = saleItemRepository.findAll().stream()
                .filter(i -> i.getSale().getId().equals(sale.getId()))
                .findFirst().orElseThrow();

        int stockAfterSale = variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity();
        BigDecimal saleRevenue = sale.getTotalAmount();
        BigDecimal saleCogs = soldItem.getCogs();

        System.out.println("--- AFTER SALE (3 Units @ 100 EGP) ---");
        System.out.println("Remaining Stock: " + stockAfterSale);
        System.out.println("Sale Revenue: " + saleRevenue + " EGP");
        System.out.println("Sale COGS: " + saleCogs + " EGP");
        System.out.println("Gross Profit: " + saleRevenue.subtract(saleCogs) + " EGP");

        assertEquals(7, stockAfterSale);
        assertEquals(0, new BigDecimal("300.00").compareTo(saleRevenue));
        assertEquals(0, new BigDecimal("120.00").compareTo(saleCogs));

        // Action 2: Partial Refund of 1 unit
        SaleRefundResult refundResult = saleService.refundSale(
                sale.getId(),
                manager.getId(),
                List.of(SaleRefundLineRequest.builder().saleItemId(soldItem.getId()).quantity(1).build())
        );

        int stockAfterRefund = variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity();
        BigDecimal refundAmount = refundResult.getRefundAmount();
        BigDecimal cogsReversed = refundResult.getCogsReversed();
        BigDecimal netRevenue = saleRevenue.subtract(refundAmount);
        BigDecimal netCogs = saleCogs.subtract(cogsReversed);

        System.out.println("--- AFTER PARTIAL REFUND (1 Unit Returned) ---");
        System.out.println("Refund Amount Returned to Customer: " + refundAmount + " EGP");
        System.out.println("COGS Reversed to Inventory: " + cogsReversed + " EGP");
        System.out.println("Restored Stock Quantity: " + stockAfterRefund);
        System.out.println("Net Revenue: " + netRevenue + " EGP");
        System.out.println("Net COGS: " + netCogs + " EGP");
        System.out.println("Net Gross Profit: " + netRevenue.subtract(netCogs) + " EGP");

        assertEquals(8, stockAfterRefund, "Stock must return to 8 units");
        assertEquals(0, new BigDecimal("100.00").compareTo(refundAmount), "Refund amount must be 100.00 EGP");
        assertEquals(0, new BigDecimal("40.00").compareTo(cogsReversed), "COGS reversed must be 40.00 EGP");
        assertEquals(0, new BigDecimal("200.00").compareTo(netRevenue), "Net Revenue must be 200.00 EGP");
        assertEquals(0, new BigDecimal("80.00").compareTo(netCogs), "Net COGS must be 80.00 EGP");
    }

    @Test
    @DisplayName("D) Security / RBAC Test: Cashier Accessing Admin/Manager Endpoint")
    void testSecurityRbacCashierDeniedAdminRoute() throws Exception {
        authenticate(cashier);

        System.out.println("=== SECURITY / RBAC TEST ===");
        System.out.println("Attempting request to protected endpoint as CASHIER role: POST /v1/inventory/catalog-admin/duplicate-skus/merge");

        // CASHIER lacks 'settings.factory_reset' permission -> Server returns 403 FORBIDDEN
        mockMvc.perform(post("/v1/inventory/catalog-admin/duplicate-skus/merge")
                        .header("X-Tenant-ID", tenant.getId())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());

        System.out.println("Server Response: 403 FORBIDDEN - Access Denied");
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
}
