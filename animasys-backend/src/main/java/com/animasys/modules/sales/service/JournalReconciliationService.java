package com.animasys.modules.sales.service;

import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Self-healing sweep for P0.4 (missing accounting journals): finds every COMPLETED sale whose
 * journal_status isn't POSTED (PENDING -- the app crashed between sale-commit and the event
 * handler running, or FAILED -- posting was attempted and threw) and retries posting.
 * postJournalsForSale is itself idempotent (guarded by journal_status and, belt-and-suspenders, by
 * checking for an existing revenue journal row before posting), so re-running this against sales
 * that are already fine is always safe -- it just does nothing for them.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JournalReconciliationService {

    private static final String COMPLETED = "COMPLETED";
    private static final String POSTED = "POSTED";

    private final SaleRepository saleRepository;
    private final JournalPostingExecutor journalPostingExecutor;

    /** Runs hourly; a missed/failed post from a crash or transient DB hiccup won't sit forever. */
    @Scheduled(cron = "0 15 * * * *")
    public void reconcileScheduled() {
        int fixed = reconcileMissingJournals();
        if (fixed > 0) {
            log.info("Journal reconciliation: posted journals for {} previously-unposted completed sale(s)", fixed);
        }
    }

    /** Returns how many sales were successfully posted by this pass. */
    public int reconcileMissingJournals() {
        List<Sale> unposted = saleRepository.findByStatusAndJournalStatusNot(COMPLETED, POSTED);
        int fixedCount = 0;
        for (Sale sale : unposted) {
            try {
                journalPostingExecutor.postJournalsForSale(sale.getId());
                fixedCount++;
            } catch (Exception ex) {
                log.error("Journal reconciliation: retry failed for sale {}: {}", sale.getSaleNumber(), ex.getMessage(), ex);
                try {
                    journalPostingExecutor.markJournalFailed(sale.getId(), ex.getMessage());
                } catch (Exception recordEx) {
                    log.error("Journal reconciliation: failed to record retry failure for sale {}: {}",
                            sale.getSaleNumber(), recordEx.getMessage(), recordEx);
                }
            }
        }
        return fixedCount;
    }
}
