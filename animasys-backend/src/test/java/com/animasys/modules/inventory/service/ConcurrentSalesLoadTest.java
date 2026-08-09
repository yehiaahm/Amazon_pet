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
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
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

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@ActiveProfiles("test")
public class ConcurrentSalesLoadTest extends IntegrationTestBase {

    @Autowired
    private FifoCostingService fifoCostingService;

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
    private InventoryBatchRepository batchRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private ProductVariant variant;
    private String tenantId;
    private String warehouseId;
    private String employeeId;
    private POSSession posSession;
    private Employee employee;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder()
                .id(tenantId)
                .name("Load Test Tenant")
                .subdomain("load-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        Branch branch = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("B1").build();
        branchRepository.save(branch);

        Warehouse w1 = Warehouse.builder().id(UUID.randomUUID().toString()).branch(branch).name("WH").code("W").build();
        warehouseRepository.save(w1);
        warehouseId = w1.getId();

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("emp-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Emp")
                .email("emp-" + UUID.randomUUID().toString().substring(0, 8) + "@load.test")
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
                .openingBalance(BigDecimal.ZERO)
                .status("OPEN")
                .build();
        posSessionRepository.save(posSession);

        Category category = Category.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("Cat").build();
        categoryRepository.save(category);

        String sku = "SKU-LOAD-" + UUID.randomUUID().toString().substring(0, 8);
        Product product = Product.builder().id(UUID.randomUUID().toString()).tenant(tenant).sku(sku).name("Prod").category(category).build();
        productRepository.save(product);

        variant = ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenantId)
                .sku(sku)
                .name("Prod")
                .price(new BigDecimal("100"))
                .cost(new BigDecimal("50"))
                .stockQuantity(0)
                .build();
        productVariantRepository.save(variant);
    }

    @Test
    @DisplayName("Load test: 50 concurrent sales on 30 items. Only 30 should succeed.")
    void testConcurrentSalesWithPessimisticLocking() throws InterruptedException {
        // Add exactly 30 units
        fifoCostingService.createPurchaseBatch(
                tenantId, warehouseId, variant.getId(), null, null,
                "LOT-LOAD", new BigDecimal("50"), 30, LocalDate.now().plusMonths(1), Instant.now(), employeeId
        );

        String runId = UUID.randomUUID().toString().substring(0, 8);
        int totalRequests = 50;
        ExecutorService executorService = Executors.newFixedThreadPool(10);
        CountDownLatch latch = new CountDownLatch(totalRequests);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);

        for (int i = 0; i < totalRequests; i++) {
            final int attempt = i;
            executorService.submit(() -> {
                try {
                    transactionTemplate.executeWithoutResult(status -> {
                        Sale sale = Sale.builder()
                                .id(UUID.randomUUID().toString())
                                .saleNumber("INV-" + runId + "-" + attempt)
                                .posSession(posSession)
                                .employee(employee)
                                .totalAmount(new BigDecimal("100"))
                                .tax(BigDecimal.ZERO)
                                .discount(BigDecimal.ZERO)
                                .paymentMethod("CASH")
                                .status("COMPLETED")
                                .build();
                        saleRepository.save(sale);

                        SaleItem item = SaleItem.builder()
                                .id(UUID.randomUUID().toString())
                                .sale(sale)
                                .type("PRODUCT")
                                .itemId(variant.getId())
                                .name("Prod")
                                .quantity(1)
                                .price(new BigDecimal("100"))
                                .listPrice(new BigDecimal("100"))
                                .cost(new BigDecimal("50"))
                                .build();
                        saleItemRepository.save(item);

                        fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, item, employeeId);
                    });
                    successCount.incrementAndGet();
                } catch (InsufficientStockException e) {
                    failCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executorService.shutdown();

        assertEquals(30, successCount.get(), "Exactly 30 sales should succeed");
        assertEquals(20, failCount.get(), "Exactly 20 sales should fail due to insufficient stock");
        
        List<InventoryBatch> remainingBatches = batchRepository.findByProductVariantId(variant.getId());
        assertEquals(0, remainingBatches.get(0).getRemainingQuantity(), "Batch should be fully exhausted");
    }
}
