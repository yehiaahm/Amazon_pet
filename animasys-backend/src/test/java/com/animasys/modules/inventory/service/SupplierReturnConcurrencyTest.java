package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Real-thread concurrency test for the production-readiness scenario Yehia specified:
 * a batch of quantity 10, with two simultaneous "return 7" requests. The system must
 * never allow returning 14 units when only 10 were ever received — one request must
 * succeed and the other must be rejected (not silently under/over-deduct).
 */
class SupplierReturnConcurrencyTest extends IntegrationTestBase {

    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Autowired private FifoCostingService fifoCostingService;

    private Tenant tenant;
    private Employee manager;
    private Warehouse warehouse;
    private ProductVariant variant;
    private PurchaseInvoice invoice;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-ret-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Return Race Tenant")
                .subdomain("ret-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-ret-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main Branch")
                .build());

        warehouse = warehouseRepository.save(Warehouse.builder()
                .id("wh-ret-" + UUID.randomUUID().toString().substring(0, 8))
                .branch(branch)
                .name("Default WH")
                .code("WH-RET")
                .build());

        manager = employeeRepository.save(Employee.builder()
                .id("e-ret-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("mgr-ret-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Manager User")
                .email("mgr-ret-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build());

        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Cat-Ret")
                .build());
        String sku = "RET-RACE-" + UUID.randomUUID().toString().substring(0, 8);
        Product product = productRepository.save(Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku(sku)
                .name("Return Race Product")
                .category(category)
                .build());
        variant = variantRepository.save(ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .sku(sku)
                .name("Variant " + sku)
                .price(new BigDecimal("100.00"))
                .cost(new BigDecimal("40.00"))
                .stockQuantity(0)
                .build());

        invoice = purchaseInvoiceRepository.save(PurchaseInvoice.builder()
                .id("pi-ret-" + UUID.randomUUID().toString().substring(0, 8))
                .invoiceNumber("PI-RET-" + UUID.randomUUID().toString().substring(0, 6))
                .invoiceDate(LocalDate.now().toString())
                .supplierName("Race Supplier")
                .currency("EGP")
                .status("COMPLETED")
                .paymentStatus("UNPAID")
                .netTotal(new BigDecimal("400.00"))
                .grandTotal(new BigDecimal("400.00"))
                .uploadedBy(manager)
                .uploadedAt(Instant.now())
                .fingerprint("fp-ret-" + UUID.randomUUID())
                .build());

        authenticate(manager);
    }

    @Test
    @DisplayName("Concurrency: two simultaneous 'return 7' requests on a 10-unit batch never both succeed")
    void concurrentPartialReturnsCannotExceedReceivedQuantity() throws InterruptedException {
        int receivedQty = 10;
        fifoCostingService.createPurchaseBatch(
                tenant.getId(), warehouse.getId(), variant.getId(), null, invoice.getId(),
                "BATCH-RACE-RECEIVE", new BigDecimal("40.00"), receivedQty,
                LocalDate.now().plusMonths(6), Instant.now(), manager.getId());

        int totalThreads = 2;
        int returnQtyPerThread = 7;
        ExecutorService executorService = Executors.newFixedThreadPool(totalThreads);
        CountDownLatch ready = new CountDownLatch(totalThreads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(totalThreads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger rejectedCount = new AtomicInteger(0);
        AtomicInteger otherFailureCount = new AtomicInteger(0);

        for (int i = 0; i < totalThreads; i++) {
            executorService.submit(() -> {
                try {
                    authenticate(manager);
                    ready.countDown();
                    start.await();
                    fifoCostingService.processSupplierReturn(
                            tenant.getId(), invoice.getId(), variant.getId(), returnQtyPerThread, manager.getId());
                    successCount.incrementAndGet();
                } catch (com.animasys.core.exception.BusinessRuleException ex) {
                    rejectedCount.incrementAndGet();
                } catch (Exception ex) {
                    otherFailureCount.incrementAndGet();
                } finally {
                    done.countDown();
                }
            });
        }

        ready.await(5, TimeUnit.SECONDS);
        start.countDown();
        assertTrue(done.await(30, TimeUnit.SECONDS), "Both concurrent return attempts must finish within 30s");
        executorService.shutdown();

        assertEquals(0, otherFailureCount.get(),
                "Every concurrent return attempt must resolve to either success or a clean BusinessRuleException rejection — no other failure mode");
        assertEquals(1, successCount.get(),
                "Exactly one of the two concurrent 'return 7' requests must succeed — both succeeding would return 14 units from a 10-unit batch");
        assertEquals(1, rejectedCount.get(),
                "The losing concurrent request must be cleanly rejected, not silently under/over-deduct stock");

        int totalReturned = receivedQty - fifoCostingService.getAvailableBatchQuantity(tenant.getId(), warehouse.getId(), variant.getId());
        assertEquals(returnQtyPerThread, totalReturned,
                "Total quantity actually removed from the batch must equal exactly one successful return (7), never both (14)");
    }
}
