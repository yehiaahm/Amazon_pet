package com.animasys.modules.finance.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.finance.domain.AccountsPayableSettings;
import com.animasys.modules.finance.domain.PurchaseInvoiceInstallment;
import com.animasys.modules.finance.dto.InstallmentRequest;
import com.animasys.modules.finance.dto.PayInstallmentRequest;
import com.animasys.modules.finance.dto.SetInstallmentsRequest;
import com.animasys.modules.finance.repository.AccountsPayableSettingsRepository;
import com.animasys.modules.finance.repository.PurchaseInvoiceInstallmentRepository;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountsPayableServiceTest {

    @Mock private PurchaseInvoiceRepository invoiceRepository;
    @Mock private PurchaseInvoiceInstallmentRepository installmentRepository;
    @Mock private AccountsPayableSettingsRepository settingsRepository;
    @Mock private TenantRepository tenantRepository;

    @InjectMocks private AccountsPayableService accountsPayableService;

    private PurchaseInvoice invoice;
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-ap").name("AP").subdomain("ap").build();
        Employee uploader = Employee.builder().id("e-ap").tenant(tenant).username("buyer").build();
        invoice = PurchaseInvoice.builder()
                .id("inv-1")
                .grandTotal(BigDecimal.valueOf(100))
                .paymentStatus("UNPAID")
                .invoiceDate(LocalDate.now().toString())
                .dueDate(LocalDate.now().plusDays(30).toString())
                .uploadedBy(uploader)
                .installments(new ArrayList<>())
                .build();
    }

    private void stubInvoiceLookup() {
        when(invoiceRepository.findById("inv-1")).thenReturn(Optional.of(invoice));
    }

    @Test
    void setInstallments_rejectsSumMismatch() {
        SetInstallmentsRequest request = new SetInstallmentsRequest();
        request.setPaymentType("INSTALLMENTS");
        request.setInstallments(List.of(
                installmentReq(BigDecimal.valueOf(40)),
                installmentReq(BigDecimal.valueOf(40))
        ));

        when(invoiceRepository.findById("inv-1")).thenReturn(Optional.of(invoice));

        assertThrows(BusinessRuleException.class,
                () -> accountsPayableService.setInstallments("t-ap", "inv-1", request));
    }

    @Test
    void setInstallments_rejectsPaidInvoice() {
        invoice.setPaymentStatus("PAID");
        SetInstallmentsRequest request = new SetInstallmentsRequest();
        request.setPaymentType("LUMP_SUM");

        when(invoiceRepository.findById("inv-1")).thenReturn(Optional.of(invoice));

        assertThrows(BusinessRuleException.class,
                () -> accountsPayableService.setInstallments("t-ap", "inv-1", request));
    }

    @Test
    void payInstallment_partialPaymentMarksPartiallyPaid() {
        PurchaseInvoiceInstallment installment = PurchaseInvoiceInstallment.builder()
                .id("inst-1")
                .purchaseInvoice(invoice)
                .amount(BigDecimal.valueOf(100))
                .paidAmount(BigDecimal.ZERO)
                .status("PENDING")
                .dueDate(LocalDate.now().toString())
                .build();

        PayInstallmentRequest request = new PayInstallmentRequest();
        request.setAmount(BigDecimal.valueOf(40));

        when(installmentRepository.findById("inst-1")).thenReturn(Optional.of(installment));
        stubInvoiceLookup();
        when(settingsRepository.findById("t-ap")).thenReturn(Optional.empty());
        when(installmentRepository.findByPurchaseInvoiceIdOrderByInstallmentNumberAsc("inv-1"))
                .thenReturn(List.of(installment));
        when(installmentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        var response = accountsPayableService.payInstallment("t-ap", "inst-1", request);

        assertEquals("PARTIALLY_PAID", response.getStatus());
        assertEquals(0, BigDecimal.valueOf(40).compareTo(response.getPaidAmount()));
    }

    @Test
    void payInstallment_rejectsOverpay() {
        PurchaseInvoiceInstallment installment = PurchaseInvoiceInstallment.builder()
                .id("inst-1")
                .purchaseInvoice(invoice)
                .amount(BigDecimal.valueOf(100))
                .paidAmount(BigDecimal.valueOf(90))
                .status("PARTIALLY_PAID")
                .dueDate(LocalDate.now().toString())
                .build();

        PayInstallmentRequest request = new PayInstallmentRequest();
        request.setAmount(BigDecimal.valueOf(20));

        when(installmentRepository.findById("inst-1")).thenReturn(Optional.of(installment));
        when(invoiceRepository.findById("inv-1")).thenReturn(Optional.of(invoice));

        assertThrows(BusinessRuleException.class,
                () -> accountsPayableService.payInstallment("t-ap", "inst-1", request));
    }

    @Test
    void updateSettings_rejectsInvalidReminderDays() {
        assertThrows(BusinessRuleException.class,
                () -> accountsPayableService.updateSettings("t-ap", 0));
        assertThrows(BusinessRuleException.class,
                () -> accountsPayableService.updateSettings("t-ap", 91));
    }

    @Test
    void updateSettings_persistsValidReminderDays() {
        AccountsPayableSettings settings = AccountsPayableSettings.builder()
                .tenantId("t-ap")
                .reminderDaysBeforeDue(7)
                .build();

        when(settingsRepository.findById("t-ap")).thenReturn(Optional.of(settings));
        when(settingsRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AccountsPayableSettings updated = accountsPayableService.updateSettings("t-ap", 14);

        assertEquals(14, updated.getReminderDaysBeforeDue());
    }

    private static InstallmentRequest installmentReq(BigDecimal amount) {
        InstallmentRequest req = new InstallmentRequest();
        req.setAmount(amount);
        req.setDueDate(LocalDate.now().plusDays(7).toString());
        req.setInstallmentNumber(1);
        return req;
    }
}
