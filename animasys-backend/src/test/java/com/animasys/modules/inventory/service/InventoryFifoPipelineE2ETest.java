package com.animasys.modules.inventory.service;

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
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.dto.SaleRefundResult;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.service.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression note: this class used to be the only @SpringBootTest in the suite without
 * @ActiveProfiles("test") — it was silently running against the same persistent H2 file
 * the real app uses instead of an isolated in-memory database (see DataSourceConfig /
 * project memory), so its hardcoded, non-unique SKU literals could collide with leftover
 * rows from earlier runs of this same test. Fixed by isolating it like every sibling test.
 */
@SpringBootTest
@ActiveProfiles("test")
class InventoryFifoPipelineE2ETest {

    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private PurchaseInvoiceService purchaseInvoiceService;
    @Autowired private SaleService saleService;
    @Autowired private InventoryStockSyncService stockSyncService;
    @Autowired private InventoryIntegrityService inventoryIntegrityService;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleItemRepository saleItemRepository;
    @Autowired private SaleItemBatchAllocationRepository saleItemBatchAllocationRepository;
    @Autowired private InventoryBatchRepository batchRepository;

    private Tenant tenant;
    private Employee employee;
    private POSSession session;
    private Product product;
    private ProductVariant variant;

    @BeforeEach
    void seed() {
        String tenantId = UUID.randomUUID().toString();
        tenant = tenantRepository.save(Tenant.builder()
                .id(tenantId)
                .name("E2E Tenant")
                .subdomain("e2e-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        Branch branch = branchRepository.save(Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Branch")
                .address("Cairo")
                .build());

        if (!warehouseRepository.existsById(StockService.DEFAULT_SALES_WAREHOUSE)) {
            warehouseRepository.save(Warehouse.builder()
                    .id(StockService.DEFAULT_SALES_WAREHOUSE)
                    .branch(branch)
                    .name("Shelf")
                    .code("SHELF")
                    .build());
        }

        employee = employeeRepository.save(Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("e2e-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("hash")
                .fullName("E2E User")
                .email("e2e-" + UUID.randomUUID() + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());

        session = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());

        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("E2E")
                .build());

        product = productRepository.save(Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku("E2E-SKU-" + System.currentTimeMillis())
                .name("E2E Dog Food")
                .category(category)
                .minStockLimit(1)
                .build());

        variant = variantRepository.save(ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .sku(product.getSku())
                .name("Standard")
                .price(new BigDecimal("100.00"))
                .cost(new BigDecimal("40.00"))
                .stockQuantity(0)
                .build());
    }

    @Test
    @DisplayName("Purchase → Batch → Sale → Partial/Full Refund → Valuation → Reconcile")
    void fullPipeline() {
        LocalDate expiry = LocalDate.now().plusMonths(6);
        PurchaseInvoice invoice = PurchaseInvoice.builder()
                .invoiceNumber("PI-E2E-" + System.currentTimeMillis())
                .invoiceDate(LocalDate.now().toString())
                .supplierName("E2E Supplier")
                .currency("EGP")
                .vat(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .shipping(BigDecimal.ZERO)
                .netTotal(new BigDecimal("200.00"))
                .grandTotal(new BigDecimal("200.00"))
                .items(List.of(PurchaseInvoiceItem.builder()
                        .productName("E2E Dog Food")
                        .sku(product.getSku())
                        .cost(new BigDecimal("40.00"))
                        .price(new BigDecimal("100.00"))
                        .quantity(5)
                        .expiryDate(expiry)
                        .build()))
                .build();

        var createResult = purchaseInvoiceService.createInvoice(invoice, employee.getId(), tenant.getId());
        assertTrue(createResult.getStockReceiptWarnings().isEmpty());
        assertEquals(expiry, batchRepository.findAll().stream()
                .filter(b -> tenant.getId().equals(b.getTenantId()))
                .findFirst()
                .orElseThrow()
                .getExpiryDate());

        assertEquals(5, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), variant.getId()));
        assertEquals(5, variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity());

        SaleItem line = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .name("E2E Dog Food")
                .quantity(2)
                .price(new BigDecimal("100.00"))
                .cost(new BigDecimal("40.00"))
                .build();

        Sale sale = saleService.createSale(
                session.getId(),
                employee.getId(),
                null,
                new BigDecimal("200.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                List.of(line)
        );

        SaleItem persistedItem = saleItemRepository.findAll().stream()
                .filter(i -> sale.getId().equals(i.getSale().getId()))
                .findFirst()
                .orElseThrow();
        assertTrue(persistedItem.getCogs().compareTo(BigDecimal.ZERO) > 0);
        assertEquals(3, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), variant.getId()));

        SaleRefundResult partial = saleService.refundSale(
                sale.getId(),
                employee.getId(),
                List.of(SaleRefundLineRequest.builder()
                        .saleItemId(persistedItem.getId())
                        .quantity(1)
                        .build()));
        assertFalse(partial.isFullRefund());
        assertEquals("PARTIALLY_REFUNDED", partial.getSale().getStatus());
        assertEquals(4, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), variant.getId()));

        SaleRefundResult full = saleService.refundSale(sale.getId(), employee.getId(), null);
        assertTrue(full.isFullRefund());
        assertEquals(5, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), variant.getId()));
        assertEquals(5, variantRepository.findById(variant.getId()).orElseThrow().getStockQuantity());
        assertEquals(0, fifoCostingService.calculateInventoryValuation(tenant.getId()).compareTo(new BigDecimal("200.0000")));

        Map<String, Object> reconcile = inventoryIntegrityService.reconcileTenant(tenant.getId());
        assertTrue(((Map<?, ?>) reconcile.get("priorMismatches")).isEmpty());
    }

    @Test
    @DisplayName("Purchase line with unrecognized SKU but a product name auto-creates the product and receives stock")
    void purchaseSkuWarning() {
        // Renamed/updated from its original intent ("bad SKU returns a warning and skips the
        // batch"): PurchaseInvoiceService.receiveStockFromInvoice now auto-creates a brand-new
        // product on the fly whenever a purchase line has an unrecognized SKU *and* a product
        // name (see the "Unknown SKU but a product name was typed in" branch) instead of
        // warning and skipping. This test now asserts that real, intended current behavior.
        String newSku = "NO-SUCH-SKU-" + UUID.randomUUID().toString().substring(0, 8);
        PurchaseInvoice invoice = PurchaseInvoice.builder()
                .invoiceNumber("PI-BAD-" + System.currentTimeMillis())
                .invoiceDate(LocalDate.now().toString())
                .supplierName("E2E Supplier " + UUID.randomUUID().toString().substring(0, 8))
                .currency("EGP")
                .vat(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .shipping(BigDecimal.ZERO)
                .netTotal(new BigDecimal("40.00"))
                .grandTotal(new BigDecimal("40.00"))
                .items(List.of(PurchaseInvoiceItem.builder()
                        .productName("Unknown")
                        .sku(newSku)
                        .cost(new BigDecimal("40.00"))
                        .price(new BigDecimal("100.00"))
                        .quantity(1)
                        .expiryDate(LocalDate.now().plusMonths(3))
                        .build()))
                .build();

        var result = purchaseInvoiceService.createInvoice(invoice, employee.getId(), tenant.getId());

        assertTrue(result.getStockReceiptWarnings().isEmpty(),
                "Auto-creating the product from a valid name must not produce a warning");
        assertEquals(newSku, result.getInvoice().getItems().get(0).getSku());

        Product createdProduct = productRepository.findBySkuIgnoreCaseAndTenantId(newSku, tenant.getId())
                .orElseThrow(() -> new AssertionError("Auto-created product not found for sku " + newSku));
        ProductVariant createdVariant = variantRepository.findByProductId(createdProduct.getId()).stream()
                .findFirst()
                .orElseThrow(() -> new AssertionError("Auto-created product has no variant"));
        assertEquals(1, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), createdVariant.getId()));

        // The pre-existing baseline product/variant from setUp() must be untouched by this line.
        assertEquals(0, fifoCostingService.getAvailableBatchQuantity(tenant.getId(), variant.getId()));
    }

    @Test
    @DisplayName("FEFO allocates nearest expiry batch first")
    void fefoSelectsNearestExpiry() {
        tenant.setInventoryDeductionStrategy("FEFO");
        tenantRepository.save(tenant);

        LocalDate sooner = LocalDate.now().plusDays(15);
        LocalDate later = LocalDate.now().plusDays(120);
        Instant now = Instant.now();

        InventoryBatch nearBatch = fifoCostingService.createPurchaseBatch(
                tenant.getId(),
                StockService.DEFAULT_SALES_WAREHOUSE,
                variant.getId(),
                null,
                null,
                "FEFO-NEAR",
                new BigDecimal("10.00"),
                5,
                sooner,
                now,
                employee.getId()
        );
        fifoCostingService.createPurchaseBatch(
                tenant.getId(),
                StockService.DEFAULT_SALES_WAREHOUSE,
                variant.getId(),
                null,
                null,
                "FEFO-FAR",
                new BigDecimal("20.00"),
                5,
                later,
                now,
                employee.getId()
        );

        SaleItem line = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .name("E2E Dog Food")
                .quantity(2)
                .price(new BigDecimal("100.00"))
                .cost(new BigDecimal("40.00"))
                .build();

        Sale sale = saleService.createSale(
                session.getId(),
                employee.getId(),
                null,
                new BigDecimal("200.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                List.of(line)
        );

        SaleItem persistedItem = saleItemRepository.findAll().stream()
                .filter(i -> sale.getId().equals(i.getSale().getId()))
                .findFirst()
                .orElseThrow();

        var allocs = saleItemBatchAllocationRepository.findBySaleItemId(persistedItem.getId());
        assertFalse(allocs.isEmpty());
        assertEquals(nearBatch.getId(), allocs.get(0).getInventoryBatch().getId());
    }
}
