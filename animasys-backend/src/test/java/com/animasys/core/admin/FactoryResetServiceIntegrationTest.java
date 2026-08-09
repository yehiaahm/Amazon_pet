package com.animasys.core.admin;

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
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.SkuCatalogService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.sales.service.SaleService;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class FactoryResetServiceIntegrationTest extends IntegrationTestBase {

    @Autowired private FactoryResetService factoryResetService;
    @Autowired private SkuCatalogService skuCatalogService;
    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private SaleService saleService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private DataSource dataSource;

    private Employee employee;
    private Tenant tenant;
    private Branch branch;

    @BeforeEach
    void seedTenantWithCatalogAndSale() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-reset-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Reset Tenant")
                .subdomain("reset-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        bootstrapTenantRoles(tenant);

        branch = branchRepository.save(Branch.builder()
                .id("br-reset-" + UUID.randomUUID().toString().substring(0, 8))
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
                .id("e-reset-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("reset-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("hash")
                .fullName("Reset User")
                .email("reset-" + UUID.randomUUID() + "@test.com")
                .role("MANAGER")
                .active(true)
                .build());

        authenticate(employee);
        seedProductAndSale();
    }

    @Test
    void resetToFirstUseClearsCatalogAndSalesButKeepsEmployees() throws Exception {
        assumeMySqlDatabase();

        assertFalse(productRepository.findByTenantId(tenant.getId()).isEmpty());
        assertFalse(saleRepository.findByTenantId(tenant.getId()).isEmpty());
        int employeesBefore = employeeRepository.findByTenantId(tenant.getId()).size();
        assertTrue(employeesBefore >= 1);

        Map<String, Object> summary = factoryResetService.resetToFirstUse(tenant.getId());

        assertEquals(tenant.getId(), summary.get("tenantId"));
        assertTrue(productRepository.findByTenantId(tenant.getId()).isEmpty());
        assertTrue(saleRepository.findByTenantId(tenant.getId()).isEmpty());
        assertEquals(employeesBefore, employeeRepository.findByTenantId(tenant.getId()).size());
    }

    private void assumeMySqlDatabase() throws Exception {
        try (var connection = dataSource.getConnection()) {
            String productName = connection.getMetaData().getDatabaseProductName();
            Assumptions.assumeTrue(
                    productName != null && productName.toLowerCase().contains("mysql"),
                    "Factory reset integration requires MySQL multi-table DELETE syntax");
        }
    }

    private void seedProductAndSale() {
        String sku = "RESET-SKU-" + System.currentTimeMillis();

        Category category = categoryRepository.save(Category.builder()
                .id("cat-reset-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Reset")
                .build());

        Product template = Product.builder()
                .id("p-reset-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .sku(sku)
                .name("Reset Product")
                .category(category)
                .minStockLimit(10)
                .build();
        ProductVariant variant = skuCatalogService.upsertVariantForSku(
                tenant.getId(), template, null, new BigDecimal("25"), new BigDecimal("10"));
        fifoCostingService.createOpeningBatch(
                tenant.getId(), StockService.DEFAULT_SALES_WAREHOUSE, variant.getId(),
                new BigDecimal("10"), 5, null, "RESET-BATCH-" + UUID.randomUUID(), employee.getId());

        POSSession session = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());

        saleService.createSale(
                session.getId(),
                employee.getId(),
                null,
                new BigDecimal("25"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                List.of(SaleItem.builder()
                        .type("PRODUCT")
                        .itemId(variant.getId())
                        .name("Reset Product")
                        .quantity(1)
                        .price(new BigDecimal("25"))
                        .cost(new BigDecimal("10"))
                        .build())
        );
    }
}
