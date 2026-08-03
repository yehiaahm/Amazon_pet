package com.animasys.modules.sales.listeners;

import com.animasys.modules.finance.service.GeneralLedgerService;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.dto.SaleRefundFinancials;
import com.animasys.modules.sales.events.SaleRefundedEvent;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * Reverses the financial journal entries posted on sale completion.
 * Stock restore + status update happen synchronously in SaleService.
 */
@Component
@RequiredArgsConstructor
public class SaleRefundedListener {

    private final GeneralLedgerService ledgerService;
    private final SaleRepository saleRepository;
    private final EmployeeRepository employeeRepository;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleSaleRefunded(SaleRefundedEvent event) {
        Sale sale = saleRepository.findById(event.getSale().getId()).orElse(null);
        if (sale == null || sale.getEmployee() == null) {
            return;
        }

        var employee = employeeRepository.findByIdWithTenant(sale.getEmployee().getId()).orElse(null);
        if (employee == null || employee.getTenant() == null) {
            System.err.println("Failed to resolve tenant for refund journals: " + sale.getSaleNumber());
            return;
        }

        SaleRefundFinancials fin = event.getFinancials();
        if (fin == null || fin.getRefundAmount() == null || fin.getRefundAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        try {
            Map<String, BigDecimal> debits = new HashMap<>();
            Map<String, BigDecimal> credits = new HashMap<>();

            String creditAccount = "CASH".equalsIgnoreCase(sale.getPaymentMethod()) ? "CASH_DRAWER" : "BANK_ACCOUNT";
            credits.put(creditAccount, fin.getRefundAmount());

            if (fin.getDiscountReversed() != null && fin.getDiscountReversed().compareTo(BigDecimal.ZERO) > 0) {
                credits.put("SALES_DISCOUNT", fin.getDiscountReversed());
            }

            if (fin.getProductRevenueReversed() != null && fin.getProductRevenueReversed().compareTo(BigDecimal.ZERO) > 0) {
                debits.put("REVENUE_PRODUCT_SALES", fin.getProductRevenueReversed());
            }
            if (fin.getServiceRevenueReversed() != null && fin.getServiceRevenueReversed().compareTo(BigDecimal.ZERO) > 0) {
                debits.put("REVENUE_SERVICE_SALES", fin.getServiceRevenueReversed());
            }
            if (fin.getTaxReversed() != null && fin.getTaxReversed().compareTo(BigDecimal.ZERO) > 0) {
                debits.put("SALES_TAX_PAYABLE", fin.getTaxReversed());
            }

            BigDecimal debitSum = debits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal creditSum = credits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal delta = creditSum.subtract(debitSum);
            if (delta.compareTo(BigDecimal.ZERO) != 0) {
                debits.merge("REVENUE_PRODUCT_SALES", delta, BigDecimal::add);
            }

            String label = fin.isFullRefund() ? "Refund / reverse POS invoice: " : "Partial refund POS invoice: ";
            ledgerService.postJournalEntry(
                    employee.getTenant(),
                    label + sale.getSaleNumber(),
                    debits,
                    credits
            );

            BigDecimal totalCost = fin.getCogsReversed() != null ? fin.getCogsReversed() : BigDecimal.ZERO;
            if (totalCost.compareTo(BigDecimal.ZERO) > 0) {
                Map<String, BigDecimal> cogsDebits = new HashMap<>();
                Map<String, BigDecimal> cogsCredits = new HashMap<>();
                cogsDebits.put("INVENTORY_ASSETS", totalCost);
                cogsCredits.put("COST_OF_GOODS_SOLD", totalCost);
                ledgerService.postJournalEntry(
                        employee.getTenant(),
                        "COGS reversal for refund: " + sale.getSaleNumber(),
                        cogsDebits,
                        cogsCredits
                );
            }
        } catch (Exception ex) {
            System.err.println("Failed to post refund journals for sale " + sale.getSaleNumber() + ": " + ex.getMessage());
        }
    }
}
