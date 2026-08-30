package com.animasys.modules.inventory.service;

import com.animasys.core.exception.InsufficientStockException;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import com.animasys.support.IntegrationTestBase;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
public class FifoCostingEngineIntegrationTest extends IntegrationTestBase {

    @Autowired
    private FifoCostingService fifoCostingService;

    @Autowired
    private InventoryBatchRepository batchRepository;

    @Autowired
    private SaleItemBatchAllocationRepository allocationRepository;

    @Autowired
    private InventoryLedgerTransactionRepository ledgerRepository;

    @Autowired
    private ProductVariantRepository productVariantRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private BranchRepository branchRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private POSSessionRepository posSessionRepository;

    @Autowired
    private SaleItemRepository saleItemRepository;

    @Autowired
    private SaleRepository saleRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private ProductVariant dogFoodVariant;
    private Tenant tenant;
    private Branch branch;
    private Warehouse warehouse;
    private Employee employee;
    private POSSession posSession;

    private String tenantId;
    private String warehouseId;
    private String employeeId;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID().toString();
        tenant = Tenant.builder()
                .id(tenantId)
                .name("Pet Shop Tenant")
                .subdomain("ps-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);

        bootstrapTenantRoles(tenant);

        branch = Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Main Branch")
                .address("Cairo, Egypt")
                .build();
        branchRepository.save(branch);

        warehouse = Warehouse.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .name("Main Store Warehouse")
                .code("WH-MAIN")
                .build();
        warehouseRepository.save(warehouse);
        warehouseId = warehouse.getId();

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("admin-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hashed_secret")
                .fullName("Admin User")
                .email("admin-" + UUID.randomUUID().toString().substring(0, 8) + "@animasys.com")
                .role("MANAGER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        employeeId = employee.getId();

        authenticate(employee);

        posSession = POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openedAt(Instant.now())
                .openingBalance(new BigDecimal("100.00"))
                .status("OPEN")
                .build();
        posSessionRepository.save(posSession);

        Category category = Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Pet Food")
                .build();
        categoryRepository.save(category);

        Product product = Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku("SKU-DOG-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Royal Canin Dog Food")
                .category(category)
                .minStockLimit(10)
                .build();
        productRepository.save(product);

        dogFoodVariant = ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenantId)
                .sku(product.getSku())
                .name("10kg Bag")
                .price(new BigDecimal("500.0000"))
                .cost(new BigDecimal("700.0000"))
                .stockQuantity(0)
                .build();
        productVariantRepository.save(dogFoodVariant);
    }

    @Test
    @DisplayName("1. Complete E2E Integration Workflow: Purchase -> Multi-Batch Sale -> Customer Return -> Ledger & Valuation")
    void testEndToEndPurchaseSaleReturnWorkflow() {
        // Step 1: Purchase #1 (5 units @ 700 EGP)
        InventoryBatch batch1 = fifoCostingService.createPurchaseBatch(
                tenantId, warehouseId, dogFoodVariant.getId(), null, null,
                "LOT-001", new BigDecimal("700.0000"), 5, LocalDate.now().plusMonths(6), Instant.now(), employeeId
        );

        // Step 2: Purchase #2 (10 units @ 200 EGP)
        InventoryBatch batch2 = fifoCostingService.createPurchaseBatch(
                tenantId, warehouseId, dogFoodVariant.getId(), null, null,
                "LOT-002", new BigDecimal("200.0000"), 10, LocalDate.now().plusMonths(12), Instant.now(), employeeId
        );

        // Verify Valuation = (5 * 700) + (10 * 200) = 3500 + 2000 = 5500 EGP
        BigDecimal initialValuation = fifoCostingService.calculateInventoryValuation(tenantId);
        assertEquals(0, new BigDecimal("5500.0000").compareTo(initialValuation));

        // Step 3: Customer buys 7 units @ 500 EGP (Consumes 5 from Batch 1 @ 700 + 2 from Batch 2 @ 200)
        Sale sale = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-SALE-" + UUID.randomUUID().toString().substring(0, 8))
                .posSession(posSession)
                .employee(employee)
                .totalAmount(new BigDecimal("3500.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .date(Instant.now())
                .build();
        saleRepository.save(sale);

        SaleItem saleItem = SaleItem.builder()
                .id(UUID.randomUUID().toString())
                .sale(sale)
                .type("PRODUCT")
                .itemId(dogFoodVariant.getId())
                .name("Royal Canin 10kg")
                .quantity(7)
                .price(new BigDecimal("500.0000"))
                .listPrice(new BigDecimal("500.0000"))
                .cost(new BigDecimal("700.0000"))
                .build();
        saleItemRepository.save(saleItem);

        // Execute FIFO Allocation
        List<SaleItemBatchAllocation> allocations = fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, saleItem, employeeId);

        // Assert Allocations
        assertEquals(2, allocations.size());
        // COGS = (5 * 700) + (2 * 200) = 3500 + 400 = 3900 EGP
        // Revenue = 7 * 500 = 3500 EGP
        // Gross Profit = 3500 - 3900 = -400 EGP
        assertEquals(0, new BigDecimal("3900.0000").compareTo(saleItem.getCogs()));
        assertEquals(0, new BigDecimal("-400.0000").compareTo(saleItem.getGrossProfit()));

        // Check Batch Remaining States
        InventoryBatch updatedBatch1 = batchRepository.findById(batch1.getId()).orElseThrow();
        InventoryBatch updatedBatch2 = batchRepository.findById(batch2.getId()).orElseThrow();
        assertEquals(0, updatedBatch1.getRemainingQuantity());
        assertEquals(InventoryBatch.BatchStatus.EXHAUSTED, updatedBatch1.getStatus());
        assertEquals(8, updatedBatch2.getRemainingQuantity());

        // Valuation after Sale = 8 * 200 = 1600 EGP
        BigDecimal postSaleValuation = fifoCostingService.calculateInventoryValuation(tenantId);
        assertEquals(0, new BigDecimal("1600.0000").compareTo(postSaleValuation));

        // Step 4: Customer Returns 3 units
        fifoCostingService.processCustomerReturn(tenantId, warehouseId, saleItem.getId(), 3, employeeId);

        SaleItem returnedItem = saleItemRepository.findById(saleItem.getId()).orElseThrow();
        // Still sold: 4 @ 500 = 2000; COGS: 3900 - (2*200 + 1*700) = 2800; profit = -800
        assertEquals(3, returnedItem.getQuantityReturned());
        assertEquals(0, new BigDecimal("2800.0000").compareTo(returnedItem.getCogs()));
        assertEquals(0, new BigDecimal("-800.0000").compareTo(returnedItem.getGrossProfit()));

        // Verify Return restored 2 units to Batch 2 and 1 unit to Batch 1
        InventoryBatch restoredBatch1 = batchRepository.findById(batch1.getId()).orElseThrow();
        InventoryBatch restoredBatch2 = batchRepository.findById(batch2.getId()).orElseThrow();
        assertEquals(1, restoredBatch1.getRemainingQuantity());
        assertEquals(InventoryBatch.BatchStatus.ACTIVE, restoredBatch1.getStatus());
        assertEquals(10, restoredBatch2.getRemainingQuantity());

        // Verify Ledger Transactions
        List<InventoryLedgerTransaction> ledger = fifoCostingService.getInventoryLedger(tenantId, dogFoodVariant.getId());
        assertFalse(ledger.isEmpty());
    }

    @Test
    @DisplayName("2. Sequential allocation enforces stock ceiling (5 units, 10 attempts)")
    void testSequentialAllocationsRespectStockCeiling() {
        fifoCostingService.createPurchaseBatch(
                tenantId, warehouseId, dogFoodVariant.getId(), null, null,
                "LOT-CONC", new BigDecimal("700.0000"), 5, LocalDate.now().plusMonths(6), Instant.now(), employeeId
        );

        int successes = 0;
        int failures = 0;
        for (int i = 0; i < 10; i++) {
            final int attempt = i;
            try {
                transactionTemplate.executeWithoutResult(status -> {
                    Sale sale = Sale.builder()
                            .id(UUID.randomUUID().toString())
                            .saleNumber("INV-SEQ-" + UUID.randomUUID().toString().substring(0, 8) + "-" + attempt)
                            .posSession(posSession)
                            .employee(employee)
                            .totalAmount(new BigDecimal("500.00"))
                            .tax(BigDecimal.ZERO)
                            .discount(BigDecimal.ZERO)
                            .paymentMethod("CASH")
                            .date(Instant.now())
                            .build();
                    saleRepository.save(sale);

                    SaleItem item = SaleItem.builder()
                            .id(UUID.randomUUID().toString())
                            .sale(sale)
                            .type("PRODUCT")
                            .itemId(dogFoodVariant.getId())
                            .name("Royal Canin 10kg")
                            .quantity(1)
                            .price(new BigDecimal("500.0000"))
                            .listPrice(new BigDecimal("500.0000"))
                            .cost(new BigDecimal("700.0000"))
                            .build();
                    saleItemRepository.save(item);
                    fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, item, employeeId);
                });
                successes++;
            } catch (InsufficientStockException e) {
                failures++;
            }
        }

        assertEquals(5, successes, "Exactly 5 allocations should succeed for 5 units");
        assertEquals(5, failures, "Remaining attempts must fail when stock is exhausted");
        assertTrue(fifoCostingService.getActiveBatches(tenantId, dogFoodVariant.getId()).isEmpty());
    }

    @Test
    @DisplayName("3. Stress & Performance Test: 5,000 Active Batches Aggregate Valuation Sub-500ms")
    void testLargeBatchStressAndValuationPerformance() {
        int batchCount = 5000;
        List<InventoryBatch> batches = new ArrayList<>();
        for (int i = 0; i < batchCount; i++) {
            batches.add(InventoryBatch.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .productVariant(dogFoodVariant)
                    .warehouse(warehouse)
                    .batchNumber("LOT-STRESS-" + i)
                    .unitCost(new BigDecimal("100.0000"))
                    .initialQuantity(10)
                    .remainingQuantity(10)
                    .purchaseDate(Instant.now())
                    .status(InventoryBatch.BatchStatus.ACTIVE)
                    .build());
        }
        batchRepository.saveAll(batches);

        long startMs = System.currentTimeMillis();
        BigDecimal totalValuation = fifoCostingService.calculateInventoryValuation(tenantId);
        long durationMs = System.currentTimeMillis() - startMs;

        // Total valuation = 5000 * 10 * 100 = 5,000,000 EGP
        assertEquals(0, new BigDecimal("5000000.0000").compareTo(totalValuation));
        assertTrue(durationMs < 500, "Database aggregate valuation query must complete sub-500ms (Actual: " + durationMs + "ms)");
    }
}
