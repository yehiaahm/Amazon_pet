-- Tracks whether the accounting journal(s) for a completed sale have actually been posted.
--
-- Previously SaleCompletedListener posted journals in a post-commit REQUIRES_NEW transaction and
-- on any failure just logged the exception and returned normally -- no durable record was ever
-- kept that a sale's accounting entries were missing, so nothing could ever notice or retry.
-- Confirmed by reconciliation: 22 of 6,428 completed sales (0.34%) had zero journal entries.
--
-- journal_status: PENDING (not yet attempted, or the app crashed between sale-commit and the
-- event handler running), POSTED (both the revenue and, if applicable, COGS journals exist),
-- FAILED (posting was attempted and threw -- see journal_failure_reason).
--
-- Backfill: mark existing sales POSTED only where we can find the actual revenue journal that
-- SaleCompletedListener posts for it (matched by its exact, stable description string). Every
-- other COMPLETED sale is left at the PENDING default so the new reconciliation job (see
-- JournalPostingExecutor) picks it up and posts it for real -- this correctly captures the 22
-- already-known-missing sales without needing to trust anything about *why* they're missing.
-- Sales with a matching revenue journal are never re-posted, so this can't double-count revenue.

ALTER TABLE sales ADD COLUMN IF NOT EXISTS journal_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS journal_failure_reason VARCHAR(1000) NULL;

UPDATE sales s
SET journal_status = 'POSTED'
WHERE s.status = 'COMPLETED'
  AND EXISTS (
    SELECT 1 FROM journals j
    WHERE j.description = CONCAT('Customer POS checkout invoice: ', s.sale_number)
  );

CREATE INDEX idx_sales_journal_status ON sales(journal_status);
