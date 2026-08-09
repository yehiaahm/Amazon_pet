package com.animasys.modules.sales.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.dto.SalePageResponse;
import com.animasys.modules.sales.dto.SaleSearchCriteria;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SaleQueryServiceIntegrationTest extends IntegrationTestBase {

    @Autowired
    private SaleQueryService saleQueryService;

    @Autowired
    private SaleRepository saleRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private BranchRepository branchRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private POSSessionRepository posSessionRepository;

    private Tenant tenant;
    private Employee owner;
    private POSSession posSession;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("Sale Page Tenant")
                .subdomain("sp-" + UUID.randomUUID().toString().substring(0, 8))
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
                .username("owner_sp_" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Owner SP")
                .email("owner_sp_" + UUID.randomUUID() + "@test.com")
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

        bootstrapTenantRoles(tenant);
        authenticate(owner);
    }

    @Test
    void paginatesWithoutLoadingSaleItems() {
        for (int i = 0; i < 75; i++) {
            SaleItem item = SaleItem.builder()
                    .id(UUID.randomUUID().toString())
                    .type("PRODUCT")
                    .itemId("v-1")
                    .name("Item " + i)
                    .quantity(1)
                    .price(BigDecimal.TEN)
                    .listPrice(BigDecimal.TEN)
                    .cost(BigDecimal.ONE)
                    .build();
            Sale sale = Sale.builder()
                    .id(UUID.randomUUID().toString())
                    .saleNumber("INV-SP-" + UUID.randomUUID())
                    .posSession(posSession)
                    .totalAmount(BigDecimal.valueOf(10 + i))
                    .tax(BigDecimal.ONE)
                    .discount(BigDecimal.ZERO)
                    .paymentMethod(i % 2 == 0 ? "CASH" : "CARD")
                    .employee(owner)
                    .date(Instant.now().minus(i, ChronoUnit.HOURS))
                    .status("COMPLETED")
                    .items(new ArrayList<>(List.of(item)))
                    .build();
            item.setSale(sale);
            saleRepository.save(sale);
        }

        long start = System.nanoTime();
        SalePageResponse page = saleQueryService.search(
                tenant.getId(),
                owner,
                SaleSearchCriteria.builder().page(0).size(50).sort("date,desc").build()
        );
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        assertThat(page.getTotalElements()).isEqualTo(75);
        assertThat(page.getContent()).hasSize(50);
        assertThat(page.getTotalPages()).isEqualTo(2);
        assertThat(page.getContent().get(0).getSaleNumber()).isNotBlank();
        assertThat(elapsedMs).isLessThan(500);

        Sale detail = saleRepository.findByIdAndTenantId(page.getContent().get(0).getId(), tenant.getId()).orElseThrow();
        assertThat(detail.getItems()).isNotEmpty();
    }

    @Test
    void filtersBySearchInSql() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        Sale match = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-UNIQUE-" + uniqueSuffix)
                .posSession(posSession)
                .totalAmount(BigDecimal.TEN)
                .tax(BigDecimal.ONE)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .employee(owner)
                .date(Instant.now())
                .status("COMPLETED")
                .items(new ArrayList<>())
                .build();
        Sale other = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-OTHER-" + UUID.randomUUID().toString().substring(0, 8))
                .posSession(posSession)
                .totalAmount(BigDecimal.TEN)
                .tax(BigDecimal.ONE)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .employee(owner)
                .date(Instant.now())
                .status("COMPLETED")
                .items(new ArrayList<>())
                .build();
        saleRepository.saveAll(List.of(match, other));

        SalePageResponse page = saleQueryService.search(
                tenant.getId(),
                owner,
                SaleSearchCriteria.builder().page(0).size(20).search(uniqueSuffix).build()
        );

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent().get(0).getSaleNumber()).isEqualTo("INV-UNIQUE-" + uniqueSuffix);
    }

    @Test
    void honorsRequestedPageSizeBeyondTheOldHundredRowCap() {
        // Reports/Dashboard/CRM/AIAdvisor/Finance all request size=5000 to analyze full
        // sales history. SaleSearchCriteria.MAX_SIZE previously capped every request at
        // 100 regardless of what was requested, silently truncating their analytics.
        int rowCount = 120;
        for (int i = 0; i < rowCount; i++) {
            Sale sale = Sale.builder()
                    .id(UUID.randomUUID().toString())
                    .saleNumber("INV-CAP-" + UUID.randomUUID())
                    .posSession(posSession)
                    .totalAmount(BigDecimal.TEN)
                    .tax(BigDecimal.ONE)
                    .discount(BigDecimal.ZERO)
                    .paymentMethod("CASH")
                    .employee(owner)
                    .date(Instant.now().minus(i, ChronoUnit.HOURS))
                    .status("COMPLETED")
                    .items(new ArrayList<>())
                    .build();
            saleRepository.save(sale);
        }

        SalePageResponse page = saleQueryService.search(
                tenant.getId(),
                owner,
                SaleSearchCriteria.builder().page(0).size(5000).sort("date,desc").build()
        );

        assertThat(page.getTotalElements()).isEqualTo(rowCount);
        assertThat(page.getContent()).hasSize(rowCount);
        assertThat(page.getSize()).isEqualTo(5000);
    }
}
