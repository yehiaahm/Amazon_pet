package com.animasys.modules.sales.listeners;

import com.animasys.core.audit.AuditLog;
import com.animasys.core.audit.AuditLogRepository;
import com.animasys.modules.finance.service.GeneralLedgerService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.events.SaleCompletedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import java.math.BigDecimal;
import java.util.*;

@Component
@RequiredArgsConstructor
public class SaleCompletedListener {

    private final StockService stockService;
    private final GeneralLedgerService ledgerService;
    private final AuditLogRepository auditLogRepository;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleSaleCompleted(SaleCompletedEvent event) {
        Sale sale = event.getSale();

        // 1. Deduct Inventory for product items
        // In our simplified DB, we deduct stock from WH-SHELF (shelves)
        // Let's assume a default shelf warehouse exists: "wh-shelf"
        for (SaleItem item : sale.getItems()) {
            if ("PRODUCT".equals(item.getType())) {
                try {
                    stockService.adjustStock(
                            item.getItemId(),
                            "wh-shelf", // default shelves warehouse
                            -item.getQuantity(),
                            "SALE",
                            sale.getEmployee().getId()
                    );
                } catch (Exception ex) {
                    System.err.println("Failed to deduct stock for item variant " + item.getItemId() + ": " + ex.getMessage());
                }
            }
        }

        // 2. Post Financial Ledger entries (Double-entry)
        try {
            Map<String, BigDecimal> debits = new HashMap<>();
            Map<String, BigDecimal> credits = new HashMap<>();

            // Debit: Cash drawer or Bank account
            String debitAccount = "CASH".equals(sale.getPaymentMethod()) ? "CASH_DRAWER" : "BANK_ACCOUNT";
            debits.put(debitAccount, sale.getTotalAmount());

            // Credit: Product sales revenue or Service sales revenue
            BigDecimal productRev = BigDecimal.ZERO;
            BigDecimal serviceRev = BigDecimal.ZERO;
            BigDecimal totalCost = BigDecimal.ZERO;

            for (SaleItem item : sale.getItems()) {
                BigDecimal itemTotal = item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                if ("PRODUCT".equals(item.getType())) {
                    productRev = productRev.add(itemTotal);
                    totalCost = totalCost.add(item.getCost().multiply(BigDecimal.valueOf(item.getQuantity())));
                } else {
                    serviceRev = serviceRev.add(itemTotal);
                }
            }

            if (productRev.compareTo(BigDecimal.ZERO) > 0) {
                credits.put("REVENUE_PRODUCT_SALES", productRev);
            }
            if (serviceRev.compareTo(BigDecimal.ZERO) > 0) {
                credits.put("REVENUE_SERVICE_SALES", serviceRev);
            }

            // Post main sale transaction entry
            ledgerService.postJournalEntry(
                    sale.getEmployee().getTenant(),
                    "Customer POS checkout invoice: " + sale.getSaleNumber(),
                    debits,
                    credits
            );

            // If there's retail product cost, post COGS entries
            if (totalCost.compareTo(BigDecimal.ZERO) > 0) {
                Map<String, BigDecimal> cogsDebits = new HashMap<>();
                Map<String, BigDecimal> cogsCredits = new HashMap<>();

                cogsDebits.put("COST_OF_GOODS_SOLD", totalCost);
                cogsCredits.put("INVENTORY_ASSETS", totalCost);

                ledgerService.postJournalEntry(
                        sale.getEmployee().getTenant(),
                        "COGS posting for sale: " + sale.getSaleNumber(),
                        cogsDebits,
                        cogsCredits
                );
            }
        } catch (Exception ex) {
            System.err.println("Failed to post financial journals for sale: " + ex.getMessage());
        }

        // 3. Write Audit Log
        try {
            AuditLog log = AuditLog.builder()
                    .id(UUID.randomUUID().toString())
                    .employee(sale.getEmployee())
                    .action("POS_CHECKOUT")
                    .affectedEntity("Sale")
                    .entityId(sale.getId())
                    .newState("Checked out sale: " + sale.getSaleNumber() + ", Total: $" + sale.getTotalAmount())
                    .timestamp(sale.getDate())
                    .build();
            auditLogRepository.save(log);
        } catch (Exception ex) {
            System.err.println("Failed to log audit check for sale: " + ex.getMessage());
        }

        // 4. Dispatch SMS receipt (Notification Mock)
        System.out.println(">>> Sending receipt notification via SMS to customer: " + 
                (sale.getCustomer() != null ? sale.getCustomer().getName() : "Walk-in Customer") + 
                " | Sale Total: $" + sale.getTotalAmount());
    }
}
