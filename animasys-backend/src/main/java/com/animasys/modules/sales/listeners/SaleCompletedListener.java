package com.animasys.modules.sales.listeners;

import com.animasys.modules.sales.events.SaleCompletedEvent;
import com.animasys.modules.sales.service.JournalPostingExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Posts financial journals after the sale transaction commits.
 * Stock deduction is handled synchronously inside SaleService (same TX as the sale).
 *
 * <p>Purely an orchestrator now: the actual posting (and the atomic revenue+COGS boundary, and
 * the durable PENDING/POSTED/FAILED status write) lives in JournalPostingExecutor, called across
 * a real bean proxy so its {@code @Transactional(REQUIRES_NEW)} methods actually apply -- see that
 * class's javadoc for why the previous single-method version could leave a sale "posted" with only
 * half its journal entries, and why failures were never recorded anywhere.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SaleCompletedListener {

    private final JournalPostingExecutor journalPostingExecutor;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleSaleCompleted(SaleCompletedEvent event) {
        String saleId = event.getSale().getId();
        try {
            journalPostingExecutor.postJournalsForSale(saleId);
        } catch (Exception ex) {
            log.error("Failed to post financial journals for sale {}: {}", saleId, ex.getMessage(), ex);
            try {
                journalPostingExecutor.markJournalFailed(saleId, rootMessage(ex));
            } catch (Exception recordEx) {
                log.error("Failed to even record journal-posting failure for sale {}: {}",
                        saleId, recordEx.getMessage(), recordEx);
            }
        }
    }

    private static String rootMessage(Throwable ex) {
        Throwable cur = ex;
        String last = ex.getMessage();
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
            if (cur.getMessage() != null && !cur.getMessage().isBlank()) {
                last = cur.getMessage();
            }
        }
        return last;
    }
}
