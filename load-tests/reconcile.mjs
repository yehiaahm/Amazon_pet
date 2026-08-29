import mysql from 'mysql2/promise';
import { writeFileSync } from 'node:fs';

const conn = await mysql.createConnection({
  host: 'localhost', port: 3306, user: 'root', password: process.env.MYSQL_PWD || 'yehia.hema195200',
  database: 'animasys_loadtest', charset: 'utf8mb4',
});

const report = { generatedAt: new Date().toISOString(), checks: [] };
function check(name, pass, detail) {
  report.checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`);
}

async function q(sql, params) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

// 1. Basic counts
const [counts] = await conn.query(`
  SELECT
    (SELECT COUNT(*) FROM sales) AS sales,
    (SELECT COUNT(*) FROM sale_items) AS sale_items,
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM product_variants) AS variants,
    (SELECT COUNT(*) FROM inventory_batches) AS batches,
    (SELECT COUNT(*) FROM journals) AS journals,
    (SELECT COUNT(*) FROM journal_entries) AS journal_entries,
    (SELECT COUNT(*) FROM idempotency_keys) AS idempotency_keys
`);
report.counts = counts[0];
console.log('Row counts:', counts[0]);

// 2. Orphan check: sale_items referencing non-existent sales
const orphanItems = await q(`
  SELECT COUNT(*) AS c FROM sale_items si LEFT JOIN sales s ON si.sale_id = s.id WHERE s.id IS NULL
`);
check('no_orphan_sale_items', orphanItems[0].c === 0, { orphanCount: orphanItems[0].c });

// 3. Orphan check: sales with no sale_items at all (every sale must have >=1 line)
const emptySales = await q(`
  SELECT COUNT(*) AS c FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id WHERE si.id IS NULL
`);
check('no_sales_without_items', emptySales[0].c === 0, { emptySalesCount: emptySales[0].c });

// 4. Duplicate sale_number check (should be globally unique per schema constraint, but verify no app-level dupes slipped through)
const dupSaleNumbers = await q(`
  SELECT sale_number, COUNT(*) c FROM sales GROUP BY sale_number HAVING c > 1
`);
check('no_duplicate_sale_numbers', dupSaleNumbers.length === 0, { duplicates: dupSaleNumbers.length });

// 5. Idempotency: every COMPLETED idempotency_keys row should map to exactly one sale,
//    and no idempotency key should have multiple sales attached across retries.
const idemMismatch = await q(`
  SELECT ik.idempotency_key, ik.status, ik.sale_id, COUNT(s.id) AS matching_sales
  FROM idempotency_keys ik LEFT JOIN sales s ON s.id = ik.sale_id
  WHERE ik.status = 'COMPLETED'
  GROUP BY ik.idempotency_key, ik.status, ik.sale_id
  HAVING matching_sales != 1
`);
check('idempotency_keys_map_to_exactly_one_sale', idemMismatch.length === 0, { badRows: idemMismatch.length });

// 6. Sale total formula: total_amount should equal (subtotal - discount + tax + delivery_fee - loyalty_redeemed)
//    within the server's own documented $2 fuzz tolerance (SaleService.java:275-279), computed from sale_items.
const saleTotals = await q(`
  SELECT s.id, s.total_amount, s.discount, s.tax, s.delivery_fee, s.loyalty_redeemed,
         COALESCE(SUM(si.price * si.quantity), 0) AS computed_subtotal
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
  GROUP BY s.id, s.total_amount, s.discount, s.tax, s.delivery_fee, s.loyalty_redeemed
`);
let totalMismatches = [];
for (const row of saleTotals) {
  const expected = Number(row.computed_subtotal) - Number(row.discount) + Number(row.tax) + Number(row.delivery_fee) - Number(row.loyalty_redeemed);
  const actual = Number(row.total_amount);
  if (Math.abs(expected - actual) > 2.01) {
    totalMismatches.push({ saleId: row.id, expected: +expected.toFixed(2), actual, subtotal: row.computed_subtotal });
  }
}
check('sale_totals_match_subtotal_minus_discount_plus_tax_plus_delivery_minus_loyalty', totalMismatches.length === 0,
  { mismatchCount: totalMismatches.length, samples: totalMismatches.slice(0, 5), totalSalesChecked: saleTotals.length });

// 7. Gross profit formula: sale_items.gross_profit == price*qty - cogs (per line)
const gpRows = await q(`SELECT id, price, quantity, cogs, gross_profit FROM sale_items`);
let gpMismatches = [];
for (const row of gpRows) {
  const expected = Number(row.price) * row.quantity - Number(row.cogs);
  const actual = Number(row.gross_profit);
  if (Math.abs(expected - actual) > 0.02) gpMismatches.push({ itemId: row.id, expected: +expected.toFixed(4), actual });
}
check('sale_item_gross_profit_matches_revenue_minus_cogs', gpMismatches.length === 0, { mismatchCount: gpMismatches.length, samples: gpMismatches.slice(0, 5), totalItemsChecked: gpRows.length });

// 8. Journal balance: every journal's total_debit must equal total_credit (GeneralLedgerService hard-fails otherwise, but verify persisted state)
const unbalancedJournals = await q(`SELECT id, total_debit, total_credit FROM journals WHERE ABS(total_debit - total_credit) > 0.01`);
check('all_journals_balanced_debit_eq_credit', unbalancedJournals.length === 0, { unbalancedCount: unbalancedJournals.length, samples: unbalancedJournals.slice(0, 5) });

// 9. Journal_entries sum per journal matches journals.total_debit/total_credit
const journalEntrySums = await q(`
  SELECT j.id, j.total_debit, j.total_credit,
    COALESCE(SUM(CASE WHEN je.type='DEBIT' THEN je.amount ELSE 0 END),0) AS entries_debit,
    COALESCE(SUM(CASE WHEN je.type='CREDIT' THEN je.amount ELSE 0 END),0) AS entries_credit
  FROM journals j LEFT JOIN journal_entries je ON je.journal_id = j.id
  GROUP BY j.id, j.total_debit, j.total_credit
  HAVING ABS(total_debit - entries_debit) > 0.01 OR ABS(total_credit - entries_credit) > 0.01
`);
check('journal_header_totals_match_entry_line_sums', journalEntrySums.length === 0, { mismatchCount: journalEntrySums.length, samples: journalEntrySums.slice(0, 5) });

// 10. Completed sales should each have at least one journal (SaleCompletedListener risk noted in audit:
//     journal posting failures are caught/logged, not rolled back — so a sale CAN exist with zero journals).
//     journals has no sale_id FK; description is a fixed-prefix string ("COGS posting for sale: <sale_number>" /
//     "Customer POS checkout invoice: <sale_number>"), so extract+join on that instead of a LIKE '%..%' N*M scan.
const [[{ c: totalCompleted }]] = [await q(`SELECT COUNT(*) AS c FROM sales WHERE status IN ('COMPLETED','PARTIALLY_REFUNDED')`)];
const [[{ c: withCogsJournal }]] = [await q(`
  SELECT COUNT(DISTINCT s.id) AS c FROM sales s
  JOIN journals j ON j.description = CONCAT('COGS posting for sale: ', s.sale_number)
  WHERE s.status IN ('COMPLETED','PARTIALLY_REFUNDED')
`)];
const [[{ c: withInvoiceJournal }]] = [await q(`
  SELECT COUNT(DISTINCT s.id) AS c FROM sales s
  JOIN journals j ON j.description = CONCAT('Customer POS checkout invoice: ', s.sale_number)
  WHERE s.status IN ('COMPLETED','PARTIALLY_REFUNDED')
`)];
const missingAnyJournal = totalCompleted - withInvoiceJournal;
check('every_completed_sale_has_a_journal_entry', missingAnyJournal === 0,
  { totalCompleted, withInvoiceJournal, withCogsJournal, missingInvoiceJournal: missingAnyJournal, missingCogsJournal: totalCompleted - withCogsJournal });

// 11. Inventory batch integrity: remaining_quantity never negative, never exceeds initial_quantity
const badBatches = await q(`SELECT id, initial_quantity, remaining_quantity FROM inventory_batches WHERE remaining_quantity < 0 OR remaining_quantity > initial_quantity`);
check('no_negative_or_overflowing_batch_quantities', badBatches.length === 0, { badCount: badBatches.length, samples: badBatches.slice(0, 5) });

// 12. Stock consistency: product_variants.stock_quantity == SUM(active batch remaining_quantity) for that variant
const stockMismatch = await q(`
  SELECT pv.id, pv.stock_quantity AS reported,
    COALESCE((SELECT SUM(ib.remaining_quantity) FROM inventory_batches ib WHERE ib.product_variant_id = pv.id AND ib.status='ACTIVE'), 0) AS computed
  FROM product_variants pv
  HAVING reported != computed
`);
check('variant_stock_quantity_matches_sum_of_active_batches', stockMismatch.length === 0, { mismatchCount: stockMismatch.length, samples: stockMismatch.slice(0, 5) });

// 13. No duplicate customer phone numbers (should be blocked by app logic; verify DB agrees)
const dupPhones = await q(`SELECT phone, COUNT(*) c FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING c > 1`);
check('no_duplicate_customer_phone_numbers', dupPhones.length === 0, { duplicateCount: dupPhones.length, samples: dupPhones.slice(0, 5) });

// 14. Revenue reconciliation: total revenue (sum of sale totals for non-refunded) vs sum of REVENUE_* credits in journals
const revenueFromSales = await q(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE status != 'REFUNDED'`);
const revenueFromJournals = await q(`
  SELECT COALESCE(SUM(amount),0) AS total FROM journal_entries WHERE account_code IN ('REVENUE_PRODUCT_SALES','REVENUE_SERVICE_SALES') AND type='CREDIT'
`);
report.revenueReconciliation = { fromSalesTable: revenueFromSales[0].total, fromJournalCredits: revenueFromJournals[0].total };
console.log('Revenue reconciliation (informational — journals include plug adjustments per audit):', report.revenueReconciliation);

report.summary = {
  totalChecks: report.checks.length,
  passed: report.checks.filter(c => c.pass).length,
  failed: report.checks.filter(c => !c.pass).length,
};
console.log('\n=== RECONCILIATION SUMMARY ===', report.summary);

writeFileSync(new URL('./results/reconciliation.json', import.meta.url), JSON.stringify(report, null, 2));
await conn.end();
