package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.ImportSession;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.dto.BulkImportItem;
import com.animasys.modules.inventory.dto.ChunkImportRequest;
import com.animasys.modules.inventory.dto.StartImportRequest;
import com.animasys.modules.inventory.repository.ImportSessionRepository;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.animasys.support.IntegrationTestBase;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ImportServiceBatchE2ETest extends IntegrationTestBase {

    @Autowired private ImportService importService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private InventoryBatchRepository batchRepository;
    @Autowired private ImportSessionRepository sessionRepository;
    @Autowired private CategoryRepository categoryRepository;

    private Employee employee;
    private Tenant tenant;
    private Branch branch;

    @BeforeEach
    void seed() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-import-" + suffix)
                .name("Import E2E Tenant")
                .subdomain("import-" + suffix)
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("br-import-" + suffix)
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
                .id("e-import-" + suffix)
                .tenant(tenant)
                .branch(branch)
                .username("import-" + suffix)
                .passwordHash("hash")
                .fullName("Import E2E")
                .email("import-" + suffix + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());

        authenticate(employee);
    }

    @Test
    void importNewSkuWithStockCreatesPersistedBatch() {
        String sku = "IMP-" + System.currentTimeMillis();
        StartImportRequest start = new StartImportRequest();
        start.setFileName("test.xlsx");
        start.setFileSize(100L);
        start.setFileHash("hash-" + UUID.randomUUID());
        start.setUploadedBy(employee.getId());
        start.setDuplicateStrategy("UPDATE");
        start.setTargetType("PRODUCTS");
        ImportSession session = importService.startSession(start);

        BulkImportItem item = new BulkImportItem();
        item.setSku(sku);
        item.setProductName("Imported Product");
        item.setPrice(new BigDecimal("50"));
        item.setCost(new BigDecimal("30"));
        item.setStock(10);

        ChunkImportRequest chunk = new ChunkImportRequest();
        chunk.setEmployeeId(employee.getId());
        chunk.setDryRun(false);
        chunk.setItems(List.of(item));

        assertDoesNotThrow(() -> importService.processChunk(session.getId(), chunk));
        importService.finalizeSession(session.getId());

        assertTrue(productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).isPresent());
        var variants = variantRepository.findByProductId(
                productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow().getId());
        assertEquals(1, variants.size());
        assertEquals(10, variants.get(0).getStockQuantity());

        int batches = batchRepository.findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                tenant.getId(), variants.get(0).getId(), 0,
                com.animasys.modules.inventory.domain.InventoryBatch.BatchStatus.ACTIVE).size();
        assertEquals(1, batches);
    }

    @Test
    void importUpdateOnProductWithoutVariantCreatesVariantAndBatch() {
        Category category = categoryRepository.save(Category.builder()
                .id("cat-orphan-" + System.currentTimeMillis())
                .tenant(tenant)
                .name("General")
                .build());
        String sku = "ORPHAN-" + System.currentTimeMillis();
        String productId = "p-orphan-" + System.currentTimeMillis();
        productRepository.save(Product.builder()
                .id(productId)
                .tenant(tenant)
                .sku(sku)
                .name("Orphan Product")
                .category(category)
                .minStockLimit(1)
                .build());

        StartImportRequest start = new StartImportRequest();
        start.setFileName("update.xlsx");
        start.setFileSize(50L);
        start.setFileHash("hash-orphan-" + UUID.randomUUID());
        start.setUploadedBy(employee.getId());
        start.setDuplicateStrategy("UPDATE");
        start.setTargetType("PRODUCTS");
        ImportSession session = importService.startSession(start);

        BulkImportItem item = new BulkImportItem();
        item.setSku(sku);
        item.setProductName("Orphan Product");
        item.setPrice(new BigDecimal("20"));
        item.setCost(new BigDecimal("10"));
        item.setStock(5);

        ChunkImportRequest chunk = new ChunkImportRequest();
        chunk.setEmployeeId(employee.getId());
        chunk.setDryRun(false);
        chunk.setItems(List.of(item));

        assertDoesNotThrow(() -> importService.processChunk(session.getId(), chunk));

        var variants = variantRepository.findByProductId(productId);
        assertEquals(1, variants.size());
        assertEquals(5, variants.get(0).getStockQuantity());
    }

    @Test
    void secondImportWithSameSkuUpdatesPriceNotNewProduct() {
        String sku = "LITTER-" + System.currentTimeMillis();
        StartImportRequest start = new StartImportRequest();
        start.setFileName("first.xlsx");
        start.setFileSize(10L);
        start.setFileHash("hash-first-" + UUID.randomUUID());
        start.setUploadedBy(employee.getId());
        start.setDuplicateStrategy("UPDATE");
        start.setTargetType("PRODUCTS");
        ImportSession session1 = importService.startSession(start);

        BulkImportItem first = new BulkImportItem();
        first.setSku(sku);
        first.setProductName("Crystal Cat Litter SKU Flow");
        first.setPrice(new BigDecimal("120"));
        first.setCost(new BigDecimal("80"));
        first.setStock(3);

        ChunkImportRequest chunk1 = new ChunkImportRequest();
        chunk1.setEmployeeId(employee.getId());
        chunk1.setDryRun(false);
        chunk1.setItems(List.of(first));
        importService.processChunk(session1.getId(), chunk1);
        importService.finalizeSession(session1.getId());

        StartImportRequest start2 = new StartImportRequest();
        start2.setFileName("second.xlsx");
        start2.setFileSize(10L);
        start2.setFileHash("hash-second-" + UUID.randomUUID());
        start2.setUploadedBy(employee.getId());
        start2.setDuplicateStrategy("UPDATE");
        start2.setTargetType("PRODUCTS");
        ImportSession session2 = importService.startSession(start2);

        BulkImportItem second = new BulkImportItem();
        second.setSku(sku);
        second.setProductName("Crystal Cat Litter SKU Flow");
        second.setPrice(new BigDecimal("150"));
        second.setCost(new BigDecimal("90"));

        ChunkImportRequest chunk2 = new ChunkImportRequest();
        chunk2.setEmployeeId(employee.getId());
        chunk2.setDryRun(false);
        chunk2.setItems(List.of(second));
        importService.processChunk(session2.getId(), chunk2);

        assertEquals(1, productRepository.findByNameIgnoreCaseAndTenantId("Crystal Cat Litter SKU Flow", tenant.getId()).size());
        var product = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId()).orElseThrow();
        var variants = variantRepository.findByProductId(product.getId());
        assertEquals(1, variants.size());
        assertEquals(0, new BigDecimal("150").compareTo(variants.get(0).getPrice()));
    }

    @Test
    void secondImportWithoutSkuUpdatesByUniqueProductName() {
        String sku = "SKU-NAME-" + System.currentTimeMillis();
        Category category = categoryRepository.save(Category.builder()
                .id("cat-name-" + System.currentTimeMillis())
                .tenant(tenant)
                .name("Litter")
                .build());
        String productId = "p-crystal-" + System.currentTimeMillis();
        String variantId = "v-crystal-" + System.currentTimeMillis();
        productRepository.save(Product.builder()
                .id(productId)
                .tenant(tenant)
                .sku(sku)
                .name("Crystal Cat Litter")
                .category(category)
                .minStockLimit(1)
                .build());
        variantRepository.save(com.animasys.modules.inventory.domain.ProductVariant.builder()
                .id(variantId)
                .product(productRepository.getReferenceById(productId))
                .tenantId(tenant.getId())
                .sku(sku)
                .name("Standard")
                .price(new BigDecimal("120"))
                .cost(new BigDecimal("80"))
                .stockQuantity(2)
                .build());

        StartImportRequest start = new StartImportRequest();
        start.setFileName("update-no-sku.xlsx");
        start.setFileSize(10L);
        start.setFileHash("hash-no-sku-" + UUID.randomUUID());
        start.setUploadedBy(employee.getId());
        start.setDuplicateStrategy("UPDATE");
        start.setTargetType("PRODUCTS");
        ImportSession session = importService.startSession(start);

        BulkImportItem row = new BulkImportItem();
        row.setSku("");
        row.setProductName("Crystal Cat Litter");
        row.setPrice(new BigDecimal("150"));
        row.setCost(new BigDecimal("90"));

        ChunkImportRequest chunk = new ChunkImportRequest();
        chunk.setEmployeeId(employee.getId());
        chunk.setDryRun(false);
        chunk.setItems(List.of(row));
        importService.processChunk(session.getId(), chunk);

        assertEquals(1, productRepository.findByNameIgnoreCaseAndTenantId("Crystal Cat Litter", tenant.getId()).size());
        var variants = variantRepository.findByProductId(productId);
        assertEquals(1, variants.size());
        assertEquals(0, new BigDecimal("150").compareTo(variants.get(0).getPrice()));
    }
}
