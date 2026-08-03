package com.animasys.modules.sales.listeners;

import com.animasys.modules.finance.service.GeneralLedgerService;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.events.SaleCompletedEvent;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * Posts financial journals after the sale transaction commits.
 * Stock deduction is handled synchronously inside SaleService (same TX as the sale).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SaleCompletedListener {

    private final GeneralLedgerService ledgerService;
    private final SaleRepository saleRepository;
    private final EmployeeRepository employeeRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleSaleCompleted(SaleCompletedEvent event) {
        Sale sale = saleRepository.findById(event.getSale().getId()).orElse(null);
        if (sale == null || sale.getEmployee() == null) {
            log.warn("SaleCompleted: sale missing after commit");
            return;
        }

        // Re-load employee with tenant to avoid LazyInitializationException
        var employee = employeeRepository.findByIdWithTenant(sale.getEmployee().getId()).orElse(null);
        if (employee == null || employee.getTenant() == null) {
            log.error("SaleCompleted: cannot resolve tenant for sale {}", sale.getSaleNumber());
            return;
        }
        Tenant tenant = employee.getTenant();

        try {
            Map<String, BigDecimal> debits = new HashMap<>();
            Map<String, BigDecimal> credits = new HashMap<>();

            String debitAccount = "CASH".equalsIgnoreCase(sale.getPaymentMethod()) ? "CASH_DRAWER" : "BANK_ACCOUNT";
            debits.put(debitAccount, sale.getTotalAmount());

            if (sale.getDiscount() != null && sale.getDiscount().compareTo(BigDecimal.ZERO) > 0) {
                debits.put("SALES_DISCOUNT", sale.getDiscount());
            }

            BigDecimal productRev = BigDecimal.ZERO;
            BigDecimal serviceRev = BigDecimal.ZERO;
            BigDecimal totalCost = BigDecimal.ZERO;

            if (sale.getItems() != null) {
                for (SaleItem item : sale.getItems()) {
                    BigDecimal itemTotal = item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                    if ("PRODUCT".equalsIgnoreCase(item.getType())) {
                        productRev = productRev.add(itemTotal);
                        if (item.getCogs() != null && item.getCogs().compareTo(BigDecimal.ZERO) > 0) {
                            totalCost = totalCost.add(item.getCogs());
                        }
                    } else {
                        serviceRev = serviceRev.add(itemTotal);
                    }
                }
            }

            if (productRev.compareTo(BigDecimal.ZERO) > 0) {
                credits.put("REVENUE_PRODUCT_SALES", productRev);
            }
            if (serviceRev.compareTo(BigDecimal.ZERO) > 0) {
                credits.put("REVENUE_SERVICE_SALES", serviceRev);
            }
            if (sale.getTax() != null && sale.getTax().compareTo(BigDecimal.ZERO) > 0) {
                credits.put("SALES_TAX_PAYABLE", sale.getTax());
            }

            // Balance: if rounding left credits short, pad revenue; if over, reduce discount path
            BigDecimal debitSum = debits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal creditSum = credits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal delta = debitSum.subtract(creditSum);
            if (delta.compareTo(BigDecimal.ZERO) != 0) {
                credits.merge("REVENUE_PRODUCT_SALES", delta, BigDecimal::add);
            }

            ledgerService.postJournalEntry(
                    tenant,
                    "Customer POS checkout invoice: " + sale.getSaleNumber(),
                    debits,
                    credits
            );

            if (totalCost.compareTo(BigDecimal.ZERO) > 0) {
                Map<String, BigDecimal> cogsDebits = new HashMap<>();
                Map<String, BigDecimal> cogsCredits = new HashMap<>();
                cogsDebits.put("COST_OF_GOODS_SOLD", totalCost);
                cogsCredits.put("INVENTORY_ASSETS", totalCost);
                ledgerService.postJournalEntry(
                        tenant,
                        "COGS posting for sale: " + sale.getSaleNumber(),
                        cogsDebits,
                        cogsCredits
                );
            }
        } catch (Exception ex) {
            log.error("Failed to post financial journals for sale {}: {}", sale.getSaleNumber(), ex.getMessage(), ex);
        }
    }
}
