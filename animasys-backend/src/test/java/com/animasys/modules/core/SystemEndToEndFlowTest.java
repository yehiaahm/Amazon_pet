package com.animasys.modules.core;

import com.animasys.modules.finance.domain.DailyClosing;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.DailyClosingRepository;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.sales.service.POSSessionService;
import com.animasys.support.IntegrationTestBase;
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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@ActiveProfiles("test")
public class SystemEndToEndFlowTest extends IntegrationTestBase {

    @Autowired private POSSessionService posSessionService;
    @Autowired private FifoCostingService fifoCostingService;
    
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository productVariantRepository;
    @Autowired private POSSessionRepository sessionRepository;
    @Autowired private ExpenseRepository expenseRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private SaleItemRepository saleItemRepository;
    @Autowired private DailyClosingRepository dailyClosingRepository;
    @Autowired private InventoryBatchRepository batchRepository;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;
    private Warehouse warehouse;
    private ProductVariant variant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id(UUID.randomUUID().toString()).name("E2E Tenant").active(true).build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        branch = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("E2E Branch").build();
        branchRepository.save(branch);

        warehouse = Warehouse.builder().id(UUID.randomUUID().toString()).branch(branch).name("E2E Store").code("E2E").build();
        warehouseRepository.save(warehouse);

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("e2e-user")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        authenticate(employee);

        Category category = Category.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("Cat").build();
        categoryRepository.save(category);

        Product product = Product.builder().id(UUID.randomUUID().toString()).tenant(tenant).sku("SKU-E2E").name("Prod").category(category).build();
        productRepository.save(product);

        variant = ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .sku("SKU-E2E")
                .price(new BigDecimal("150.00"))
                .cost(new BigDecimal("50.00"))
                .stockQuantity(0)
                .build();
        productVariantRepository.save(variant);
    }

    @Test
    @DisplayName("Simulate a full day: Open Session, Purchase, Expense, Sale, Refund, Close Session")
    void testFullDayEndToEndFlow() {
        String tenantId = tenant.getId();
        String empId = employee.getId();
        String whId = warehouse.getId();

        // 1. Open POS Session with 100 EGP
        POSSession session = posSessionService.startSession(branch.getId(), empId, new BigDecimal("100.00"));
        assertEquals("OPEN", session.getStatus());

        // 2. Purchase Inventory (Receive 10 units)
        InventoryBatch batch = fifoCostingService.createPurchaseBatch(
                tenantId, whId, variant.getId(), null, null,
                "LOT-01", new BigDecimal("50.00"), 10, LocalDate.now().plusMonths(1), Instant.now(), empId
        );

        // 3. Make a Cash Expense (e.g. paying for cleaning) - 20 EGP
        Expense expense = Expense.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .category("CLEANING")
                .amount(new BigDecimal("20.00"))
                .date(LocalDate.now())
                .paidFrom("CASH")
                .build();
        expenseRepository.save(expense);

        // 4. Create Sale (Buy 3 units for 450 EGP)
        Sale sale = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-001")
                .posSession(session)
                .employee(employee)
                .totalAmount(new BigDecimal("450.00")) // 3 * 150
                .paymentMethod("CASH")
                .status("COMPLETED")
                .date(Instant.now())
                .build();
        saleRepository.save(sale);

        SaleItem item = SaleItem.builder()
                .id(UUID.randomUUID().toString())
                .sale(sale)
                .itemId(variant.getId())
                .quantity(3)
                .price(new BigDecimal("150.00"))
                .build();
        saleItemRepository.save(item);
        
        fifoCostingService.allocateSaleItemFifo(tenantId, whId, item, empId);

        // Verify remaining stock is 7
        InventoryBatch updatedBatch = batchRepository.findById(batch.getId()).orElseThrow();
        assertEquals(7, updatedBatch.getRemainingQuantity());

        // 5. Customer Refunds 1 unit
        fifoCostingService.processCustomerReturn(tenantId, whId, item.getId(), 1, empId);
        
        // Mark sale as PARTIALLY_REFUNDED (handled by Sales Controller in real world, we mock it here)
        sale.setStatus("PARTIALLY_REFUNDED");
        item.setQuantityReturned(1);
        saleRepository.save(sale);
        saleItemRepository.save(item);

        // Verify remaining stock is 8
        updatedBatch = batchRepository.findById(batch.getId()).orElseThrow();
        assertEquals(8, updatedBatch.getRemainingQuantity());

        // 6. Close Session
        // Net Cash Sale Amount = 2 units * 150 = 300
        // Expected Balance = 100 (Open) + 300 (Net Cash) - 20 (Cash Expense) = 380 EGP
        
        POSSession closedSession = posSessionService.closeSession(
                session.getId(),
                new BigDecimal("380.00"),
                new BigDecimal("380.00"),
                new BigDecimal("380.00"),
                empId
        );
        assertEquals("CLOSED", closedSession.getStatus());

        List<DailyClosing> closings = dailyClosingRepository.findAll();
        DailyClosing report = closings.get(closings.size() - 1);
        
        assertEquals(0, new BigDecimal("100.00").compareTo(report.getOpeningBalance()));
        assertEquals(0, new BigDecimal("300.00").compareTo(report.getCashSalesTotal()));
        assertEquals(0, new BigDecimal("20.00").compareTo(report.getCashExpensesTotal()));
        assertEquals(0, new BigDecimal("380.00").compareTo(report.getSystemExpected()));
    }
}
