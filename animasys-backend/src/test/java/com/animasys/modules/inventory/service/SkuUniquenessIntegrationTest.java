package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.service.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.animasys.support.IntegrationTestBase;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SkuUniquenessIntegrationTest extends IntegrationTestBase {

    @Autowired private SkuCatalogService skuCatalogService;
    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private SaleService saleService;
    @Autowired private CatalogQueryService catalogQueryService;
    @Autowired private ProductVariantDuplicateMergeService duplicateMergeService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private InventoryBatchRepository batchRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private CategoryRepository categoryRepository;

    private Employee employee;
    private Tenant tenant;
    private Branch branch;
    private Category category;

    @BeforeEach
    void seed() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-sku-uni-" + UUID.randomUUID().toString().substring(0, 8))
                .name("SKU Uniqueness Tenant")
                .subdomain("sku-uni-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("br-sku-uni-" + UUID.randomUUID().toString().substring(0, 8))
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
                .id("e-sku-uni-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("sku-uni-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("hash")
                .fullName("SKU Test")
                .email("sku-uni-" + UUID.randomUUID() + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());

        category = categoryRepository.save(Category.builder()
                .id("cat-sku-uni-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("SKU Uniqueness")
                .build());

        authenticate(employee);
    }

    @Test
    void importingSameSkuTenTimesCreatesSingleVariantAndMultipleBatches() {
        String sku = "DUP-SKU-" + System.currentTimeMillis();
        for (int i = 0; i < 10; i++) {
            runImportRow(sku, new BigDecimal("100"), new BigDecimal(20 + i), 5);
        }

        List<Product> products = productRepository.findByTenantId(tenant.getId()).stream()
                .filter(p -> SkuCatalogService.normalizeSku(p.getSku()).equals(SkuCatalogService.normalizeSku(sku)))
                .toList();
        assertEquals(1, products.size(), "exactly one product per SKU");

        List<ProductVariant> variants = variantRepository.findByProductId(products.get(0).getId());
        assertEquals(1, variants.size(), "exactly one variant per SKU");

        String variantId = variants.get(0).getId();
        List<InventoryBatch> batches = batchRepository
                .findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                        tenant.getId(), variantId, 0, InventoryBatch.BatchStatus.ACTIVE);
        assertEquals(10, batches.size(), "each import with stock creates a batch only");

        assertEquals(0, duplicateMergeService.countRemainingDuplicateSkuGroups(tenant.getId()));
    }

    @Test
    void posCatalogListsOneLinePerSkuAndFifoConsumesOldestBatch() {
        String sku = "FIFO-POS-" + System.currentTimeMillis();
        runImportRow(sku, new BigDecimal("50"), new BigDecimal("10"), 3);
        runImportRow(sku, new BigDecimal("50"), new BigDecimal("99"), 3);

        List<ProductVariant> catalog = catalogQueryService.listUniqueVariantsForTenant(tenant.getId());
        long skuLines = catalog.stream()
                .filter(v -> SkuCatalogService.normalizeSku(v.getSku()).equals(SkuCatalogService.normalizeSku(sku)))
                .count();
        assertEquals(1, skuLines, "POS/search catalog must expose one variant per SKU");

        ProductVariant variant = variantRepository.findByProductId(
                productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow().getId()).get(0);

        List<InventoryBatch> ordered = batchRepository
                .findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                        tenant.getId(), variant.getId(), 0, InventoryBatch.BatchStatus.ACTIVE);
        assertEquals(2, ordered.size());
        InventoryBatch oldest = ordered.get(0);
        assertEquals(0, new BigDecimal("10.0000").compareTo(oldest.getUnitCost()));

        POSSession session = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());

        SaleItem line = SaleItem.builder()
                .type("PRODUCT")
                .itemId(variant.getId())
                .name("SKU Uniqueness Product")
                .quantity(3)
                .price(new BigDecimal("50"))
                .cost(new BigDecimal("10"))
                .build();

        saleService.createSale(
                session.getId(),
                employee.getId(),
                null,
                new BigDecimal("150"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                List.of(line)
        );

        InventoryBatch after = batchRepository.findById(oldest.getId()).orElseThrow();
        assertEquals(0, after.getRemainingQuantity(), "FIFO must consume oldest batch first");
    }

    /**
     * Repeats the same "add stock for this SKU" flow that used to run through the (now removed)
     * bulk import pipeline: upsert-by-SKU must keep a single Product/ProductVariant, and each
     * call with stock adds its own opening InventoryBatch.
     */
    private void runImportRow(String sku, BigDecimal price, BigDecimal cost, int stock) {
        Product template = Product.builder()
                .id("p-sku-uni-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .sku(sku)
                .name("SKU Uniqueness Product")
                .category(category)
                .minStockLimit(10)
                .build();
        ProductVariant variant = skuCatalogService.upsertVariantForSku(tenant.getId(), template, null, price, cost);

        if (stock > 0) {
            fifoCostingService.createOpeningBatch(
                    tenant.getId(),
                    StockService.DEFAULT_SALES_WAREHOUSE,
                    variant.getId(),
                    cost,
                    stock,
                    null,
                    "SKU-UNI-" + UUID.randomUUID(),
                    employee.getId()
            );
        }
    }
}
