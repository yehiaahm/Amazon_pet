package com.animasys.modules.analytics.service;

import com.animasys.modules.analytics.kpi.KPIEngine;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.support.IntegrationTestBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DashboardAnalyticsIntegrationTest extends IntegrationTestBase {

    @Autowired private DashboardService dashboardService;
    @Autowired private KPIEngine kpiEngine;
    @Autowired private DashboardAnalyticsRepository analyticsRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private ExpenseRepository expenseRepository;

    private Tenant tenant;
    private Employee owner;
    private POSSession posSession;
    private Customer customer;
    private long heapBeforeMb;

    @BeforeEach
    void setUp() {
        Runtime.getRuntime().gc();
        heapBeforeMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);

        tenant = Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("Dash Analytics Tenant")
                .subdomain("da-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);

        Branch branch = Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Main")
                .address("Cairo")
                .build();
        branchRepository.save(branch);

        owner = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("owner_da_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Owner DA")
                .email("owner_da_" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build();
        employeeRepository.save(owner);

        posSession = POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(owner)
                .openedAt(Instant.now())
                .openingBalance(BigDecimal.valueOf(100))
                .status("OPEN")
                .build();
        posSessionRepository.save(posSession);

        customer = Customer.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Test Customer")
                .phone("0100000000")
                .build();
        customerRepository.save(customer);
        bootstrapTenantRoles(tenant);
        authenticate(owner);
    }

    @Test
    @Transactional
    void benchmarkLegacyVsSqlAggregation() {
        seedSales(500);
        seedExpenses(30);

        Runtime.getRuntime().gc();
        long heapLegacyBefore = Runtime.getRuntime().totalMemory();

        long legacyStart = System.nanoTime();
        var sales = saleRepository.findByTenantId(tenant.getId());
        var expenses = expenseRepository.findAll().stream()
                .filter(e -> e.getTenant() != null && tenant.getId().equals(e.getTenant().getId()))
                .toList();
        long legacyCount = sales.size();
        BigDecimal legacyRevenue = BigDecimal.ZERO;
        for (var sale : sales) {
            if (sale.getItems() != null) {
                for (var item : sale.getItems()) {
                    legacyRevenue = legacyRevenue.add(item.getPrice());
                }
            }
        }
        long legacyMs = (System.nanoTime() - legacyStart) / 1_000_000;
        Runtime.getRuntime().gc();
        long heapLegacyAfter = Runtime.getRuntime().totalMemory();

        long sqlStart = System.nanoTime();
        Map<String, Object> dashboard = dashboardService.buildDashboardMetrics(tenant.getId());
        long sqlMs = (System.nanoTime() - sqlStart) / 1_000_000;
        Runtime.getRuntime().gc();
        long heapSqlAfter = Runtime.getRuntime().totalMemory();

        assertThat(dashboard).isNotEmpty();
        assertThat(legacyCount).isGreaterThan(0);
        System.out.printf(
                "BENCHMARK legacyMs=%d legacyRows=%d legacyExpenseRows=%d legacyRevenue=%s heapLegacyDeltaMb=%d sqlMs=%d heapSqlMb=%d%n",
                legacyMs, legacyCount, expenses.size(), legacyRevenue,
                (heapLegacyAfter - heapLegacyBefore) / (1024 * 1024), sqlMs, heapSqlAfter / (1024 * 1024));
    }

    @Test
    void dashboardAggregatesInSqlUnderTwoSeconds() throws Exception {
        seedSales(300);
        seedExpenses(50);

        long t0 = System.nanoTime();
        Map<String, Object> dashboard = dashboardService.buildDashboardMetrics(tenant.getId());
        long dashboardMs = (System.nanoTime() - t0) / 1_000_000;

        long t1 = System.nanoTime();
        Map<String, Object> kpis = kpiEngine.calculateKPIMetrics(tenant.getId());
        long kpiMs = (System.nanoTime() - t1) / 1_000_000;

        Runtime.getRuntime().gc();
        long heapAfterMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);

        int payloadBytes = new ObjectMapper().writeValueAsBytes(dashboard).length;

        assertThat(dashboard).containsKeys("todaySales", "monthlyChart", "bestSellingProducts");
        assertThat(kpis).containsKey("إجمالي_الإيرادات");
        assertThat(dashboardMs).isLessThan(2000);
        assertThat(kpiMs).isLessThan(2000);

        System.out.printf("MEASURE dashboardMs=%d kpiMs=%d heapBeforeMb=%d heapAfterMb=%d payloadBytes=%d%n",
                dashboardMs, kpiMs, heapBeforeMb, heapAfterMb, payloadBytes);
    }

    @Test
    void periodAggregationMatchesSqlOnly() {
        seedSales(20);
        var row = analyticsRepository.aggregatePeriod(
                tenant.getId(), LocalDate.now().minusDays(30), LocalDate.now());
        assertThat(row.saleCount()).isGreaterThan(0);
        assertThat(row.revenue()).isGreaterThan(BigDecimal.ZERO);

        String plan = analyticsRepository.explainPeriodAggregation(
                tenant.getId(), LocalDate.now().minusDays(30), LocalDate.now());
        System.out.printf("EXPLAIN planChars=%d%n%s%n", plan.length(), plan);
    }

    private void seedSales(int count) {
        for (int i = 0; i < count; i++) {
            SaleItem item = SaleItem.builder()
                    .id(UUID.randomUUID().toString())
                    .type("PRODUCT")
                    .itemId("v-" + (i % 10))
                    .name("Product " + (i % 10))
                    .quantity(2)
                    .price(BigDecimal.valueOf(25))
                    .listPrice(BigDecimal.valueOf(25))
                    .cost(BigDecimal.valueOf(10))
                    .cogs(BigDecimal.valueOf(20))
                    .build();
            Sale sale = Sale.builder()
                    .id(UUID.randomUUID().toString())
                    .saleNumber("INV-DA-" + UUID.randomUUID())
                    .posSession(posSession)
                    .totalAmount(BigDecimal.valueOf(50))
                    .tax(BigDecimal.valueOf(5))
                    .discount(BigDecimal.ZERO)
                    .paymentMethod("CASH")
                    .employee(owner)
                    .customer(customer)
                    .date(Instant.now().minus(i % 45, ChronoUnit.DAYS))
                    .status("COMPLETED")
                    .items(new ArrayList<>(List.of(item)))
                    .build();
            item.setSale(sale);
            saleRepository.save(sale);
        }
    }

    private void seedExpenses(int count) {
        for (int i = 0; i < count; i++) {
            expenseRepository.save(Expense.builder()
                    .id(UUID.randomUUID().toString())
                    .tenant(tenant)
                    .branch(owner.getBranch())
                    .category("SUPPLIES")
                    .amount(BigDecimal.valueOf(10 + i))
                    .date(LocalDate.now().minusDays(i % 20))
                    .description("seed")
                    .paidFrom("CASH")
                    .build());
        }
    }
}
