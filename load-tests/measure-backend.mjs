/**
 * Sprint 5.2 — Backend API measurement harness.
 * Requires running backend at BASE_URL with valid JWT.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'results');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.LOAD_TEST_BASE_URL || 'http://localhost:8080';
const USER = process.env.LOAD_TEST_USER || 'owner_marwan';
const PASS = process.env.LOAD_TEST_PASS || '1234';

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const body = await res.json();
  return body.data?.token || body.token;
}

async function timedFetch(path, token, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const elapsed = performance.now() - t0;
  const text = await res.text();
  let size = text.length;
  let count = null;
  try {
    const json = JSON.parse(text);
    const data = json.data ?? json;
    if (Array.isArray(data)) count = data.length;
  } catch { /* ignore */ }
  return { status: res.status, ms: elapsed, sizeBytes: size, count };
}

async function benchEndpoint(name, path, token, iterations = 10) {
  const times = [];
  let last = null;
  for (let i = 0; i < iterations; i++) {
    last = await timedFetch(path, token);
    if (last.status >= 400) {
      return { name, path, error: `HTTP ${last.status}`, last };
    }
    times.push(last.ms);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    path,
    iterations,
    p50: +percentile(times, 50).toFixed(0),
    p95: +percentile(times, 95).toFixed(0),
    p99: +percentile(times, 99).toFixed(0),
    payloadKB: last ? +(last.sizeBytes / 1024).toFixed(1) : 0,
    recordCount: last?.count,
  };
}

const results = {
  phase: 'backend',
  timestamp: new Date().toISOString(),
  baseUrl: BASE,
  available: false,
  measurements: [],
  staticAnalysis: [],
};

async function main() {
  try {
    const health = await fetch(`${BASE}/actuator/health`);
    if (!health.ok) throw new Error('health check failed');
    results.available = true;
  } catch (e) {
    results.error = `Backend unavailable at ${BASE}: ${e.message}`;
    results.staticAnalysis = getStaticAnalysis();
    writeFileSync(join(OUT, 'backend-measurements.json'), JSON.stringify(results, null, 2));
    console.log('Backend unavailable — static analysis only.');
    return;
  }

  let token;
  try {
    token = await login();
  } catch (e) {
    results.error = `Auth failed: ${e.message}`;
    results.staticAnalysis = getStaticAnalysis();
    writeFileSync(join(OUT, 'backend-measurements.json'), JSON.stringify(results, null, 2));
    return;
  }

  const endpoints = [
    { name: 'variants_list', path: '/api/v1/inventory/variants' },
    { name: 'products_list', path: '/api/v1/products' },
    { name: 'sales_list', path: '/api/v1/sales' },
    { name: 'customers_list', path: '/api/v1/customers' },
    { name: 'pets_list', path: '/api/v1/pets' },
    { name: 'dashboard_metrics', path: '/api/v1/analytics/dashboard' },
    { name: 'kpi_metrics', path: '/api/v1/analytics/kpis' },
    { name: 'batches_list', path: '/api/v1/inventory/batches' },
    { name: 'purchase_invoices', path: '/api/v1/purchase-invoices' },
    { name: 'suppliers_list', path: '/api/v1/suppliers' },
    { name: 'employees_list', path: '/api/v1/employees' },
    { name: 'fifo_valuation', path: '/api/v1/inventory/fifo/valuation' },
  ];

  for (const ep of endpoints) {
    const m = await benchEndpoint(ep.name, ep.path, token, 8);
    results.measurements.push(m);
    console.log(`${ep.name}: p95=${m.p95 ?? 'ERR'}ms records=${m.recordCount ?? 'n/a'} payload=${m.payloadKB ?? 0}KB`);
  }

  // POS write path sample
  const sessionOpen = await timedFetch('/api/v1/pos-sessions/open', token, {
    method: 'POST',
    body: JSON.stringify({ openingBalance: 100, branchId: 'b-1' }),
  });
  results.measurements.push({
    name: 'pos_session_open',
    ...sessionOpen,
    ms: +sessionOpen.ms.toFixed(0),
  });

  results.staticAnalysis = getStaticAnalysis();
  writeFileSync(join(OUT, 'backend-measurements.json'), JSON.stringify(results, null, 2));
}

function getStaticAnalysis() {
  return [
    {
      area: 'database_indexes',
      finding: 'sales table lacks tenant_id index; queries join through employees',
      severity: 'P0',
    },
    {
      area: 'database_indexes',
      finding: 'product_variants, products, customers (list) lack dedicated tenant+search indexes beyond FKs',
      severity: 'P1',
    },
    {
      area: 'api_design',
      finding: 'GET /v1/sales returns full tenant history with EAGER sale items — no pagination',
      severity: 'P0',
    },
    {
      area: 'api_design',
      finding: 'GET /v1/inventory/variants loads all variants + product join per tenant',
      severity: 'P0',
    },
    {
      area: 'api_design',
      finding: 'DashboardService.buildDashboardMetrics loads ALL sales, expenses, purchases in memory',
      severity: 'P0',
    },
    {
      area: 'connection_pool',
      finding: 'HikariCP maxPoolSize=20, minIdle=2 — may exhaust under concurrent POS + dashboard',
      severity: 'P1',
    },
    {
      area: 'jpa',
      finding: 'Sale.items FetchType.EAGER amplifies payload and query cost for list endpoints',
      severity: 'P0',
    },
  ];
}

main().catch(e => {
  results.error = e.message;
  results.staticAnalysis = getStaticAnalysis();
  writeFileSync(join(OUT, 'backend-measurements.json'), JSON.stringify(results, null, 2));
  console.error(e);
});
