package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
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
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
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
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@ActiveProfiles("test")
public class POSSessionServiceIntegrationTest extends IntegrationTestBase {

    @Autowired
    private POSSessionService posSessionService;

    @Autowired
    private POSSessionRepository sessionRepository;

    @Autowired
    private SaleRepository saleRepository;

    @Autowired
    private SalePaymentRepository salePaymentRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private DailyClosingRepository dailyClosingRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private BranchRepository branchRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;
    private POSSession session;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id(UUID.randomUUID().toString()).name("POS Tenant").subdomain("pos-" + UUID.randomUUID().toString().substring(0, 8)).active(true).build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        branch = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("POS Branch").build();
        branchRepository.save(branch);

        String employeeSuffix = UUID.randomUUID().toString().substring(0, 8);
        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("cashier-" + employeeSuffix)
                .fullName("Cashier User")
                .email("cashier-" + employeeSuffix + "@test.com")
                .passwordHash("hash")
                .role("CASHIER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        authenticate(employee);
    }

    @Test
    @DisplayName("Expected balance should subtract CASH expenses accurately during the session")
    void testCloseSessionSubtractsExpenses() {
        // Start Session yesterday to test cross-day boundary
        Instant openedAt = Instant.now().minus(1, ChronoUnit.DAYS);
        
        session = POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openedAt(openedAt)
                .openingBalance(new BigDecimal("1000.00"))
                .status("OPEN")
                .build();
        sessionRepository.save(session);

        String saleSuffix = UUID.randomUUID().toString().substring(0, 8);

        // 1. Create a CASH sale (500)
        Sale sale1 = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-POS-1-" + saleSuffix)
                .posSession(session)
                .employee(employee)
                .totalAmount(new BigDecimal("500.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .status("COMPLETED")
                .date(Instant.now())
                .build();
        saleRepository.save(sale1);
        salePaymentRepository.save(SalePayment.builder()
                .id(UUID.randomUUID().toString())
                .sale(sale1)
                .method("CASH")
                .amount(new BigDecimal("500.00"))
                .build());

        // 2. Create a CARD sale (300) - Should not affect cash drawer
        Sale sale2 = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-POS-2-" + saleSuffix)
                .posSession(session)
                .employee(employee)
                .totalAmount(new BigDecimal("300.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CARD")
                .status("COMPLETED")
                .date(Instant.now())
                .build();
        saleRepository.save(sale2);
        salePaymentRepository.save(SalePayment.builder()
                .id(UUID.randomUUID().toString())
                .sale(sale2)
                .method("CARD")
                .amount(new BigDecimal("300.00"))
                .build());

        // 3. Create a CASH Expense yesterday (inside session window)
        Expense expense1 = Expense.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .category("SUPPLIES")
                .amount(new BigDecimal("150.00"))
                .date(LocalDate.ofInstant(openedAt, ZoneId.of("Africa/Cairo")))
                .paidFrom("CASH")
                .build();
        expenseRepository.save(expense1);

        // 4. Create a BANK Expense today (Should not affect cash drawer)
        Expense expense2 = Expense.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .category("RENT")
                .amount(new BigDecimal("200.00"))
                .date(LocalDate.now(ZoneId.of("Africa/Cairo")))
                .paidFrom("BANK")
                .build();
        expenseRepository.save(expense2);

        // Expected System Balance:
        // Opening: 1000
        // Cash Sales: +500
        // Cash Expenses: -150
        // Expected = 1350

        POSSession closedSession = posSessionService.closeSession(
                session.getId(),
                new BigDecimal("1350.00"), // User declares 1350
                new BigDecimal("1350.00"), 
                new BigDecimal("1350.00"), // Physical actual
                employee.getId()
        );

        assertEquals("CLOSED", closedSession.getStatus());

        List<DailyClosing> closings = dailyClosingRepository.findAll();
        DailyClosing report = closings.stream().filter(c -> c.getBranch().getId().equals(branch.getId())).findFirst().orElseThrow();

        assertEquals(0, new BigDecimal("1000.00").compareTo(report.getOpeningBalance()));
        assertEquals(0, new BigDecimal("500.00").compareTo(report.getCashSalesTotal()));
        assertEquals(0, new BigDecimal("300.00").compareTo(report.getCardSalesTotal()));
        assertEquals(0, new BigDecimal("150.00").compareTo(report.getCashExpensesTotal()));
        assertEquals(0, new BigDecimal("1350.00").compareTo(report.getSystemExpected()));
        assertEquals(0, new BigDecimal("0.00").compareTo(report.getDifference())); // Perfect balance
    }
}
