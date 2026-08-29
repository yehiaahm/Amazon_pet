// Post-hardening reconciliation, adapted from reconcile.mjs's checks but pointed at the
// isolated H2 fallback file this soak run actually used (MySQL auth was a placeholder on
// this machine — see README.md in results/post-hardening-soak/ for the full explanation).
// Runs each query out-of-process via the bundled H2 Shell tool (CALL CSVWRITE(...)) so it can
// read the live H2 file concurrently with the running Spring Boot app (AUTO_SERVER=TRUE).
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

const H2_JAR = process.env.H2_JAR || 'C:/Users/Yahia/.m2/repository/com/h2database/h2/2.2.224/h2-2.2.224.jar';
const H2_URL = process.env.H2_URL || 'jdbc:h2:file:C:/projectes/Amazon_pet/animasys-backend/.data/soak_posthardening;MODE=MySQL;DATABASE_TO_UPPER=false;AUTO_SERVER=TRUE';
const TMP_DIR = 'C:/projectes/Amazon_pet/load-tests/results/post-hardening-soak/recon-tmp';
mkdirSync(TMP_DIR, { recursive: true });

let qn = 0;
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.length);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = parseLine(l);
    const row = {};
    header.forEach((h, i) => { row[h] = vals[i]; });
    return row;
  });
}

async function q(sql, attempt = 1) {
  qn++;
  const file = `${TMP_DIR}/q${qn}.csv`;
  const escaped = sql.replace(/'/g, "''");
  const script = `CALL CSVWRITE('${file}', '${escaped}')`;
  try {
    // NOTE: org.h2.tools.Shell exits 0 even when the SQL itself errors (e.g. a syntax error) —
    // it just prints the exception to stdout and leaves the target CSV unwritten. Check stdout
    // explicitly so a real SQL bug surfaces as a clear error instead of a confusing downstream
    // ENOENT on the never-created file.
    const { stdout } = await execFileP('java', ['-cp', H2_JAR, 'org.h2.tools.Shell', '-url', H2_URL, '-user', 'sa', '-password', '', '-sql', script], { timeout: 90000 });
    if (/Exception|SQL Error|Syntax error/i.test(stdout)) {
      throw new Error(`H2 Shell reported an error for query #${qn}: ${stdout.slice(0, 500)}`);
    }
    const text = readFileSync(file, 'utf8');
    rmSync(file, { force: true });
    return parseCsv(text);
  } catch (e) {
    // Transient lock/timeout retry (e.g. a heavier join racing the live app's writes while the
    // soak is still running) — one retry with a fresh query id is enough in practice.
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000));
      return q(sql, attempt + 1);
    }
    throw e;
  }
}

const report = { generatedAt: new Date().toISOString(), dbEngine: 'H2 (fallback — MySQL credentials on this machine were a placeholder, see README)', checks: [] };
function check(name, pass, detail) {
  report.checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`);
}
const n = (v) => v === undefined || v === null || v === '' ? 0 : Number(v);

// Everything below is wrapped so that if any single query fails (timeout, transient lock, etc.)
// after some checks have already run, we still write out whatever was collected instead of
// crashing with zero output — partial reconciliation results are far more useful than none.
try {

// 1. Basic counts
const countsRow = (await q(`
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
`))[0];
report.counts = countsRow;
console.log('Row counts:', countsRow);

const orphanItems = await q(`SELECT COUNT(*) AS c FROM sale_items si LEFT JOIN sales s ON si.sale_id = s.id WHERE s.id IS NULL`);
check('no_orphan_sale_items', n(orphanItems[0].C ?? orphanItems[0].c) === 0, { orphanCount: orphanItems[0].C ?? orphanItems[0].c });

const emptySales = await q(`SELECT COUNT(*) AS c FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id WHERE si.id IS NULL`);
check('no_sales_without_items', n(emptySales[0].C ?? emptySales[0].c) === 0, { emptySalesCount: emptySales[0].C ?? emptySales[0].c });

const dupSaleNumbers = await q(`SELECT sale_number, COUNT(*) c FROM sales GROUP BY sale_number HAVING COUNT(*) > 1`);
check('no_duplicate_sale_numbers', dupSaleNumbers.length === 0, { duplicates: dupSaleNumbers.length });

const idemMismatch = await q(`
  SELECT ik.idempotency_key, ik.status, ik.sale_id, COUNT(s.id) AS matching_sales
  FROM idempotency_keys ik LEFT JOIN sales s ON s.id = ik.sale_id
  WHERE ik.status = 'COMPLETED'
  GROUP BY ik.idempotency_key, ik.status, ik.sale_id
  HAVING COUNT(s.id) != 1
`);
check('idempotency_keys_map_to_exactly_one_sale', idemMismatch.length === 0, { badRows: idemMismatch.length });

const saleTotals = await q(`
  SELECT s.id, s.total_amount, s.discount, s.tax, s.delivery_fee, s.loyalty_redeemed,
         COALESCE(SUM(si.price * si.quantity), 0) AS computed_subtotal
  FROM sales s JOIN sale_items si ON si.sale_id = s.id
  GROUP BY s.id, s.total_amount, s.discount, s.tax, s.delivery_fee, s.loyalty_redeemed
`);
let totalMismatches = [];
for (const row of saleTotals) {
  const expected = n(row.COMPUTED_SUBTOTAL ?? row.computed_subtotal) - n(row.DISCOUNT ?? row.discount) + n(row.TAX ?? row.tax) + n(row.DELIVERY_FEE ?? row.delivery_fee) - n(row.LOYALTY_REDEEMED ?? row.loyalty_redeemed);
  const actual = n(row.TOTAL_AMOUNT ?? row.total_amount);
  if (Math.abs(expected - actual) > 2.01) totalMismatches.push({ saleId: row.ID ?? row.id, expected: +expected.toFixed(2), actual });
}
check('sale_totals_match_subtotal_minus_discount_plus_tax_plus_delivery_minus_loyalty', totalMismatches.length === 0,
  { mismatchCount: totalMismatches.length, samples: totalMismatches.slice(0, 5), totalSalesChecked: saleTotals.length });

const gpRows = await q(`SELECT id, price, quantity, cogs, gross_profit FROM sale_items`);
let gpMismatches = [];
for (const row of gpRows) {
  const expected = n(row.PRICE ?? row.price) * n(row.QUANTITY ?? row.quantity) - n(row.COGS ?? row.cogs);
  const actual = n(row.GROSS_PROFIT ?? row.gross_profit);
  if (Math.abs(expected - actual) > 0.02) gpMismatches.push({ itemId: row.ID ?? row.id, expected: +expected.toFixed(4), actual });
}
check('sale_item_gross_profit_matches_revenue_minus_cogs', gpMismatches.length === 0, { mismatchCount: gpMismatches.length, samples: gpMismatches.slice(0, 5), totalItemsChecked: gpRows.length });

const unbalancedJournals = await q(`SELECT id, total_debit, total_credit FROM journals WHERE ABS(total_debit - total_credit) > 0.01`);
check('all_journals_balanced_debit_eq_credit', unbalancedJournals.length === 0, { unbalancedCount: unbalancedJournals.length, samples: unbalancedJournals.slice(0, 5) });

const journalEntrySums = await q(`
  SELECT j.id, j.total_debit, j.total_credit,
    COALESCE(SUM(CASE WHEN je.type='DEBIT' THEN je.amount ELSE 0 END),0) AS entries_debit,
    COALESCE(SUM(CASE WHEN je.type='CREDIT' THEN je.amount ELSE 0 END),0) AS entries_credit
  FROM journals j LEFT JOIN journal_entries je ON je.journal_id = j.id
  GROUP BY j.id, j.total_debit, j.total_credit
  HAVING ABS(total_debit - COALESCE(SUM(CASE WHEN je.type='DEBIT' THEN je.amount ELSE 0 END),0)) > 0.01
      OR ABS(total_credit - COALESCE(SUM(CASE WHEN je.type='CREDIT' THEN je.amount ELSE 0 END),0)) > 0.01
`);
check('journal_header_totals_match_entry_line_sums', journalEntrySums.length === 0, { mismatchCount: journalEntrySums.length, samples: journalEntrySums.slice(0, 5) });

// Single atomic query (one snapshot in time) instead of 3 sequential COUNTs — against a DB that
// may still be under active write load, sequential queries measure a moving target and can
// produce nonsensical deltas (withInvoiceJournal > totalCompleted) purely from more sales landing
// between queries, not from a real integrity problem.
const journalCoverageRow = (await q(`
  SELECT
    COUNT(*) AS total_completed,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM journals j WHERE j.description = CONCAT('Customer POS checkout invoice: ', s.sale_number)) THEN 1 ELSE 0 END) AS with_invoice_journal,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM journals j WHERE j.description = CONCAT('COGS posting for sale: ', s.sale_number)) THEN 1 ELSE 0 END) AS with_cogs_journal
  FROM sales s WHERE s.status IN ('COMPLETED','PARTIALLY_REFUNDED')
`))[0];
const totalCompleted = n(journalCoverageRow.TOTAL_COMPLETED ?? journalCoverageRow.total_completed);
const withInvoiceJournal = n(journalCoverageRow.WITH_INVOICE_JOURNAL ?? journalCoverageRow.with_invoice_journal);
const withCogsJournal = n(journalCoverageRow.WITH_COGS_JOURNAL ?? journalCoverageRow.with_cogs_journal);
const missingAnyJournal = totalCompleted - withInvoiceJournal;
check('every_completed_sale_has_a_journal_entry', missingAnyJournal === 0,
  { totalCompleted, withInvoiceJournal, withCogsJournal, missingInvoiceJournal: missingAnyJournal, missingCogsJournal: totalCompleted - withCogsJournal });

const badBatches = await q(`SELECT id, initial_quantity, remaining_quantity FROM inventory_batches WHERE remaining_quantity < 0 OR remaining_quantity > initial_quantity`);
check('no_negative_or_overflowing_batch_quantities', badBatches.length === 0, { badCount: badBatches.length, samples: badBatches.slice(0, 5) });

// H2 (unlike MySQL's default relaxed mode) rejects HAVING on a non-aggregated SELECT-list
// column without an explicit GROUP BY — wrap in a derived table instead so the outer WHERE
// isn't subject to that restriction.
const stockMismatch = await q(`
  SELECT * FROM (
    SELECT pv.id, pv.stock_quantity AS reported,
      COALESCE((SELECT SUM(ib.remaining_quantity) FROM inventory_batches ib WHERE ib.product_variant_id = pv.id AND ib.status='ACTIVE'), 0) AS computed
    FROM product_variants pv
  ) t WHERE reported != computed
`);
check('variant_stock_quantity_matches_sum_of_active_batches', stockMismatch.length === 0, { mismatchCount: stockMismatch.length, samples: stockMismatch.slice(0, 5) });

const dupPhones = await q(`SELECT phone, COUNT(*) c FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1`);
check('no_duplicate_customer_phone_numbers', dupPhones.length === 0, { duplicateCount: dupPhones.length, samples: dupPhones.slice(0, 5) });

// Purchase-invoice return integrity (concurrent-returns probes ran throughout the soak)
const overReturned = await q(`SELECT id, quantity, quantity_returned FROM purchase_invoice_items WHERE quantity_returned > quantity`);
check('no_purchase_invoice_item_over_returned', overReturned.length === 0, { badCount: overReturned.length, samples: overReturned.slice(0, 5) });

const revenueFromSalesRow = (await q(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE status != 'REFUNDED'`))[0];
const revenueFromJournalsRow = (await q(`SELECT COALESCE(SUM(amount),0) AS total FROM journal_entries WHERE account_code IN ('REVENUE_PRODUCT_SALES','REVENUE_SERVICE_SALES') AND type='CREDIT'`))[0];
report.revenueReconciliation = { fromSalesTable: revenueFromSalesRow.TOTAL ?? revenueFromSalesRow.total, fromJournalCredits: revenueFromJournalsRow.TOTAL ?? revenueFromJournalsRow.total };
console.log('Revenue reconciliation (informational):', report.revenueReconciliation);

} catch (e) {
  report.fatalError = String(e && e.message ? e.message : e);
  console.error('[reconcile] FATAL (writing partial report):', e && e.stack ? e.stack : e);
}

report.summary = {
  totalChecks: report.checks.length,
  passed: report.checks.filter(c => c.pass).length,
  failed: report.checks.filter(c => !c.pass).length,
  incomplete: !!report.fatalError,
};
console.log('\n=== RECONCILIATION SUMMARY ===', report.summary);

writeFileSync('C:/projectes/Amazon_pet/load-tests/results/post-hardening-soak/reconciliation.json', JSON.stringify(report, null, 2));
console.log('Wrote reconciliation.json');
