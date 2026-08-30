-- Enforce customer phone uniqueness per tenant at the database level.
--
-- Previously the only protection against duplicate customers was an application-level
-- check-then-insert in CustomerService.createCustomer (findByPhoneAndTenantId, then save).
-- Under concurrent requests with the same phone number, two requests can both pass the
-- check before either has committed its insert, producing two customer rows for the same
-- phone (confirmed: 15 concurrent registrations -> 2 rows).
--
-- We do NOT touch the existing `phone` column or delete/alter any customer row to fix this.
-- Instead we add a second column, `phone_dedupe_key`, that the application always keeps
-- equal to the normalized (trimmed, non-blank) `phone` value on every insert/update going
-- forward, and put the UNIQUE constraint on (tenant_id, phone_dedupe_key) instead of on
-- `phone` directly. MySQL/H2 unique indexes treat NULL as distinct from every other NULL,
-- so customers without a phone number (dedupe key NULL) are never blocked by each other.
--
-- For any duplicate (tenant_id, phone) group that already exists from before this migration,
-- we keep exactly one row's dedupe key equal to its phone (the earliest by id, which is a
-- UUID and not chronologically meaningful, but a deterministic tie-breaker is all that's
-- needed here) and set every other row in that group's dedupe key to NULL. This means:
--   - No customer record, name, phone, or history is deleted or modified.
--   - The `phone` column itself is never touched — what staff see/search by is unchanged.
--   - Pre-existing duplicate groups remain visible in the system for manual reconciliation;
--     they simply won't be blocked from existing (since their dedupe key is NULL, exactly
--     like a customer with no phone at all).
--   - Any *edit* to one of those leftover duplicate rows that re-sets its phone will now be
--     subject to the same uniqueness check as everything else (CustomerService keeps
--     phone_dedupe_key in sync with phone on every write), so the operator will be asked to
--     resolve the conflict (e.g. correct the number) before saving — a deliberate,
--     non-destructive forcing function rather than silent data loss.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_dedupe_key VARCHAR(30) NULL;

-- Seed the dedupe key for every non-blank phone (temporarily including duplicates).
UPDATE customers
SET phone_dedupe_key = phone
WHERE phone IS NOT NULL AND phone <> '';

-- Clear the dedupe key for every row except one deterministic "keeper" per (tenant_id, phone)
-- duplicate group. Wrapped in a double derived-table subquery (rather than referencing
-- `customers` directly inside the UPDATE's own subquery) because MySQL forbids selecting from
-- the table being updated except through a materialized derived table.
UPDATE customers
SET phone_dedupe_key = NULL
WHERE id IN (
    SELECT id FROM (
        SELECT c.id AS id
        FROM customers c
        JOIN (
            SELECT tenant_id, phone, MIN(id) AS keeper_id
            FROM customers
            WHERE phone IS NOT NULL AND phone <> ''
            GROUP BY tenant_id, phone
            HAVING COUNT(*) > 1
        ) dup_groups ON dup_groups.tenant_id = c.tenant_id AND dup_groups.phone = c.phone
        WHERE c.id <> dup_groups.keeper_id
    ) AS non_keepers
);

ALTER TABLE customers ADD CONSTRAINT IF NOT EXISTS uk_customers_tenant_phone_dedupe UNIQUE (tenant_id, phone_dedupe_key);
