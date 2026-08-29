// Post-hardening 4-hour soak test. Extends soak.mjs's approach (same lib/client.mjs,
// lib/journeys.mjs, fixture.json) with:
//   - Actuator-first monitoring (JVM heap/GC/threads/Hikari) instead of fragile OS process polling
//   - Whole-machine resource monitoring (total system RAM, CPU%, disk I/O) — this is a desktop
//     app where the backend, DB, and (normally) the Electron shell all share one customer machine,
//     so machine-level headroom matters as much as JVM-internal numbers.
//   - Periodic concurrency/integrity probes interleaved with the sustained mixed-traffic load
//     (idempotency replay, stock-contention oversell, duplicate-phone customer race, concurrent
//     partial returns against a fixed batch, loyalty over-redemption) — not just a one-shot pass.
//   - Incremental, unbounded error-by-type aggregation (first-seen timestamp, running count,
//     first-half vs second-half trend) so errors.json is accurate even though the raw sample
//     buffer is capped for the harness's own memory safety.
//   - CSV outputs (metrics.csv, latency.csv) alongside the JSONL time series.
//   - Crash detection: consecutive actuator-health failures are logged as CRASH events with
//     last-good state, not silently treated as "test complete".
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { login, apiCall, summarize, uuid, randInt, BASE } from './lib/client.mjs';
import { mixedJourney } from './lib/journeys.mjs';

const execFileP = promisify(execFile);

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));
const RESULTS_DIR = new URL(`./results/${process.env.SOAK_RESULTS_SUBDIR || 'post-hardening-soak'}/`, import.meta.url);
mkdirSync(RESULTS_DIR, { recursive: true });

const CONCURRENCY = Number(process.env.SOAK_CONCURRENCY || 12);
const DURATION_MIN = Number(process.env.SOAK_DURATION_MIN || 240);
const SNAPSHOT_INTERVAL_SEC = 45;
const PROBE_INTERVAL_MIN = Number(process.env.SOAK_PROBE_INTERVAL_MIN || 20); // periodic integrity/concurrency probes, throughout the run

const timeSeriesPath = new URL('soak-timeseries.jsonl', RESULTS_DIR);
const metricsCsvPath = new URL('metrics.csv', RESULTS_DIR);
const latencyCsvPath = new URL('latency.csv', RESULTS_DIR);
const probesPath = new URL('integrity-probes.jsonl', RESULTS_DIR);
const crashEventsPath = new URL('crash-events.jsonl', RESULTS_DIR);
const summaryPath = new URL('summary.json', RESULTS_DIR);
const errorsPath = new URL('errors.json', RESULTS_DIR);

const owner = fixture.cashiers.find(c => c.role === 'OWNER') || fixture.cashiers[0];
const ownerToken = await login(owner.username, owner.password);

const metricsCsvHeader = [
  'tick', 'elapsedMin', 'timestamp',
  'journeysCompleted', 'journeysFailed', 'recentRequestCount', 'recentErrorRate',
  'recentP50', 'recentP90', 'recentP95', 'recentP99',
  'springRssMB', 'jvmHeapUsedMB', 'jvmHeapCommittedMB', 'jvmHeapMaxMB', 'jvmOldGenUsedMB',
  'threadsLive', 'processCpuUsagePct', 'gcPauseCount', 'gcPauseSumMs',
  'hikariActive', 'hikariIdle', 'hikariPending', 'hikariMax',
  'sysRamUsedMB', 'sysRamTotalMB', 'sysRamAvailMB', 'sysRamUsedPct',
  'sysCpuPct', 'diskBytesPerSec', 'appReachable',
].join(',');
writeFileSync(metricsCsvPath, metricsCsvHeader + '\n');
writeFileSync(latencyCsvPath, 'tick,elapsedMin,timestamp,endpoint_scope,p50,p90,p95,p99,max,count,errorRate\n');

function csvRow(vals) { return vals.map(v => (v === null || v === undefined) ? '' : v).join(','); }

// ---- Spring Boot process resolution (identify the ACTUAL app JVM, not the mvn launcher) ----
// IMPORTANT: derived from the actual target port (LOAD_TEST_BASE_URL / client.mjs's BASE), not
// hardcoded to 8080 — this machine runs other unrelated Spring Boot apps that can occupy 8080
// (confirmed live: after this backend crashed once, a different app grabbed 8080 within seconds).
// Hardcoding 8080 here would have silently tracked a completely unrelated process's memory for
// the rest of a multi-hour run without any error.
const TARGET_PORT = Number(new URL(BASE).port || (new URL(BASE).protocol === 'https:' ? 443 : 80));
async function resolveSpringPid() {
  try {
    const { stdout } = await execFileP('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -LocalPort ${TARGET_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`]);
    const pid = parseInt(stdout.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}
let springPid = await resolveSpringPid();
console.log(`[soak] resolved Spring Boot PID listening on ${TARGET_PORT}: ${springPid}`);

// ---- Combined whole-machine + process sample (one PowerShell spawn per tick) ----
// NOTE: Get-Counter (PDH-based) was tried first and reliably HUNG on this machine — it left
// orphaned powershell.exe processes accumulating every tick and stalled the snapshot loop
// indefinitely (discovered during the pre-flight smoke test, before the real 4h run started).
// Get-CimInstance Win32_PerfFormattedData_* classes give the same numbers through WMI instead
// of PDH and were verified stable across repeated calls (~1.1s warm, ~9s only on the very first
// cold call), so those are used instead. A hard child-process timeout remains as a safety net.
async function getSystemStats(pid) {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
$disk = (Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'").DiskBytesPersec
$proc = $null
if (${pid ? pid : '$null'}) { $proc = Get-Process -Id ${pid || 0} -ErrorAction SilentlyContinue }
[PSCustomObject]@{
  totalRamKB = $os.TotalVisibleMemorySize
  freeRamKB = $os.FreePhysicalMemory
  cpuPct = $cpu
  diskBytesPerSec = $disk
  springRssBytes = if ($proc) { $proc.WorkingSet64 } else { $null }
  springAlive = [bool]$proc
} | ConvertTo-Json -Compress
`;
  try {
    const { stdout } = await execFileP('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20000, killSignal: 'SIGKILL' });
    return JSON.parse(stdout.trim());
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getActuatorMetrics() {
  const r = await apiCall('GET', '/api/actuator/prometheus', { token: ownerToken, timeoutMs: 8000 });
  if (!r.ok || !r.text) return null;
  const text = r.text;
  const grab = (metric, labelFilter) => {
    const re = labelFilter
      ? new RegExp(`${metric}\\{[^}]*${labelFilter}[^}]*\\}\\s+([0-9.eE+-]+)`)
      : new RegExp(`${metric}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`);
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const sumAll = (metric, areaFilter) => {
    const re = new RegExp(`${metric}\\{[^}]*${areaFilter}[^}]*\\}\\s+([0-9.eE+-]+)`, 'g');
    const matches = [...text.matchAll(re)];
    const vals = matches.map(m => Number(m[1])).filter(v => v >= 0); // -1 = "no max" sentinel
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  const gcCount = grab('jvm_gc_pause_seconds_count');
  const gcSum = grab('jvm_gc_pause_seconds_sum');
  return {
    hikariActive: grab('hikaricp_connections_active'),
    hikariIdle: grab('hikaricp_connections_idle'),
    hikariPending: grab('hikaricp_connections_pending'),
    hikariMax: grab('hikaricp_connections_max'),
    jvmHeapUsedMB: (() => { const v = sumAll('jvm_memory_used_bytes', 'area="heap"'); return v ? v / 1024 / 1024 : null; })(),
    jvmHeapCommittedMB: (() => { const v = sumAll('jvm_memory_committed_bytes', 'area="heap"'); return v ? v / 1024 / 1024 : null; })(),
    jvmHeapMaxMB: (() => { const v = sumAll('jvm_memory_max_bytes', 'area="heap"'); return v ? v / 1024 / 1024 : null; })(),
    jvmOldGenUsedMB: (() => { const v = grab('jvm_memory_used_bytes', 'id="G1 Old Gen"'); return v !== null ? v / 1024 / 1024 : null; })(),
    threadsLive: grab('jvm_threads_live_threads'),
    processCpuUsagePct: (() => { const v = grab('process_cpu_usage'); return v !== null ? v * 100 : null; })(),
    gcPauseCount: gcCount,
    gcPauseSumMs: gcSum !== null ? gcSum * 1000 : null,
  };
}

let stop = false;
process.on('SIGTERM', () => { stop = true; });
process.on('SIGINT', () => { stop = true; });
process.on('uncaughtException', (e) => console.error('[soak] uncaughtException (continuing):', e && e.stack ? e.stack : e));
process.on('unhandledRejection', (e) => console.error('[soak] unhandledRejection (continuing):', e && e.stack ? e.stack : e));

const startedAt = Date.now();
const endAt = startedAt + DURATION_MIN * 60 * 1000;
const allSamples = [];
let journeysCompleted = 0, journeysFailed = 0;

// ---- Incremental, unbounded error aggregation (survives the sample-buffer cap) ----
const errorAgg = new Map(); // key -> { count, firstSeen, lastSeen, firstHalfCount, secondHalfCount, sampleMsgs: [] }
let totalSamplesSeen = 0, totalSuccessSeen = 0;
function recordSample(s) {
  totalSamplesSeen++;
  if (s.ok) { totalSuccessSeen++; return; }
  const key = s.status === 0 ? `ERR:${s.error || 'unknown'}` : String(s.status);
  const now = Date.now();
  const half = now < startedAt + (DURATION_MIN * 60000) / 2 ? 'first' : 'second';
  let e = errorAgg.get(key);
  if (!e) {
    e = { count: 0, firstSeenTs: new Date(now).toISOString(), lastSeenTs: null, firstHalfCount: 0, secondHalfCount: 0, endpointCounts: {} };
    errorAgg.set(key, e);
  }
  e.count++;
  e.lastSeenTs = new Date(now).toISOString();
  if (half === 'first') e.firstHalfCount++; else e.secondHalfCount++;
  if (s.name) e.endpointCounts[s.name] = (e.endpointCounts[s.name] || 0) + 1;
}

const tokenCache = new Map();
async function getToken(cred) {
  if (tokenCache.has(cred.username)) return tokenCache.get(cred.username);
  const t = await login(cred.username, cred.password);
  tokenCache.set(cred.username, t);
  return t;
}

async function worker(idx) {
  const cred = fixture.cashiers[idx % fixture.cashiers.length];
  let token;
  try { token = await getToken(cred); } catch (e) { console.error(`[soak] worker ${idx} login failed:`, e.message); return; }
  while (Date.now() < endAt && !stop) {
    const local = [];
    try {
      await mixedJourney(token, fixture, local, cred);
      journeysCompleted++;
    } catch (e) {
      journeysFailed++;
      local.push({ name: 'journey_exception', ok: false, status: 0, ms: 0, error: String(e.message || e) });
    }
    for (const s of local) { allSamples.push(s); recordSample(s); }
    if (allSamples.length > 50000) allSamples.splice(0, allSamples.length - 20000);
  }
}

// ---- Periodic integrity / concurrency probes ----
async function makeStockedProduct(qty) {
  const sku = 'PH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const create = await apiCall('POST', '/api/v1/products', {
    token: ownerToken, body: { product: { name: 'Probe ' + sku, sku, categoryName: 'Food' }, variant: { name: 'Std', price: 50, cost: 30, initialStock: 0 } },
  });
  if (!create.ok) return null;
  const variantId = create.json?.data?.variantId;
  await apiCall('POST', '/api/v1/inventory/adjust', {
    token: ownerToken, body: { variantId, warehouseId: fixture.warehouseId, diff: qty, type: 'PURCHASE', employeeId: fixture.employeeId },
  });
  return { variantId, sku };
}

// Exact-sku lookup (InventoryController's ?sku= param), not the free-text ?search= param which
// matches name/sku substrings and unreliably misses a variant looked up by raw UUID — that
// mismatch was confirmed live (probes always reported finalStock=undefined against ?search=<uuid>
// even though the sale itself succeeded/failed correctly) and matches the pre-fix baseline's own
// concurrency-tests.json ("STOCK_MATCHES_EXPECTED": false) — a load-generator artifact, not an
// app bug. Querying by exact sku instead makes the probe's own stock assertion trustworthy.
async function getStockBySku(sku) {
  const check = await apiCall('GET', `/api/v1/inventory/variants?sku=${encodeURIComponent(sku)}`, { token: ownerToken });
  return check.json?.data?.content?.[0]?.stockQuantity;
}

async function probeIdempotency() {
  const product = await makeStockedProduct(100);
  if (!product) return { name: 'idempotency', ok: false, error: 'setup_failed' };
  const key = uuid();
  const body = { posSessionId: fixture.posSessionId, totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH', items: [{ itemId: product.variantId, quantity: 1, price: 50, cost: 30 }], delivery: false };
  const results = await Promise.all(Array.from({ length: 6 }, () => apiCall('POST', '/api/v1/sales', { token: ownerToken, headers: { 'Idempotency-Key': key }, body })));
  const saleIds = new Set(results.filter(r => r.ok).map(r => r.json?.data?.id).filter(Boolean));
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  const nonCleanLoserErrors = results.filter(r => !r.ok && r.status !== 400 && r.status !== 409);
  const finalStock = await getStockBySku(product.sku);
  return {
    // Correctness invariant (no duplicate sale / no double stock deduction) is the pass/fail bar.
    // Whether losing concurrent replays get a clean 4xx vs a raw 500 is tracked separately in
    // rawServerErrorOnLosingReplay — worth reporting, but not itself a duplicate-sale/stock bug.
    name: 'idempotency', ok: saleIds.size <= 1 && finalStock === 99,
    distinctSaleIdsCreated: saleIds.size, statusCounts, initialStock: 100, finalStock, expectedFinalStock: 99,
    rawServerErrorOnLosingReplay: nonCleanLoserErrors.length > 0, rawServerErrorCount: nonCleanLoserErrors.length,
  };
}

async function probeStockContention() {
  const STOCK = 20, BUYERS = 30;
  const product = await makeStockedProduct(STOCK);
  if (!product) return { name: 'stock_contention', ok: false, error: 'setup_failed' };
  const results = await Promise.all(Array.from({ length: BUYERS }, () =>
    apiCall('POST', '/api/v1/sales', { token: ownerToken, headers: { 'Idempotency-Key': uuid() }, body: { posSessionId: fixture.posSessionId, totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH', items: [{ itemId: product.variantId, quantity: 1, price: 50, cost: 30 }], delivery: false } })
  ));
  const succeeded = results.filter(r => r.ok).length;
  const finalStock = await getStockBySku(product.sku);
  const nonBusinessErrors = results.filter(r => !r.ok && r.status !== 400 && r.status !== 409 && !(r.json?.message || '').includes('مخزون'));
  return {
    name: 'stock_contention', ok: succeeded <= STOCK && finalStock >= 0 && finalStock === (STOCK - succeeded) && nonBusinessErrors.length === 0,
    initialStock: STOCK, buyers: BUYERS, succeeded, finalStock, oversold: succeeded > STOCK, negativeStock: finalStock < 0,
    unexpectedErrorCount: nonBusinessErrors.length, unexpectedErrorSamples: nonBusinessErrors.slice(0, 3).map(r => ({ status: r.status, msg: r.json?.message || r.error })),
  };
}

async function probeDuplicateCustomer() {
  const phone = '0197' + Math.floor(Math.random() * 10000000);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => apiCall('POST', '/api/v1/customers', { token: ownerToken, body: { name: 'Probe Cust ' + i, phone, discount: 0 } })));
  const succeeded = results.filter(r => r.ok);
  const badFailures = results.filter(r => !r.ok && r.status !== 400 && r.status !== 409 && r.status !== 500);
  const raw500s = results.filter(r => r.status === 500);
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  return {
    name: 'duplicate_customer', ok: succeeded.length === 1,
    concurrent: 10, succeededCount: succeeded.length, duplicatesCreated: succeeded.length > 1, statusCounts,
    raw500Count: raw500s.length, // hardening claims clean 409s now — flag if raw 500s still appear
  };
}

async function probeConcurrentReturns() {
  const sku = 'PHR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const today = new Date().toISOString().slice(0, 10);
  const invBody = {
    invoiceNumber: 'PH-INV-' + Date.now(), invoiceDate: today, supplierName: 'Probe Supplier', currency: 'EGP',
    netTotal: 400, grandTotal: 400, paymentType: 'LUMP_SUM', paymentStatus: 'UNPAID',
    items: [{ productName: 'Return Probe ' + sku, sku, cost: 40, price: 100, quantity: 10 }],
  };
  const create = await apiCall('POST', '/api/v1/purchase-invoices', { token: ownerToken, body: invBody });
  if (!create.ok || !create.json?.data?.items?.length) return { name: 'concurrent_returns', ok: false, error: 'setup_failed', createStatus: create.status, msg: create.json?.message };
  const invoiceId = create.json.data.id;
  const itemId = create.json.data.items[0].id;
  const results = await Promise.all(Array.from({ length: 2 }, () =>
    apiCall('POST', `/api/v1/purchase-invoices/${invoiceId}/return`, { token: ownerToken, body: { lines: [{ purchaseInvoiceItemId: itemId, quantity: 7 }], reason: 'soak probe' } })
  ));
  const succeeded = results.filter(r => r.ok).length;
  const rejectedClean = results.filter(r => !r.ok && (r.status === 400 || r.status === 409)).length;
  const otherFailures = results.filter(r => !r.ok && r.status !== 400 && r.status !== 409);
  const check = await apiCall('GET', `/api/v1/purchase-invoices/${invoiceId}`, { token: ownerToken });
  const returnedQty = check.json?.data?.items?.[0]?.quantityReturned;
  return {
    name: 'concurrent_returns', ok: succeeded === 1 && returnedQty <= 10 && otherFailures.length === 0,
    batchQty: 10, requestedEach: 7, succeeded, rejectedClean, otherFailureCount: otherFailures.length,
    otherFailureSamples: otherFailures.slice(0, 2).map(r => ({ status: r.status, msg: r.json?.message || r.error })),
    finalQuantityReturned: returnedQty, exceededBatch: returnedQty > 10,
  };
}

async function probeLoyaltyRedemption() {
  const phone = '0196' + Math.floor(Math.random() * 10000000);
  const custRes = await apiCall('POST', '/api/v1/customers', { token: ownerToken, body: { name: 'Probe Loyalty', phone, discount: 0 } });
  const customerId = custRes.json?.data?.id;
  if (!customerId) return { name: 'loyalty_redemption', ok: false, error: 'setup_failed' };
  const product = await makeStockedProduct(50);
  if (!product) return { name: 'loyalty_redemption', ok: false, error: 'setup_failed' };
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    apiCall('POST', '/api/v1/sales', { token: ownerToken, headers: { 'Idempotency-Key': uuid() }, body: { posSessionId: fixture.posSessionId, customerId, totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH', items: [{ itemId: product.variantId, quantity: 1, price: 50, cost: 30 }], delivery: false, loyaltyRedeem: 1000 } })
  ));
  const custCheck = await apiCall('GET', `/api/v1/customers/${customerId}`, { token: ownerToken });
  const finalBalance = custCheck.json?.data?.loyaltyBalance ?? custCheck.json?.data?.loyaltyPoints;
  return {
    name: 'loyalty_redemption', ok: finalBalance === undefined || finalBalance === null || finalBalance >= 0,
    concurrent: 6, succeeded: results.filter(r => r.ok).length, finalBalance, wentNegative: typeof finalBalance === 'number' && finalBalance < 0,
  };
}

async function probeCycle() {
  const ts = new Date().toISOString();
  const elapsedMin = +((Date.now() - startedAt) / 60000).toFixed(1);
  const probes = { idempotency: null, stockContention: null, duplicateCustomer: null, concurrentReturns: null, loyaltyRedemption: null };
  try { probes.idempotency = await probeIdempotency(); } catch (e) { probes.idempotency = { name: 'idempotency', ok: false, error: String(e.message || e) }; }
  try { probes.stockContention = await probeStockContention(); } catch (e) { probes.stockContention = { name: 'stock_contention', ok: false, error: String(e.message || e) }; }
  try { probes.duplicateCustomer = await probeDuplicateCustomer(); } catch (e) { probes.duplicateCustomer = { name: 'duplicate_customer', ok: false, error: String(e.message || e) }; }
  try { probes.concurrentReturns = await probeConcurrentReturns(); } catch (e) { probes.concurrentReturns = { name: 'concurrent_returns', ok: false, error: String(e.message || e) }; }
  try { probes.loyaltyRedemption = await probeLoyaltyRedemption(); } catch (e) { probes.loyaltyRedemption = { name: 'loyalty_redemption', ok: false, error: String(e.message || e) }; }
  const record = { elapsedMin, timestamp: ts, probes };
  appendFileSync(probesPath, JSON.stringify(record) + '\n');
  console.log(`[probe t=${elapsedMin}min]`, JSON.stringify({
    idempotency: probes.idempotency.ok, stock: probes.stockContention.ok, dupCustomer: probes.duplicateCustomer.ok,
    returns: probes.concurrentReturns.ok, loyalty: probes.loyaltyRedemption.ok,
  }));
}

async function probeLoop() {
  while (Date.now() < endAt && !stop) {
    await new Promise(r => setTimeout(r, PROBE_INTERVAL_MIN * 60 * 1000));
    if (Date.now() >= endAt || stop) break;
    try { await probeCycle(); } catch (e) { console.error('[soak] probeCycle failed (continuing):', e && e.stack ? e.stack : e); }
  }
}

// ---- Crash detection ----
let consecutiveHealthFailures = 0;
let crashLogged = false;
let lastSuccessfulRequestTs = new Date().toISOString();

async function snapshotLoop() {
  let tick = 0;
  while (Date.now() < endAt && !stop) {
    await new Promise(r => setTimeout(r, SNAPSHOT_INTERVAL_SEC * 1000));
    tick++;
    try {
      const elapsedMin = +((Date.now() - startedAt) / 60000).toFixed(1);
      const recentSamples = allSamples.slice(-2000);
      const recentSummary = summarize(recentSamples);
      if (recentSamples.some(s => s.ok)) lastSuccessfulRequestTs = new Date().toISOString();

      const health = await apiCall('GET', '/api/actuator/health', { token: ownerToken, timeoutMs: 8000 });
      const appReachable = health.ok;
      if (!appReachable) {
        consecutiveHealthFailures++;
      } else {
        consecutiveHealthFailures = 0;
      }
      if (consecutiveHealthFailures >= 3 && !crashLogged) {
        crashLogged = true;
        const crashEvent = {
          type: 'CRASH_DETECTED', timestamp: new Date().toISOString(), elapsedMin,
          lastSuccessfulRequestTs, consecutiveHealthFailures,
        };
        appendFileSync(crashEventsPath, JSON.stringify(crashEvent) + '\n');
        console.error('[soak] *** CRASH DETECTED ***', JSON.stringify(crashEvent));
      } else if (consecutiveHealthFailures === 0 && crashLogged) {
        // recovered
        appendFileSync(crashEventsPath, JSON.stringify({ type: 'RECOVERED', timestamp: new Date().toISOString(), elapsedMin }) + '\n');
        console.log('[soak] app recovered after crash at', elapsedMin, 'min');
        crashLogged = false;
      }

      if (!springPid || consecutiveHealthFailures > 0) {
        const rePid = await resolveSpringPid();
        if (rePid) springPid = rePid;
      }

      const [sys, actuator] = await Promise.all([
        getSystemStats(springPid).catch(e => ({ error: String(e.message || e) })),
        getActuatorMetrics().catch(e => ({ error: String(e.message || e) })),
      ]);

      const springRssMB = sys?.springRssBytes ? +(sys.springRssBytes / 1024 / 1024).toFixed(1) : null;
      const sysTotalMB = sys?.totalRamKB ? +(sys.totalRamKB / 1024).toFixed(1) : null;
      const sysFreeMB = sys?.freeRamKB ? +(sys.freeRamKB / 1024).toFixed(1) : null;
      const sysUsedMB = (sysTotalMB !== null && sysFreeMB !== null) ? +(sysTotalMB - sysFreeMB).toFixed(1) : null;
      const sysUsedPct = (sysTotalMB && sysUsedMB !== null) ? +((sysUsedMB / sysTotalMB) * 100).toFixed(1) : null;

      const snapshot = {
        tick, elapsedMin, timestamp: new Date().toISOString(),
        journeysCompleted, journeysFailed,
        recentRequestCount: recentSamples.length, recentErrorRate: recentSummary.errorRate,
        recentP50: recentSummary.p50, recentP90: recentSummary.p90, recentP95: recentSummary.p95, recentP99: recentSummary.p99,
        springRssMB,
        jvmHeapUsedMB: actuator?.jvmHeapUsedMB, jvmHeapCommittedMB: actuator?.jvmHeapCommittedMB, jvmHeapMaxMB: actuator?.jvmHeapMaxMB,
        jvmOldGenUsedMB: actuator?.jvmOldGenUsedMB, threadsLive: actuator?.threadsLive, processCpuUsagePct: actuator?.processCpuUsagePct,
        gcPauseCount: actuator?.gcPauseCount, gcPauseSumMs: actuator?.gcPauseSumMs,
        hikariActive: actuator?.hikariActive, hikariIdle: actuator?.hikariIdle, hikariPending: actuator?.hikariPending, hikariMax: actuator?.hikariMax,
        sysRamUsedMB: sysUsedMB, sysRamTotalMB: sysTotalMB, sysRamAvailMB: sysFreeMB, sysRamUsedPct: sysUsedPct,
        sysCpuPct: sys?.cpuPct !== undefined ? +Number(sys.cpuPct).toFixed(1) : null,
        diskBytesPerSec: sys?.diskBytesPerSec !== undefined ? Math.round(sys.diskBytesPerSec) : null,
        appReachable,
      };
      appendFileSync(timeSeriesPath, JSON.stringify(snapshot) + '\n');
      appendFileSync(metricsCsvPath, csvRow(metricsCsvHeader.split(',').map(k => snapshot[k])) + '\n');
      appendFileSync(latencyCsvPath, csvRow([tick, elapsedMin, snapshot.timestamp, 'overall_recent', recentSummary.p50, recentSummary.p90, recentSummary.p95, recentSummary.p99, recentSummary.max, recentSummary.total, recentSummary.errorRate]) + '\n');

      console.log(`[soak t=${elapsedMin}min] journeys=${journeysCompleted} recentErr=${snapshot.recentErrorRate}% p95=${snapshot.recentP95}ms springRSS=${springRssMB}MB heap=${snapshot.jvmHeapUsedMB?.toFixed?.(1)}MB sysRAM=${sysUsedMB}/${sysTotalMB}MB(${sysUsedPct}%) cpu=${snapshot.sysCpuPct}% hikari(active=${snapshot.hikariActive},pending=${snapshot.hikariPending}) reachable=${appReachable}`);
    } catch (e) {
      console.error(`[soak] snapshot ${tick} failed (continuing):`, e && e.stack ? e.stack : e);
      try { appendFileSync(timeSeriesPath, JSON.stringify({ tick, snapshotError: String(e.message || e) }) + '\n'); } catch {}
    }
  }
}

console.log(`[soak] starting: concurrency=${CONCURRENCY}, duration=${DURATION_MIN}min, probeIntervalMin=${PROBE_INTERVAL_MIN}`);
const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
await Promise.all([snapshotLoop(), probeLoop(), ...workers]);

const wallMin = +((Date.now() - startedAt) / 60000).toFixed(1);

// Write errors.json from the incremental aggregation (accurate over the full run, not sample-capped)
const errorsReport = {
  generatedAt: new Date().toISOString(),
  totalSamples: totalSamplesSeen, totalSuccess: totalSuccessSeen, totalFailed: totalSamplesSeen - totalSuccessSeen,
  overallErrorRatePct: totalSamplesSeen ? +(((totalSamplesSeen - totalSuccessSeen) / totalSamplesSeen) * 100).toFixed(3) : 0,
  byType: [...errorAgg.entries()].map(([key, v]) => ({
    errorType: key, count: v.count, firstSeenTs: v.firstSeenTs, lastSeenTs: v.lastSeenTs,
    firstHalfCount: v.firstHalfCount, secondHalfCount: v.secondHalfCount,
    frequencyIncreasingOverTime: v.secondHalfCount > v.firstHalfCount * 1.3,
    topEndpoints: Object.entries(v.endpointCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    classification: (key === '400' || key === '409') ? 'EXPECTED (business-rule rejection, likely from concurrency probes)'
      : (key === '500' ? 'NEEDS_REVIEW (raw 500 — check if from probes or organic)' : 'NEEDS_REVIEW'),
  })).sort((a, b) => b.count - a.count),
};
writeFileSync(errorsPath, JSON.stringify(errorsReport, null, 2));

const finalSummary = {
  concurrency: CONCURRENCY, plannedDurationMin: DURATION_MIN, actualDurationMin: wallMin,
  journeysCompleted, journeysFailed,
  totalRequestsSeen: totalSamplesSeen, totalSuccessSeen, totalFailedSeen: totalSamplesSeen - totalSuccessSeen,
  overallErrorRatePct: errorsReport.overallErrorRatePct,
  overallRecentWindow: summarize(allSamples.slice(-50000)),
  crashDetected: crashLogged,
  finalSpringPid: springPid,
};
writeFileSync(summaryPath, JSON.stringify(finalSummary, null, 2));
console.log('\n=== SOAK COMPLETE ===', JSON.stringify(finalSummary, null, 2));
