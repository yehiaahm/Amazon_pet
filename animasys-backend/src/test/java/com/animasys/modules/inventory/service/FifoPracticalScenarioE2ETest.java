package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.dto.BulkImportItem;
import com.animasys.modules.inventory.dto.ChunkImportRequest;
import com.animasys.modules.inventory.dto.StartImportRequest;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.service.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.animasys.support.IntegrationTestBase;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Practical FIFO checklist requested for production readiness sign-off.
 */
@SpringBootTest
class FifoPracticalScenarioE2ETest extends IntegrationTestBase {

    @Autowired private ImportService importService;
    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private SaleService saleService;
    @Autowired private InventoryIntegrityService inventoryIntegrityService;
    @Autowired private InventoryStockSyncService stockSyncService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private InventoryBatchRepository batchRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleItemRepository saleItemRepository;
    @Autowired private SaleItemBatchAllocationRepository allocationRepository;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;
    private POSSession posSession;

    @BeforeEach
    void seedTenant() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-fifo-practical-" + UUID.randomUUID().toString().substring(0, 8))
                .name("FIFO Practical")
                .subdomain("fifo-pr-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("br-fifo-pr-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main")
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
                .id("e-fifo-pr-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("fifo-pr-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("hash")
                .fullName("FIFO Practical")
                .email("fifo-pr-" + UUID.randomUUID() + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());

        authenticate(employee);

        posSession = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());
    }

    @Test
    @DisplayName("1) Import same SKU 5× different prices → one variant, five batches")
    void importSameSkuFiveTimes_oneVariantFiveBatches() {
        String sku = "FIFO-IMP-" + System.currentTimeMillis();
        BigDecimal[] costs = {
                new BigDecimal("10"), new BigDecimal("20"), new BigDecimal("30"),
                new BigDecimal("40"), new BigDecimal("50")
        };
        BigDecimal[] prices = {
                new BigDecimal("100"), new BigDecimal("110"), new BigDecimal("120"),
                new BigDecimal("130"), new BigDecimal("140")
        };

        for (int i = 0; i < 5; i++) {
            runImportRow(sku, "FIFO Practical Product", prices[i], costs[i], 1);
        }

        Product product = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow();
        List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
        assertEquals(1, variants.size(), "must keep exactly one ProductVariant per SKU");

        String variantId = variants.get(0).getId();
        List<InventoryBatch> batches = batchRepository
                .findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                        tenant.getId(), variantId, 0, InventoryBatch.BatchStatus.ACTIVE);
        assertEquals(5, batches.size(), "each import with stock must create its own InventoryBatch");

        assertBatchSumMatchesVariantStock(variantId);
    }

    @Test
    @DisplayName("2) Sale spans batches → FIFO COGS (10×120 + 5×150)")
    void saleAcrossTwoBatches_fifoCogs() {
        ProductVariant variant = createCatalogVariant("FIFO-SALE-" + System.currentTimeMillis());
        LocalDate expiry = LocalDate.now().plusMonths(12);
        Instant older = Instant.parse("2026-01-01T00:00:00Z");
        Instant newer = Instant.parse("2026-02-01T00:00:00Z");

        InventoryBatch batch1 = fifoCostingService.createPurchaseBatch(
                tenant.getId(), StockService.DEFAULT_SALES_WAREHOUSE, variant.getId(),
                null, null, "B1-120", new BigDecimal("120.0000"), 10, expiry, older, employee.getId());
        InventoryBatch batch2 = fifoCostingService.createPurchaseBatch(
                tenant.getId(), StockService.DEFAULT_SALES_WAREHOUSE, variant.getId(),
                null, null, "B2-150", new BigDecimal("150.0000"), 20, expiry, newer, employee.getId());

        Sale sale = sellProduct(variant.getId(), 15, new BigDecimal("200.00"));
        SaleItem line = saleItemRepository.findAll().stream()
                .filter(i -> sale.getId().equals(i.getSale().getId()))
                .findFirst()
                .orElseThrow();

        BigDecimal expectedCogs = new BigDecimal("120.0000").multiply(BigDecimal.TEN)
                .add(new BigDecimal("150.0000").multiply(new BigDecimal("5")));
        assertEquals(0, expectedCogs.compareTo(line.getCogs()), "COGS must be (10×120)+(5×150)");

        assertEquals(0, batchRepository.findById(batch1.getId()).orElseThrow().getRemainingQuantity());
        assertEquals(15, batchRepository.findById(batch2.getId()).orElseThrow().getRemainingQuantity());

        List<SaleItemBatchAllocation> allocs = allocationRepository.findBySaleItemId(line.getId());
        assertEquals(2, allocs.size());
        assertEquals(batch1.getId(), allocs.get(0).getInventoryBatch().getId());
        assertEquals(10, allocs.get(0).getQuantityAllocated());
        assertEquals(batch2.getId(), allocs.get(1).getInventoryBatch().getId());
        assertEquals(5, allocs.get(1).getQuantityAllocated());

        assertBatchSumMatchesVariantStock(variant.getId());
    }

    @Test
    @DisplayName("3) Partial return restores stock on the batches that supplied the sale")
    void partialReturn_restoresBatchQuantities() {
        ProductVariant variant = createCatalogVariant("FIFO-RET-" + System.currentTimeMillis());
        LocalDate expiry = LocalDate.now().plusMonths(12);
        InventoryBatch batch1 = fifoCostingService.createPurchaseBatch(
                tenant.getId(), StockService.DEFAULT_SALES_WAREHOUSE, variant.getId(),
                null, null, "R-B1", new BigDecimal("120.0000"), 10, expiry,
                Instant.parse("2026-01-01T00:00:00Z"), employee.getId());
        InventoryBatch batch2 = fifoCostingService.createPurchaseBatch(
                tenant.getId(), StockService.DEFAULT_SALES_WAREHOUSE, variant.getId(),
                null, null, "R-B2", new BigDecimal("150.0000"), 20, expiry,
                Instant.parse("2026-02-01T00:00:00Z"), employee.getId());

        Sale sale = sellProduct(variant.getId(), 15, new BigDecimal("200.00"));
        SaleItem line = saleItemRepository.findAll().stream()
                .filter(i -> sale.getId().equals(i.getSale().getId()))
                .findFirst()
                .orElseThrow();

        saleService.refundSale(sale.getId(), employee.getId(), List.of(
                SaleRefundLineRequest.builder().saleItemId(line.getId()).quantity(5).build()));

        assertEquals(0, batchRepository.findById(batch1.getId()).orElseThrow().getRemainingQuantity(),
                "first batch stays fully consumed");
        assertEquals(20, batchRepository.findById(batch2.getId()).orElseThrow().getRemainingQuantity(),
                "return 5 must restore the 5 units taken from the second batch");

        List<SaleItemBatchAllocation> allocs = allocationRepository.findBySaleItemId(line.getId());
        int stillAllocated = allocs.stream().mapToInt(SaleItemBatchAllocation::getQuantityAllocated).sum();
        assertEquals(10, stillAllocated, "10 units remain sold after returning 5 of 15");

        assertBatchSumMatchesVariantStock(variant.getId());
    }

    @Test
    @DisplayName("4) Re-import same SKU (Excel flow) updates product — no new variant")
    void reimportSameSku_updatesWithoutNewVariant() {
        String sku = "FIFO-XLS-" + System.currentTimeMillis();
        runImportRow(sku, "Original Name", new BigDecimal("99"), new BigDecimal("50"), 2);

        Product product = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow();
        String variantId = variantRepository.findByProductId(product.getId()).get(0).getId();

        runImportRow(sku, "Updated Excel Name", new BigDecimal("149"), new BigDecimal("70"), 3);

        product = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow();
        assertEquals("Updated Excel Name", product.getName());
        List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
        assertEquals(1, variants.size());
        assertEquals(variantId, variants.get(0).getId(), "must not create another ProductVariant");

        assertBatchSumMatchesVariantStock(variantId);
    }

    @Test
    @DisplayName("5) After import + update, batch sum equals variant stock (integrity gate)")
    void stockIntegrityGateAfterImportOperations() {
        String sku = "FIFO-FULL-" + System.currentTimeMillis();

        for (int i = 0; i < 5; i++) {
            runImportRow(sku, "Full Flow Product", new BigDecimal(100 + i * 10), new BigDecimal(10 + i * 10), 1);
        }
        ProductVariant variant = variantRepository.findByProductId(
                productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow().getId()).get(0);
        assertEquals(1, variantRepository.findByProductId(variant.getProduct().getId()).size());
        assertEquals(5, batchRepository
                .findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                        tenant.getId(), variant.getId(), 0, InventoryBatch.BatchStatus.ACTIVE).size());

        runImportRow(sku, "Full Flow Updated", new BigDecimal("160"), new BigDecimal("80"), 0);
        assertEquals(1, variantRepository.findByProductId(variant.getProduct().getId()).size());

        inventoryIntegrityService.reconcileTenant(tenant.getId());
        assertBatchSumMatchesVariantStock(variant.getId());
        assertTrue(inventoryIntegrityService.isVariantAligned(tenant.getId(), variant.getId()));
    }

    private void runImportRow(String sku, String name, BigDecimal price, BigDecimal cost, int stock) {
        StartImportRequest start = new StartImportRequest();
        start.setFileName("fifo-practical.xlsx");
        start.setFileSize(10L);
        start.setFileHash("hash-" + UUID.randomUUID());
        start.setUploadedBy(employee.getId());
        start.setDuplicateStrategy("UPDATE");
        start.setTargetType("PRODUCTS");
        ImportSession session = importService.startSession(start);

        BulkImportItem item = new BulkImportItem();
        item.setSku(sku);
        item.setProductName(name);
        item.setPrice(price);
        item.setCost(cost);
        item.setStock(stock);

        ChunkImportRequest chunk = new ChunkImportRequest();
        chunk.setEmployeeId(employee.getId());
        chunk.setDryRun(false);
        chunk.setItems(List.of(item));
        importService.processChunk(session.getId(), chunk);
        importService.finalizeSession(session.getId());
    }

    private ProductVariant createCatalogVariant(String sku) {
        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("FIFO")
                .build());
        Product product = productRepository.save(Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku(sku)
                .name("Catalog " + sku)
                .category(category)
                .minStockLimit(1)
                .build());
        return variantRepository.save(ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .sku(sku)
                .name("Standard")
                .price(new BigDecimal("100.00"))
                .cost(new BigDecimal("10.00"))
                .stockQuantity(0)
                .build());
    }

    private Sale sellProduct(String variantId, int qty, BigDecimal unitPrice) {
        SaleItem line = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variantId)
                .name("Line")
                .quantity(qty)
                .price(unitPrice)
                .cost(BigDecimal.ZERO)
                .build();
        return saleService.createSale(
                posSession.getId(),
                employee.getId(),
                null,
                unitPrice.multiply(BigDecimal.valueOf(qty)),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                List.of(line));
    }

    private void assertBatchSumMatchesVariantStock(String variantId) {
        int batchSum = stockSyncService.sumActiveBatchQuantity(tenant.getId(), variantId);
        int variantStock = variantRepository.findById(variantId).orElseThrow().getStockQuantity();
        assertEquals(batchSum, variantStock,
                "sum(InventoryBatch.remainingQuantity) must equal ProductVariant.stockQuantity");
        assertTrue(inventoryIntegrityService.isVariantAligned(tenant.getId(), variantId));
    }
}
