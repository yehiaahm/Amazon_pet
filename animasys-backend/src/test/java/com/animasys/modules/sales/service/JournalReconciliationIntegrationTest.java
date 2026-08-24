package com.animasys.modules.sales.service;

import com.animasys.modules.finance.repository.JournalRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Simulates the exact P0.4 failure mode with a real DB: a COMPLETED sale that never got its
 * journal posted (journal_status left at PENDING, as if the app crashed between the sale
 * committing and SaleCompletedListener's AFTER_COMMIT handler running -- the one gap
 * JournalPostingExecutor's own idempotency guards can't self-trigger on their own). Proves the
 * reconciliation sweep finds and fixes it, and that re-running it is a safe no-op.
 */
class JournalReconciliationIntegrationTest extends IntegrationTestBase {

    @Autowired private JournalReconciliationService reconciliationService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private SaleRepository saleRepository;
    @Autowired private SaleItemRepository saleItemRepository;
    @Autowired private JournalRepository journalRepository;

    private Tenant tenant;
    private Employee manager;
    private POSSession posSession;

    @BeforeEach
    void setUpData() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-jrecon-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Journal Reconciliation Test Tenant")
                .subdomain("jrecon-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-jrecon-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main Branch")
                .build());

        manager = employeeRepository.save(Employee.builder()
                .id("e-jrecon-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("mgr-jrecon-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Manager User")
                .email("mgr-jrecon-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build());

        posSession = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(manager)
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .openedAt(Instant.now())
                .build());
    }

    private Sale createOrphanedCompletedSale() {
        Sale sale = saleRepository.save(Sale.builder()
                .id("s-jrecon-" + UUID.randomUUID().toString().substring(0, 8))
                .saleNumber("INV-JRECON-" + UUID.randomUUID().toString().substring(0, 8))
                .posSession(posSession)
                .totalAmount(new BigDecimal("50.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .employee(manager)
                .status("COMPLETED")
                .journalStatus("PENDING")
                .build());

        saleItemRepository.save(SaleItem.builder()
                .id("si-jrecon-" + UUID.randomUUID().toString().substring(0, 8))
                .sale(sale)
                .type("PRODUCT")
                .itemId("v-jrecon")
                .name("Test Item")
                .quantity(1)
                .price(new BigDecimal("50.00"))
                .listPrice(new BigDecimal("50.00"))
                .cost(new BigDecimal("20.00"))
                .cogs(new BigDecimal("20.00"))
                .build());

        return sale;
    }

    @Test
    @DisplayName("Reconciliation posts journals for a completed sale left PENDING, and is a safe no-op on retry")
    void reconciliationPostsMissingJournalAndIsIdempotent() {
        Sale sale = createOrphanedCompletedSale();
        String checkoutDescription = "Customer POS checkout invoice: " + sale.getSaleNumber();

        assertTrue(journalRepository.findByTenantId(tenant.getId()).stream()
                .noneMatch(j -> j.getDescription().equals(checkoutDescription)));

        int fixedFirstPass = reconciliationService.reconcileMissingJournals();
        assertTrue(fixedFirstPass >= 1, "At least this orphaned sale must be fixed");

        Sale reloaded = saleRepository.findById(sale.getId()).orElseThrow();
        assertEquals("POSTED", reloaded.getJournalStatus());

        long matchingJournals = journalRepository.findByTenantId(tenant.getId()).stream()
                .filter(j -> j.getDescription().equals(checkoutDescription))
                .count();
        assertEquals(1, matchingJournals, "Exactly one revenue journal must now exist for this sale");

        // Re-running must not duplicate the journal (idempotent retry).
        int fixedSecondPass = reconciliationService.reconcileMissingJournals();
        long matchingJournalsAfterRetry = journalRepository.findByTenantId(tenant.getId()).stream()
                .filter(j -> j.getDescription().equals(checkoutDescription))
                .count();
        assertEquals(1, matchingJournalsAfterRetry, "Re-running reconciliation must never double-post an already-posted sale");
    }
}
