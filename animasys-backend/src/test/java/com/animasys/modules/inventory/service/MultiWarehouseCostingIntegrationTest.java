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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import com.animasys.support.IntegrationTestBase;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
public class MultiWarehouseCostingIntegrationTest extends IntegrationTestBase {

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

    private ProductVariant variant;
    private String tenantId;
    private String warehouse1Id;
    private String warehouse2Id;
    private String employeeId;
    private POSSession posSession;
    private Employee employee;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder()
                .id(tenantId)
                .name("Multi-WH Tenant")
                .subdomain("mwh-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        Branch branch1 = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("B1").build();
        branchRepository.save(branch1);

        Warehouse w1 = Warehouse.builder().id(UUID.randomUUID().toString()).branch(branch1).name("WH1").code("W1").build();
        warehouseRepository.save(w1);
        warehouse1Id = w1.getId();

        Warehouse w2 = Warehouse.builder().id(UUID.randomUUID().toString()).branch(branch1).name("WH2").code("W2").build();
        warehouseRepository.save(w2);
        warehouse2Id = w2.getId();

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch1)
                .username("emp-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Emp")
                .email("emp-" + UUID.randomUUID().toString().substring(0, 8) + "@mwh.test")
                .role("MANAGER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        employeeId = employee.getId();
        authenticate(employee);

        posSession = POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch1)
                .openedBy(employee)
                .openedAt(Instant.now())
                .openingBalance(BigDecimal.ZERO)
                .status("OPEN")
                .build();
        posSessionRepository.save(posSession);

        Category category = Category.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("Cat").build();
        categoryRepository.save(category);

        String sku = "SKU-MWH-" + UUID.randomUUID().toString().substring(0, 8);
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
    @DisplayName("Stock in WH1 should not be accessible from WH2")
    void testWarehouseIsolation() {
        // Add 10 units to Warehouse 1
        fifoCostingService.createPurchaseBatch(
                tenantId, warehouse1Id, variant.getId(), null, null,
                "LOT-WH1", new BigDecimal("50"), 10, LocalDate.now().plusMonths(1), Instant.now(), employeeId
        );

        Sale sale = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-" + UUID.randomUUID().toString().substring(0, 8))
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
                .quantity(5)
                .price(new BigDecimal("100"))
                .listPrice(new BigDecimal("100"))
                .cost(new BigDecimal("50"))
                .build();
        saleItemRepository.save(item);

        // Selling from WH2 should fail (Insufficient Stock)
        assertThrows(InsufficientStockException.class, () -> {
            fifoCostingService.allocateSaleItemFifo(tenantId, warehouse2Id, item, employeeId);
        });

        // Selling from WH1 should succeed
        assertDoesNotThrow(() -> {
            fifoCostingService.allocateSaleItemFifo(tenantId, warehouse1Id, item, employeeId);
        });
    }
}
