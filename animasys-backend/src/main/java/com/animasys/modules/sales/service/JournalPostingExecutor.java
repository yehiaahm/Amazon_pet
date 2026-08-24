package com.animasys.modules.sales.service;

import com.animasys.modules.finance.repository.JournalRepository;
import com.animasys.modules.finance.service.GeneralLedgerService;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * Holds the transactional steps of post-sale journal posting as separate proxied bean methods,
 * following the same pattern as IdempotentCheckoutTransactionExecutor: SaleCompletedListener must
 * call these across a real bean boundary (never {@code this.foo(...)}) or REQUIRES_NEW silently
 * doesn't apply.
 *
 * <p>Posting revenue + COGS journals used to happen as two independent
 * {@code ledgerService.postJournalEntry} calls inside one big try/catch that just logged any
 * failure. Two problems with that: (1) a failure was never recorded anywhere durable, so a sale
 * could sit forever with no accounting entries and nothing would ever notice or retry (confirmed:
 * 22 of 6,428 completed sales had zero journal entries); (2) if the *second* call (COGS) threw
 * after the first (revenue) had already succeeded, both were silently caught by the same
 * try/catch, but revenue's writes were already in the persistence context and would still commit
 * at the end of the REQUIRES_NEW transaction -- a *partial* journal (revenue only, no COGS) that
 * looks "posted" but understates cost of goods sold. postForSale() below does both postings in one
 * atomic step: either both are recorded and the sale is marked POSTED, or the whole transaction
 * (including any partial writes) is rolled back and nothing lingers half-done.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JournalPostingExecutor {

    static final String CHECKOUT_JOURNAL_PREFIX = "Customer POS checkout invoice: ";
    static final String COGS_JOURNAL_PREFIX = "COGS posting for sale: ";

    /** Genuine BigDecimal rounding noise across separately-scaled sums, never a feature gap. */
    private static final BigDecimal ROUNDING_TOLERANCE = new BigDecimal("0.02");

    private final GeneralLedgerService ledgerService;
    private final SaleRepository saleRepository;
    private final EmployeeRepository employeeRepository;
    private final JournalRepository journalRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void postJournalsForSale(String saleId) {
        Sale sale = saleRepository.findById(saleId).orElse(null);
        if (sale == null || sale.getEmployee() == null) {
            log.warn("JournalPosting: sale {} missing or has no employee", saleId);
            return;
        }

        if ("POSTED".equals(sale.getJournalStatus())) {
            return; // already posted (idempotent retry from the reconciliation job)
        }

        var employee = employeeRepository.findByIdWithTenant(sale.getEmployee().getId()).orElse(null);
        if (employee == null || employee.getTenant() == null) {
            throw new IllegalStateException("Cannot resolve tenant for sale " + sale.getSaleNumber());
        }
        Tenant tenant = employee.getTenant();

        String checkoutDescription = CHECKOUT_JOURNAL_PREFIX + sale.getSaleNumber();
        if (journalRepository.existsByTenant_IdAndDescription(tenant.getId(), checkoutDescription)) {
            // The revenue journal already exists (e.g. this sale predates V50, or a previous
            // attempt got as far as committing it before some unrelated later failure). Never
            // re-post it -- that would double-count revenue. Just mark the sale POSTED to stop
            // the reconciliation job from re-examining it every run.
            markPosted(sale);
            return;
        }

        Map<String, BigDecimal> debits = new HashMap<>();
        Map<String, BigDecimal> credits = new HashMap<>();

        String debitAccount = "CASH".equalsIgnoreCase(sale.getPaymentMethod()) ? "CASH_DRAWER" : "BANK_ACCOUNT";
        debits.put(debitAccount, sale.getTotalAmount());

        if (sale.getDiscount() != null && sale.getDiscount().compareTo(BigDecimal.ZERO) > 0) {
            debits.put("SALES_DISCOUNT", sale.getDiscount());
        }
        if (sale.getLoyaltyRedeemed() != null && sale.getLoyaltyRedeemed().compareTo(BigDecimal.ZERO) > 0) {
            // Full revenue is still recognized below; the value given up to the customer via
            // loyalty points is booked as its own expense line rather than netted invisibly out
            // of revenue (that netting is exactly what used to feed the growing revenue/journal
            // reconciliation gap once loyalty redemption started being used).
            debits.put("LOYALTY_REDEMPTION_EXPENSE", sale.getLoyaltyRedeemed());
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
        if (sale.getDeliveryFee() != null && sale.getDeliveryFee().compareTo(BigDecimal.ZERO) > 0) {
            credits.put("DELIVERY_REVENUE", sale.getDeliveryFee());
        }

        BigDecimal debitSum = debits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal creditSum = credits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal delta = debitSum.subtract(creditSum);
        if (delta.compareTo(BigDecimal.ZERO) != 0) {
            // Only ever absorb genuine penny-level rounding noise, and do it visibly (its own
            // account, not blended into revenue) -- anything larger means the debit/credit
            // construction above is missing a real line item, and postJournalEntry's own balance
            // check below should throw so it gets recorded as a FAILED sale for investigation
            // instead of silently distorting reported revenue.
            if (delta.abs().compareTo(ROUNDING_TOLERANCE) <= 0) {
                if (delta.compareTo(BigDecimal.ZERO) > 0) {
                    credits.merge("ROUNDING_ADJUSTMENT", delta, BigDecimal::add);
                } else {
                    debits.merge("ROUNDING_ADJUSTMENT", delta.abs(), BigDecimal::add);
                }
            }
        }

        ledgerService.postJournalEntry(tenant, checkoutDescription, debits, credits);

        if (totalCost.compareTo(BigDecimal.ZERO) > 0) {
            Map<String, BigDecimal> cogsDebits = new HashMap<>();
            Map<String, BigDecimal> cogsCredits = new HashMap<>();
            cogsDebits.put("COST_OF_GOODS_SOLD", totalCost);
            cogsCredits.put("INVENTORY_ASSETS", totalCost);
            ledgerService.postJournalEntry(tenant, COGS_JOURNAL_PREFIX + sale.getSaleNumber(), cogsDebits, cogsCredits);
        }

        markPosted(sale);
    }

    private void markPosted(Sale sale) {
        sale.setJournalStatus("POSTED");
        sale.setJournalFailureReason(null);
        saleRepository.save(sale);
    }

    /** Own independent transaction so this commits even though postJournalsForSale rolled back. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markJournalFailed(String saleId, String reason) {
        saleRepository.findById(saleId).ifPresent(sale -> {
            sale.setJournalStatus("FAILED");
            sale.setJournalFailureReason(reason == null ? null : reason.substring(0, Math.min(reason.length(), 1000)));
            saleRepository.save(sale);
        });
    }
}
