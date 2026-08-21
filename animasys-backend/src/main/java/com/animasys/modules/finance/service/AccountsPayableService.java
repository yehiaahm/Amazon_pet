package com.animasys.modules.finance.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.finance.domain.AccountsPayableSettings;
import com.animasys.modules.finance.domain.PurchaseInvoiceInstallment;
import com.animasys.modules.finance.dto.*;
import com.animasys.modules.finance.repository.AccountsPayableSettingsRepository;
import com.animasys.modules.finance.repository.PurchaseInvoiceInstallmentRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountsPayableService {

    private final PurchaseInvoiceRepository invoiceRepository;
    private final PurchaseInvoiceInstallmentRepository installmentRepository;
    private final AccountsPayableSettingsRepository settingsRepository;
    private final TenantRepository tenantRepository;

    public AccountsPayableDashboard getDashboard(String tenantId) {
        int reminderDays = getReminderDays(tenantId);
        List<PurchaseInvoiceInstallment> openInstallments = installmentRepository.findOpenByTenantOrderByDueDate(tenantId);
        List<InstallmentResponse> priorityQueue = openInstallments.stream()
                .map(inst -> toResponse(inst, reminderDays))
                .toList();

        List<InstallmentResponse> alerts = priorityQueue.stream()
                .filter(i -> i.isOverdue() || i.isDueSoon())
                .toList();

        List<SupplierPayableSummary> supplierSummaries = buildSupplierSummaries(tenantId, reminderDays);

        BigDecimal totalOutstanding = supplierSummaries.stream()
                .map(SupplierPayableSummary::getTotalDebt)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPaid = supplierSummaries.stream()
                .map(SupplierPayableSummary::getTotalPaid)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalRemaining = supplierSummaries.stream()
                .map(SupplierPayableSummary::getRemaining)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return AccountsPayableDashboard.builder()
                .totalOutstanding(totalOutstanding)
                .totalPaid(totalPaid)
                .totalRemaining(totalRemaining)
                .overdueCount((int) priorityQueue.stream().filter(InstallmentResponse::isOverdue).count())
                .dueSoonCount((int) priorityQueue.stream().filter(InstallmentResponse::isDueSoon).count())
                .openInstallmentCount(priorityQueue.size())
                .reminderDaysBeforeDue(reminderDays)
                .priorityQueue(priorityQueue)
                .alerts(alerts)
                .supplierSummaries(supplierSummaries)
                .build();
    }

    public List<InstallmentResponse> getInstallmentsForInvoice(String tenantId, String invoiceId) {
        PurchaseInvoice invoice = requireTenantInvoice(tenantId, invoiceId);
        int reminderDays = getReminderDays(tenantId);
        return installmentRepository.findByPurchaseInvoiceIdOrderByInstallmentNumberAsc(invoice.getId()).stream()
                .map(inst -> toResponse(inst, reminderDays))
                .toList();
    }

    public PurchaseInvoice setInstallments(String tenantId, String invoiceId, SetInstallmentsRequest request) {
        PurchaseInvoice invoice = requireTenantInvoice(tenantId, invoiceId);
        if (invoice.getPaymentStatus() != null && "PAID".equals(invoice.getPaymentStatus())) {
            throw new BusinessRuleException("لا يمكن تعديل جدول الدفعات لفاتورة مسددة بالكامل");
        }

        String paymentType = request.getPaymentType() != null ? request.getPaymentType() : "LUMP_SUM";
        invoice.setPaymentType(paymentType);

        installmentRepository.deleteByPurchaseInvoiceId(invoice.getId());
        invoice.getInstallments().clear();

        if ("INSTALLMENTS".equals(paymentType)) {
            if (request.getInstallments() == null || request.getInstallments().isEmpty()) {
                throw new BusinessRuleException("يجب تحديد دفعة واحدة على الأقل عند اختيار السداد على دفعات");
            }
            BigDecimal total = request.getInstallments().stream()
                    .map(InstallmentRequest::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (total.compareTo(invoice.getGrandTotal()) != 0) {
                throw new BusinessRuleException("مجموع الدفعات (" + total + ") يجب أن يساوي إجمالي الفاتورة (" + invoice.getGrandTotal() + ")");
            }

            int num = 1;
            for (InstallmentRequest req : request.getInstallments()) {
                PurchaseInvoiceInstallment inst = PurchaseInvoiceInstallment.builder()
                        .id("inst-" + UUID.randomUUID().toString().substring(0, 8))
                        .purchaseInvoice(invoice)
                        .installmentNumber(req.getInstallmentNumber() > 0 ? req.getInstallmentNumber() : num)
                        .dueDate(req.getDueDate())
                        .amount(req.getAmount())
                        .paidAmount(BigDecimal.ZERO)
                        .status("PENDING")
                        .notes(req.getNotes())
                        .build();
                invoice.getInstallments().add(inst);
                num++;
            }
            if (!invoice.getInstallments().isEmpty()) {
                invoice.setDueDate(invoice.getInstallments().stream()
                        .map(PurchaseInvoiceInstallment::getDueDate)
                        .min(String::compareTo)
                        .orElse(invoice.getDueDate()));
            }
        } else {
            BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
            BigDecimal remaining = invoice.getGrandTotal().subtract(paid);
            PurchaseInvoiceInstallment lump = PurchaseInvoiceInstallment.builder()
                    .id("inst-" + UUID.randomUUID().toString().substring(0, 8))
                    .purchaseInvoice(invoice)
                    .installmentNumber(1)
                    .dueDate(invoice.getDueDate())
                    .amount(invoice.getGrandTotal())
                    .paidAmount(paid)
                    .status(resolveInstallmentStatus(paid, invoice.getGrandTotal()))
                    .notes("دفعة واحدة")
                    .build();
            if ("PAID".equals(lump.getStatus())) {
                lump.setPaidAt(Instant.now());
            }
            invoice.getInstallments().add(lump);
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                invoice.setPaymentStatus("PAID");
            }
        }

        return invoiceRepository.save(invoice);
    }

    public InstallmentResponse payInstallment(String tenantId, String installmentId, PayInstallmentRequest request) {
        PurchaseInvoiceInstallment installment = installmentRepository.findById(installmentId)
                .orElseThrow(() -> new ResourceNotFoundException("الدفعة غير موجودة"));

        PurchaseInvoice invoice = installment.getPurchaseInvoice();
        requireTenantInvoice(tenantId, invoice.getId());

        if ("PAID".equals(installment.getStatus())) {
            throw new BusinessRuleException("هذه الدفعة مسددة بالكامل");
        }

        BigDecimal amount = request.getAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessRuleException("مبلغ الدفعة يجب أن يكون أكبر من صفر");
        }

        BigDecimal currentPaid = installment.getPaidAmount() != null ? installment.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal remaining = installment.getAmount().subtract(currentPaid);
        if (amount.compareTo(remaining) > 0) {
            throw new BusinessRuleException("المبلغ المدخل (" + amount + ") أكبر من المتبقي على هذه الدفعة (" + remaining + ")");
        }

        BigDecimal newPaid = currentPaid.add(amount);
        installment.setPaidAmount(newPaid);
        installment.setStatus(resolveInstallmentStatus(newPaid, installment.getAmount()));
        if ("PAID".equals(installment.getStatus())) {
            installment.setPaidAt(Instant.now());
        }
        if (request.getNotes() != null && !request.getNotes().isBlank()) {
            installment.setNotes(request.getNotes());
        }
        installmentRepository.save(installment);

        syncInvoicePaymentStatus(invoice);
        invoiceRepository.save(invoice);

        return toResponse(installment, getReminderDays(tenantId));
    }

    public AccountsPayableSettings getSettings(String tenantId) {
        return settingsRepository.findById(tenantId)
                .orElseGet(() -> createDefaultSettings(tenantId));
    }

    public AccountsPayableSettings updateSettings(String tenantId, int reminderDaysBeforeDue) {
        if (reminderDaysBeforeDue < 1 || reminderDaysBeforeDue > 90) {
            throw new BusinessRuleException("عدد أيام التنبيه يجب أن يكون بين 1 و 90");
        }
        AccountsPayableSettings settings = settingsRepository.findById(tenantId)
                .orElseGet(() -> createDefaultSettings(tenantId));
        settings.setReminderDaysBeforeDue(reminderDaysBeforeDue);
        return settingsRepository.save(settings);
    }

    public PurchaseInvoiceInstallment createDefaultInstallment(PurchaseInvoice invoice) {
        BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
        PurchaseInvoiceInstallment inst = PurchaseInvoiceInstallment.builder()
                .id("inst-" + UUID.randomUUID().toString().substring(0, 8))
                .purchaseInvoice(invoice)
                .installmentNumber(1)
                // No forced deadline unless the invoice itself carries one — open
                // credit is payable any time and must never auto-flag as overdue.
                .dueDate(invoice.getDueDate())
                .amount(invoice.getGrandTotal())
                .paidAmount(paid)
                .status(resolveInstallmentStatus(paid, invoice.getGrandTotal()))
                .build();
        if ("PAID".equals(inst.getStatus())) {
            inst.setPaidAt(Instant.now());
        }
        return inst;
    }

    /**
     * Applies a purchase-return credit against an invoice: reduces the invoice total and
     * unwinds it from the latest/future installments first, never below what's already paid.
     * @return any leftover credit the invoice balance couldn't absorb — money the supplier owes back.
     */
    public BigDecimal applyReturnCredit(PurchaseInvoice invoice, BigDecimal returnedValue) {
        if (returnedValue == null || returnedValue.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }

        BigDecimal grandTotal = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
        BigDecimal netTotal = invoice.getNetTotal() != null ? invoice.getNetTotal() : grandTotal;
        invoice.setGrandTotal(grandTotal.subtract(returnedValue).max(BigDecimal.ZERO));
        invoice.setNetTotal(netTotal.subtract(returnedValue).max(BigDecimal.ZERO));

        List<PurchaseInvoiceInstallment> installments = installmentRepository
                .findByPurchaseInvoiceIdOrderByInstallmentNumberAsc(invoice.getId());

        BigDecimal remainingCredit = returnedValue;
        for (int i = installments.size() - 1; i >= 0 && remainingCredit.compareTo(BigDecimal.ZERO) > 0; i--) {
            PurchaseInvoiceInstallment inst = installments.get(i);
            BigDecimal paid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
            BigDecimal reducible = inst.getAmount().subtract(paid).max(BigDecimal.ZERO);
            BigDecimal reduceBy = reducible.min(remainingCredit);
            if (reduceBy.compareTo(BigDecimal.ZERO) > 0) {
                inst.setAmount(inst.getAmount().subtract(reduceBy));
                inst.setStatus(resolveInstallmentStatus(paid, inst.getAmount()));
                installmentRepository.save(inst);
                remainingCredit = remainingCredit.subtract(reduceBy);
            }
        }

        syncInvoicePaymentStatus(invoice);
        invoiceRepository.save(invoice);

        return remainingCredit;
    }

    private void syncInvoicePaymentStatus(PurchaseInvoice invoice) {
        List<PurchaseInvoiceInstallment> installments = installmentRepository
                .findByPurchaseInvoiceIdOrderByInstallmentNumberAsc(invoice.getId());

        BigDecimal totalPaid = installments.stream()
                .map(i -> i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        invoice.setPaidAmount(totalPaid);

        if (totalPaid.compareTo(invoice.getGrandTotal()) >= 0) {
            invoice.setPaymentStatus("PAID");
        } else if (totalPaid.compareTo(BigDecimal.ZERO) > 0) {
            invoice.setPaymentStatus("PARTIALLY_PAID");
        } else {
            invoice.setPaymentStatus("UNPAID");
        }

        installments.stream()
                .filter(i -> !"PAID".equals(i.getStatus()))
                .map(PurchaseInvoiceInstallment::getDueDate)
                .filter(Objects::nonNull)
                .min(String::compareTo)
                .ifPresent(invoice::setDueDate);
    }

    private List<SupplierPayableSummary> buildSupplierSummaries(String tenantId, int reminderDays) {
        List<PurchaseInvoice> invoices = invoiceRepository.findByUploadedByTenantId(tenantId).stream()
                .filter(inv -> !"PAID".equals(inv.getPaymentStatus()))
                .toList();

        Map<String, List<PurchaseInvoice>> bySupplier = invoices.stream()
                .collect(Collectors.groupingBy(inv ->
                        inv.getSupplier() != null ? inv.getSupplier().getId() : "unknown-" + inv.getSupplierName()));

        List<SupplierPayableSummary> summaries = new ArrayList<>();
        for (Map.Entry<String, List<PurchaseInvoice>> entry : bySupplier.entrySet()) {
            List<PurchaseInvoice> supplierInvoices = entry.getValue();
            PurchaseInvoice first = supplierInvoices.get(0);

            BigDecimal totalDebt = supplierInvoices.stream()
                    .map(PurchaseInvoice::getGrandTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalPaid = supplierInvoices.stream()
                    .map(inv -> inv.getPaidAmount() != null ? inv.getPaidAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal remaining = totalDebt.subtract(totalPaid);

            List<InstallmentResponse> openInstallments = new ArrayList<>();
            int overdueCount = 0;
            int dueSoonCount = 0;

            for (PurchaseInvoice inv : supplierInvoices) {
                List<PurchaseInvoiceInstallment> insts = installmentRepository
                        .findByPurchaseInvoiceIdOrderByInstallmentNumberAsc(inv.getId());
                for (PurchaseInvoiceInstallment inst : insts) {
                    if ("PAID".equals(inst.getStatus())) continue;
                    InstallmentResponse resp = toResponse(inst, reminderDays);
                    openInstallments.add(resp);
                    if (resp.isOverdue()) overdueCount++;
                    if (resp.isDueSoon()) dueSoonCount++;
                }
            }

            openInstallments.sort(Comparator.comparing(InstallmentResponse::getDueDate));

            summaries.add(SupplierPayableSummary.builder()
                    .supplierId(first.getSupplier() != null ? first.getSupplier().getId() : null)
                    .supplierName(first.getSupplierName())
                    .totalDebt(totalDebt)
                    .totalPaid(totalPaid)
                    .remaining(remaining)
                    .overdueCount(overdueCount)
                    .dueSoonCount(dueSoonCount)
                    .openInvoiceCount(supplierInvoices.size())
                    .upcomingInstallments(openInstallments.stream().limit(5).toList())
                    .build());
        }

        summaries.sort(Comparator.comparing(SupplierPayableSummary::getRemaining).reversed());
        return summaries;
    }

    private InstallmentResponse toResponse(PurchaseInvoiceInstallment inst, int reminderDays) {
        PurchaseInvoice invoice = inst.getPurchaseInvoice();
        BigDecimal paid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal remaining = inst.getAmount().subtract(paid);
        boolean hasDueDate = inst.getDueDate() != null && !inst.getDueDate().isBlank();
        // Open-ended installments (no due date) are never overdue or "due soon" —
        // they're payable any time, by design, so they must not get an urgency badge.
        int daysUntilDue = hasDueDate ? computeDaysUntilDue(inst.getDueDate()) : 0;
        boolean overdue = hasDueDate && daysUntilDue < 0 && !"PAID".equals(inst.getStatus());
        boolean dueSoon = hasDueDate && !overdue && daysUntilDue <= reminderDays && daysUntilDue >= 0 && !"PAID".equals(inst.getStatus());

        return InstallmentResponse.builder()
                .id(inst.getId())
                .purchaseInvoiceId(invoice.getId())
                .invoiceNumber(invoice.getInvoiceNumber())
                .supplierId(invoice.getSupplier() != null ? invoice.getSupplier().getId() : null)
                .supplierName(invoice.getSupplierName())
                .installmentNumber(inst.getInstallmentNumber())
                .dueDate(inst.getDueDate())
                .amount(inst.getAmount())
                .paidAmount(paid)
                .remainingAmount(remaining)
                .status(inst.getStatus())
                .paidAt(inst.getPaidAt() != null ? inst.getPaidAt().toString() : null)
                .notes(inst.getNotes())
                .daysUntilDue(daysUntilDue)
                .overdue(overdue)
                .dueSoon(dueSoon)
                .build();
    }

    private int computeDaysUntilDue(String dueDateStr) {
        if (dueDateStr == null || dueDateStr.isBlank()) return 0;
        try {
            LocalDate due = LocalDate.parse(dueDateStr.substring(0, Math.min(10, dueDateStr.length())));
            return (int) ChronoUnit.DAYS.between(LocalDate.now(), due);
        } catch (Exception e) {
            return 0;
        }
    }

    private String resolveInstallmentStatus(BigDecimal paid, BigDecimal total) {
        if (paid.compareTo(total) >= 0) return "PAID";
        if (paid.compareTo(BigDecimal.ZERO) > 0) return "PARTIALLY_PAID";
        return "PENDING";
    }

    private PurchaseInvoice requireTenantInvoice(String tenantId, String invoiceId) {
        PurchaseInvoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("فاتورة الشراء غير موجودة"));
        if (invoice.getUploadedBy() == null || invoice.getUploadedBy().getTenant() == null
                || !tenantId.equals(invoice.getUploadedBy().getTenant().getId())) {
            throw new ResourceNotFoundException("فاتورة الشراء غير موجودة");
        }
        if (invoice.getInstallments() == null) {
            invoice.setInstallments(new ArrayList<>());
        }
        return invoice;
    }

    private int getReminderDays(String tenantId) {
        return settingsRepository.findById(tenantId)
                .map(AccountsPayableSettings::getReminderDaysBeforeDue)
                .orElse(7);
    }

    private AccountsPayableSettings createDefaultSettings(String tenantId) {
        AccountsPayableSettings settings = AccountsPayableSettings.builder()
                .tenantId(tenantId)
                .reminderDaysBeforeDue(7)
                .build();
        tenantRepository.findById(tenantId).ifPresent(settings::setTenant);
        return settingsRepository.save(settings);
    }
}
