package com.animasys.modules.loyalty.service;

import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.loyalty.domain.LoyaltyAccount;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerEntry;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerType;
import com.animasys.modules.loyalty.domain.LoyaltySettings;
import com.animasys.modules.loyalty.repository.LoyaltyAccountRepository;
import com.animasys.modules.loyalty.repository.LoyaltyLedgerEntryRepository;
import com.animasys.modules.loyalty.repository.LoyaltySettingsRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LoyaltyServiceTest {

    private static final String TENANT_ID = "tenant-1";
    private static final String CUSTOMER_ID = "cust-1";

    @Mock private LoyaltyAccountRepository accountRepository;
    @Mock private LoyaltyLedgerEntryRepository ledgerRepository;
    @Mock private LoyaltySettingsRepository settingsRepository;
    @Mock private SaleRepository saleRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private ProductVariantRepository variantRepository;

    private LoyaltyService loyaltyService;
    private Customer customer;
    private Employee employee;

    @BeforeEach
    void setUp() {
        loyaltyService = new LoyaltyService(
                accountRepository, ledgerRepository, settingsRepository, saleRepository, employeeRepository, variantRepository);

        Tenant tenant = Tenant.builder().id(TENANT_ID).name("Amazon Pet").subdomain("amazonpet").build();
        customer = Customer.builder().id(CUSTOMER_ID).tenant(tenant).name("Test Customer").build();
        employee = Employee.builder().id("emp-1").tenant(tenant).fullName("Cashier").role("CASHIER").build();

        // save(...) echoes back what was passed, like a real repository would.
        lenient().when(accountRepository.save(any(LoyaltyAccount.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(ledgerRepository.save(any(LoyaltyLedgerEntry.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(ledgerRepository.findUnconsumedEarnedLotsFifo(anyString())).thenReturn(Collections.emptyList());
        lenient().when(saleRepository.save(any(Sale.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private LoyaltySettings settingsWithRate(String earnRate) {
        return LoyaltySettings.builder()
                .tenantId(TENANT_ID)
                .enabled(true)
                .programOpen(true)
                .earnRatePercent(new BigDecimal(earnRate))
                .build();
    }

    private LoyaltyAccount accountWithBalance(String balance) {
        return LoyaltyAccount.builder()
                .customerId(CUSTOMER_ID)
                .customer(customer)
                .tenantId(TENANT_ID)
                .balance(new BigDecimal(balance))
                .build();
    }

    // ─── resolveRedemption clamping ─────────────────────────────────────────

    @Test
    void resolveRedemption_clampsToBalanceWhenRequestExceedsIt() {
        when(settingsRepository.findById(TENANT_ID)).thenReturn(Optional.of(settingsWithRate("2.00")));
        when(accountRepository.findByCustomerIdForUpdate(CUSTOMER_ID)).thenReturn(Optional.of(accountWithBalance("70.00")));

        BigDecimal actual = loyaltyService.resolveRedemption(TENANT_ID, customer, new BigDecimal("1000.00"), new BigDecimal("200.00"));

        assertEquals(new BigDecimal("70.00"), actual);
    }

    @Test
    void resolveRedemption_clampsToMaxUsagePercentOfInvoice() {
        LoyaltySettings settings = settingsWithRate("2.00");
        settings.setMaxUsagePercent(new BigDecimal("20"));
        when(settingsRepository.findById(TENANT_ID)).thenReturn(Optional.of(settings));
        when(accountRepository.findByCustomerIdForUpdate(CUSTOMER_ID)).thenReturn(Optional.of(accountWithBalance("500.00")));

        // 20% of a 1000 invoice = 200, even though the customer has 500 and asked for 300.
        BigDecimal actual = loyaltyService.resolveRedemption(TENANT_ID, customer, new BigDecimal("1000.00"), new BigDecimal("300.00"));

        assertEquals(new BigDecimal("200.00"), actual);
    }

    @Test
    void resolveRedemption_returnsZeroWhenProgramDisabled() {
        LoyaltySettings settings = settingsWithRate("2.00");
        settings.setEnabled(false);
        when(settingsRepository.findById(TENANT_ID)).thenReturn(Optional.of(settings));

        BigDecimal actual = loyaltyService.resolveRedemption(TENANT_ID, customer, new BigDecimal("1000.00"), new BigDecimal("50.00"));

        assertEquals(BigDecimal.ZERO, actual);
        verifyNoInteractions(accountRepository);
    }

    // ─── earn() math: net-of-discount-and-redemption base × earn rate ──────

    @Test
    void earn_computesFromNetAmountAfterDiscountAndRedemption() {
        Sale sale = Sale.builder()
                .id("sale-1")
                .saleNumber("INV-1")
                .customer(customer)
                .employee(employee)
                .discount(new BigDecimal("0.00"))
                .loyaltyRedeemed(new BigDecimal("50.00"))
                .items(List.of(saleItem("SERVICE", "svc-1", "1000.00", 1)))
                .build();

        when(saleRepository.findById("sale-1")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("emp-1")).thenReturn(Optional.of(employee));
        when(settingsRepository.findById(TENANT_ID)).thenReturn(Optional.of(settingsWithRate("2.00")));
        when(accountRepository.findByCustomerIdForUpdate(CUSTOMER_ID)).thenReturn(Optional.of(accountWithBalance("0.00")));

        loyaltyService.earn("sale-1");

        // net = 1000 - 0 - 50 = 950; earned = 950 * 2% = 19.00
        assertEquals(new BigDecimal("19.00"), sale.getLoyaltyEarned());

        ArgumentCaptor<LoyaltyLedgerEntry> captor = ArgumentCaptor.forClass(LoyaltyLedgerEntry.class);
        verify(ledgerRepository).save(captor.capture());
        LoyaltyLedgerEntry entry = captor.getValue();
        assertEquals(LoyaltyLedgerType.EARNED, entry.getType());
        assertEquals(new BigDecimal("19.00"), entry.getAmount());
        assertEquals(new BigDecimal("0.00"), entry.getBalanceBefore());
        assertEquals(new BigDecimal("19.00"), entry.getBalanceAfter());
    }

    @Test
    void earn_skipsWhenProgramClosed() {
        Sale sale = Sale.builder()
                .id("sale-2")
                .saleNumber("INV-2")
                .customer(customer)
                .employee(employee)
                .discount(BigDecimal.ZERO)
                .loyaltyRedeemed(BigDecimal.ZERO)
                .items(List.of(saleItem("SERVICE", "svc-1", "1000.00", 1)))
                .build();

        LoyaltySettings closed = settingsWithRate("2.00");
        closed.setProgramOpen(false);

        when(saleRepository.findById("sale-2")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("emp-1")).thenReturn(Optional.of(employee));
        when(settingsRepository.findById(TENANT_ID)).thenReturn(Optional.of(closed));

        loyaltyService.earn("sale-2");

        assertEquals(BigDecimal.ZERO, sale.getLoyaltyEarned());
        verifyNoInteractions(ledgerRepository);
        verify(saleRepository, never()).save(any());
    }

    // ─── reverseForReturn: proportional, delta-based, no double reversal ───

    @Test
    void reverseForReturn_fullReturnClawsBackAllEarnedAndRefundsAllRedeemed() {
        Sale sale = Sale.builder()
                .id("sale-3")
                .saleNumber("INV-3")
                .customer(customer)
                .employee(employee)
                .loyaltyEarned(new BigDecimal("20.00"))
                .loyaltyRedeemed(new BigDecimal("50.00"))
                .loyaltyEarnedReversed(BigDecimal.ZERO)
                .loyaltyRedeemedReversed(BigDecimal.ZERO)
                .build();

        when(saleRepository.findById("sale-3")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("emp-1")).thenReturn(Optional.of(employee));
        when(employeeRepository.findById("emp-1")).thenReturn(Optional.of(employee));
        // Balance already reflects the +20 earn and -50 use from this invoice (net 100 -> 70).
        when(accountRepository.findByCustomerIdForUpdate(CUSTOMER_ID)).thenReturn(Optional.of(accountWithBalance("70.00")));

        loyaltyService.reverseForReturn("sale-3", BigDecimal.ONE, "emp-1");

        assertEquals(new BigDecimal("20.00"), sale.getLoyaltyEarnedReversed());
        assertEquals(new BigDecimal("50.00"), sale.getLoyaltyRedeemedReversed());

        ArgumentCaptor<LoyaltyLedgerEntry> captor = ArgumentCaptor.forClass(LoyaltyLedgerEntry.class);
        verify(ledgerRepository, times(2)).save(captor.capture());
        List<LoyaltyLedgerEntry> entries = captor.getAllValues();

        LoyaltyLedgerEntry earnedClawback = entries.stream()
                .filter(e -> e.getAmount().signum() < 0).findFirst().orElseThrow();
        assertEquals(new BigDecimal("-20.00"), earnedClawback.getAmount());

        LoyaltyLedgerEntry redeemedRefund = entries.stream()
                .filter(e -> e.getAmount().signum() > 0).findFirst().orElseThrow();
        assertEquals(new BigDecimal("50.00"), redeemedRefund.getAmount());

        // 70 - 20 (claw back earn) + 50 (refund used) = 100 -> back to the pre-invoice balance.
        assertEquals(new BigDecimal("100.00"), redeemedRefund.getBalanceAfter());
    }

    @Test
    void reverseForReturn_secondPartialReturnOnlyReversesTheIncrementalDelta() {
        Sale sale = Sale.builder()
                .id("sale-4")
                .saleNumber("INV-4")
                .customer(customer)
                .employee(employee)
                .loyaltyEarned(new BigDecimal("20.00"))
                .loyaltyRedeemed(BigDecimal.ZERO)
                .loyaltyEarnedReversed(new BigDecimal("6.00")) // a prior 30% partial return already reversed 6
                .loyaltyRedeemedReversed(BigDecimal.ZERO)
                .build();

        when(saleRepository.findById("sale-4")).thenReturn(Optional.of(sale));
        when(employeeRepository.findByIdWithTenant("emp-1")).thenReturn(Optional.of(employee));
        when(employeeRepository.findById("emp-1")).thenReturn(Optional.of(employee));
        when(accountRepository.findByCustomerIdForUpdate(CUSTOMER_ID)).thenReturn(Optional.of(accountWithBalance("114.00")));

        // Now returning up to 60% of the invoice total (cumulative) -> target reversed = 12.00,
        // so only the incremental 12.00 - 6.00 = 6.00 should be clawed back this time.
        loyaltyService.reverseForReturn("sale-4", new BigDecimal("0.60"), "emp-1");

        assertEquals(new BigDecimal("12.00"), sale.getLoyaltyEarnedReversed());

        ArgumentCaptor<LoyaltyLedgerEntry> captor = ArgumentCaptor.forClass(LoyaltyLedgerEntry.class);
        verify(ledgerRepository, times(1)).save(captor.capture());
        assertEquals(new BigDecimal("-6.00"), captor.getValue().getAmount());
    }

    @Test
    void reverseForReturn_noOpWhenRatioIsZero() {
        loyaltyService.reverseForReturn("sale-5", BigDecimal.ZERO, "emp-1");
        verifyNoInteractions(saleRepository, ledgerRepository, accountRepository);
    }

    private SaleItem saleItem(String type, String itemId, String price, int quantity) {
        return SaleItem.builder()
                .id("item-" + itemId)
                .type(type)
                .itemId(itemId)
                .name("Test Item")
                .quantity(quantity)
                .price(new BigDecimal(price))
                .listPrice(new BigDecimal(price))
                .cost(BigDecimal.ZERO)
                .build();
    }
}
