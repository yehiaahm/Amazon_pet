package com.animasys.modules.sales.service;

import com.animasys.modules.finance.repository.JournalRepository;
import com.animasys.modules.finance.service.GeneralLedgerService;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Covers the P0.4/P2 fix: journals must be posted exactly once per sale (idempotent, atomic
 * revenue+COGS), and delivery fee / loyalty redemption must be booked as their own real debit/
 * credit lines instead of silently plugged into REVENUE_PRODUCT_SALES (the old mechanism that fed
 * a growing revenue/journal reconciliation gap once those features started being used).
 */
@ExtendWith(MockitoExtension.class)
class JournalPostingExecutorTest {

    @Mock private GeneralLedgerService ledgerService;
    @Mock private SaleRepository saleRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private JournalRepository journalRepository;

    @InjectMocks private JournalPostingExecutor executor;

    private Tenant tenant;
    private Employee employee;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-1").name("T").subdomain("t1").build();
        employee = Employee.builder().id("e-1").tenant(tenant).build();
    }

    private Sale saleWithDeliveryAndLoyalty() {
        SaleItem item = SaleItem.builder()
                .id("si-1")
                .type("PRODUCT")
                .itemId("v-1")
                .name("Dog Food")
                .quantity(1)
                .price(new BigDecimal("100.00"))
                .cogs(new BigDecimal("40.00"))
                .build();

        // subtotal 100, no discount, no tax, +20 delivery, -15 loyalty redeemed => total 105
        return Sale.builder()
                .id("s-1")
                .saleNumber("INV-1001")
                .employee(employee)
                .paymentMethod("CASH")
                .totalAmount(new BigDecimal("105.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .deliveryFee(new BigDecimal("20.00"))
                .loyaltyRedeemed(new BigDecimal("15.00"))
                .items(List.of(item))
                .journalStatus("PENDING")
                .build();
    }

    @Test
    void postsBalancedJournalWithExplicitDeliveryAndLoyaltyLines_noRevenuePlug() {
        Sale sale = saleWithDeliveryAndLoyalty();
        when(saleRepository.findById("s-1")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("e-1")).thenReturn(Optional.of(employee));
        when(journalRepository.existsByTenant_IdAndDescription(anyString(), anyString())).thenReturn(false);
        when(saleRepository.save(any(Sale.class))).thenAnswer(inv -> inv.getArgument(0));

        executor.postJournalsForSale("s-1");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, BigDecimal>> debitsCaptor = ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, BigDecimal>> creditsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(ledgerService, times(2)).postJournalEntry(eq(tenant), anyString(), debitsCaptor.capture(), creditsCaptor.capture());

        // First call: the revenue/checkout journal.
        Map<String, BigDecimal> debits = debitsCaptor.getAllValues().get(0);
        Map<String, BigDecimal> credits = creditsCaptor.getAllValues().get(0);

        assertEquals(new BigDecimal("105.00"), debits.get("CASH_DRAWER"));
        assertEquals(new BigDecimal("15.00"), debits.get("LOYALTY_REDEMPTION_EXPENSE"));
        assertEquals(new BigDecimal("100.00"), credits.get("REVENUE_PRODUCT_SALES"),
                "Product revenue must be the real 100.00 sale price, never distorted by a delivery/loyalty plug");
        assertEquals(new BigDecimal("20.00"), credits.get("DELIVERY_REVENUE"));
        assertFalse(credits.containsKey("ROUNDING_ADJUSTMENT"), "A real, fully-accounted-for sale should need no rounding plug at all");
        assertFalse(debits.containsKey("ROUNDING_ADJUSTMENT"));

        BigDecimal debitSum = debits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal creditSum = credits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        assertEquals(0, debitSum.compareTo(creditSum), "Debits and credits must balance exactly on their own merits");

        // Second call: the COGS journal.
        Map<String, BigDecimal> cogsDebits = debitsCaptor.getAllValues().get(1);
        Map<String, BigDecimal> cogsCredits = creditsCaptor.getAllValues().get(1);
        assertEquals(new BigDecimal("40.00"), cogsDebits.get("COST_OF_GOODS_SOLD"));
        assertEquals(new BigDecimal("40.00"), cogsCredits.get("INVENTORY_ASSETS"));

        assertEquals("POSTED", sale.getJournalStatus());
        assertNull(sale.getJournalFailureReason());
    }

    @Test
    void alreadyPostedSale_isSkippedWithoutTouchingLedger() {
        Sale sale = saleWithDeliveryAndLoyalty();
        sale.setJournalStatus("POSTED");
        when(saleRepository.findById("s-1")).thenReturn(Optional.of(sale));

        executor.postJournalsForSale("s-1");

        verifyNoInteractions(ledgerService);
        verify(saleRepository, never()).save(any());
    }

    @Test
    void existingRevenueJournalFound_marksPostedWithoutDoublePosting() {
        Sale sale = saleWithDeliveryAndLoyalty();
        when(saleRepository.findById("s-1")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("e-1")).thenReturn(Optional.of(employee));
        when(journalRepository.existsByTenant_IdAndDescription("t-1", "Customer POS checkout invoice: INV-1001"))
                .thenReturn(true);
        when(saleRepository.save(any(Sale.class))).thenAnswer(inv -> inv.getArgument(0));

        executor.postJournalsForSale("s-1");

        verifyNoInteractions(ledgerService);
        assertEquals("POSTED", sale.getJournalStatus());
    }
}
