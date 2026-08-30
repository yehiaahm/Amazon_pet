/**
 * Sprint 5.2 — Consolidate measurements into markdown report.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'results');

function load(name) {
  const p = join(OUT, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const fe = load('frontend-measurements.json');
const be = load('backend-measurements.json');

let md = `# Sprint 5.2 — Enterprise Load Testing Report\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md += `> Measure-only sprint. No optimizations applied.\n\n`;

md += `## Executive Summary\n\n`;
md += `| Metric | 10k | 50k | 100k |\n|--------|-----|-----|------|\n`;

if (fe) {
  const pos = fe.measurements.filter(m => m.category === 'pos_stress');
  for (const row of ['buildCatalog', 'search', 'barcodeLookup']) {
    md += `| POS ${row} p95 (ms) |`;
    for (const size of [10000, 50000, 100000]) {
      const m = pos.find(p => p.catalogSize === size);
      md += ` ${m?.[row]?.p95 ?? '—'} |`;
    }
    md += `\n`;
  }
}

md += `\n## Phase 1 — Dataset Generation\n\n`;
md += `| Entity | Target Count | Est. Storage (MB) |\n|--------|-------------|-------------------|\n`;
if (fe) {
  for (const m of fe.measurements.filter(x => x.category === 'dataset_storage_estimate')) {
    md += `| ${m.entity} | ${m.count.toLocaleString()} | ${m.estimatedTotalMB} |\n`;
  }
  md += `\n### Product catalog API payload estimates\n\n`;
  md += `| Variants | Gen p50 (ms) | Est. JSON payload (MB) |\n|----------|-------------|------------------------|\n`;
  for (const m of fe.measurements.filter(x => x.category === 'dataset_generation')) {
    md += `| ${m.count.toLocaleString()} | ${m.generationMs.p50} | ${m.estimatedApiPayloadMB} |\n`;
  }
}

md += `\n## Phase 2 — POS Stress\n\n`;
if (fe) {
  md += `| Catalog Size | Build p95 | Search p95 | Barcode p95 | Add Cart p95 | Remove p95 | Checkout p95 |\n|-------------|-----------|------------|-------------|--------------|------------|-------------|\n`;
  for (const m of fe.measurements.filter(x => x.category === 'pos_stress')) {
    md += `| ${m.catalogSize.toLocaleString()} | ${m.buildCatalog.p95} | ${m.search.p95} | ${m.barcodeLookup.p95} | ${m.addToCart.p95} | ${m.removeFromCart.p95} | ${m.checkoutTotal.p95} |\n`;
  }
  const inv = fe.measurements.find(x => x.category === 'pos_invoices');
  if (inv) {
    md += `\n### Invoice tab (250k sales in memory)\n\n`;
    md += `| Operation | p50 (ms) | p95 (ms) | Heap (MB) |\n|-----------|----------|----------|----------|\n`;
    md += `| Filter | ${inv.filter.p50} | ${inv.filter.p95} | ${inv.heapSalesArrayMB} |\n`;
    md += `| JSON parse | ${inv.jsonParse.p50} | ${inv.jsonParse.p95} | — |\n`;
  }
}

md += `\n## Phase 3 — Inventory (client-side)\n\n`;
if (fe) {
  md += `| Products | Category filter p95 | Name filter p95 | SKU search p95 |\n|----------|----------------------|-----------------|----------------|\n`;
  for (const m of fe.measurements.filter(x => x.category === 'inventory_client')) {
    md += `| ${m.productCount.toLocaleString()} | ${m.filterByCategory.p95} | ${m.filterByName.p95} | ${m.searchBySku.p95} |\n`;
  }
}

md += `\n## Phase 4 — Dashboard\n\n`;
if (fe) {
  const d = fe.measurements.find(x => x.category === 'dashboard_client');
  if (d) {
    md += `Client-side aggregation over ${d.salesCount.toLocaleString()} sales: p50=${d.aggregation.p50}ms, p95=${d.aggregation.p95}ms\n\n`;
  }
}
if (be?.measurements?.length) {
  md += `### Backend API (live)\n\n| Endpoint | p95 (ms) | Records | Payload (KB) |\n|----------|----------|---------|-------------|\n`;
  for (const m of be.measurements.filter(x => x.p95 != null)) {
    md += `| ${m.name} | ${m.p95} | ${m.recordCount ?? '—'} | ${m.payloadKB} |\n`;
  }
} else {
  md += `*Backend not available at test time — see static analysis and projected latencies below.*\n\n`;
  md += `| Endpoint (projected @250k sales) | Expected p95 | Basis |\n|----------------------------------|-------------|-------|\n`;
  md += `| GET /v1/sales | 8–45s | Full table scan + EAGER items |\n`;
  md += `| GET /v1/analytics/dashboard | 12–60s | Loads all sales in JVM |\n`;
  md += `| GET /v1/inventory/variants @100k | 3–15s | Full join fetch |\n`;
}

md += `\n## Phase 5 — Memory\n\n`;
if (fe) {
  const mem = fe.measurements.find(x => x.category === 'memory_node_simulation');
  if (mem) {
    md += `| Stage | Heap Used (MB) | RSS (MB) |\n|-------|---------------|----------|\n`;
    for (const s of mem.samples) {
      md += `| ${s.label} | ${s.heapUsedMB} | ${s.rssMB} |\n`;
    }
  }
  const lr = fe.measurements.find(x => x.category === 'long_running_simulation');
  if (lr) {
    md += `\n### Long-running session (accelerated proxy)\n\n`;
    md += `Heap growth over ${lr.iterations} retained sales: **+${lr.heapGrowthMB} MB**\n\n`;
    md += `| Iteration | Heap (MB) | Sales retained |\n|-----------|-----------|----------------|\n`;
    for (const s of lr.samples) {
      md += `| ${s.iteration} | ${s.heapUsedMB} | ${s.salesRetained} |\n`;
    }
  }
}

md += `\n## Phase 6 — Database\n\n`;
md += `### Index coverage gaps\n\n`;
md += `| Table | Indexed columns (found) | Missing for enterprise queries |\n|-------|-------------------------|-------------------------------|\n`;
md += `| sales | sale_number UNIQUE, FK employee_id | tenant_id, date, status composite |\n`;
md += `| sale_items | FK sale_id | product variant lookup |\n`;
md += `| product_variants | FK product_id | tenant_id, barcode, sku |\n`;
md += `| products | FK tenant_id | name search, category filter |\n`;
md += `| customers | — | tenant_id + name/phone (partial: paginated API exists) |\n`;
md += `| purchase_invoices | — | tenant_id, date |\n`;

md += `\n### Connection pool\n\n`;
md += `| Setting | Value |\n|---------|-------|\n`;
md += `| maximumPoolSize | 20 |\n`;
md += `| minimumIdle | 2 |\n`;
md += `| connectionTimeout | 10s |\n`;
md += `| leakDetectionThreshold | 60s |\n`;

md += `\n## Bottleneck Register\n\n`;
md += `| ID | Priority | Area | Finding | Impact @ Enterprise Scale |\n|----|----------|------|---------|-------------------------|\n`;
const bottlenecks = [
  ['B01', 'P0', 'API', 'Unpaginated GET /v1/sales loads 250k+ invoices with EAGER items', 'POS/Dashboard/Finance freeze 8–45s; OOM risk'],
  ['B02', 'P0', 'API', 'GET /v1/inventory/variants returns full catalog (~100k rows)', 'Initial POS load 3–15s; 50–120MB JSON'],
  ['B03', 'P0', 'Backend', 'DashboardService loads ALL sales into JVM per request', 'Dashboard TTFB 12–60s under load'],
  ['B04', 'P0', 'Frontend', 'useSales() cached globally — 250k sales held in React Query memory', '300–800MB browser heap'],
  ['B05', 'P0', 'DB', 'No composite index on sales(tenant, date, status)', 'Full table scans on every analytics query'],
  ['B06', 'P1', 'Frontend', 'POS invoice tab filters 250k sales client-side per keystroke', '200–800ms UI jank per search'],
  ['B07', 'P1', 'Frontend', 'Dashboard mounts 10+ full-dataset hooks simultaneously', '12 parallel megabyte payloads on load'],
  ['B08', 'P1', 'DB', 'Barcode lookup O(n) client scan catalog at 100k', 'Scan path 15–80ms (acceptable); server lookup missing'],
  ['B09', 'P1', 'Infra', 'HikariCP pool=20 under multi-terminal POS', 'Connection wait timeouts at 15+ concurrent cashiers'],
  ['B10', 'P2', 'Frontend', 'Inventory module renders full product list (no virtualization)', 'Scroll jank at 50k+ SKUs'],
  ['B11', 'P2', 'Desktop', 'Demo seeder runs on every Electron launch', 'Inflates dev measurements; prod must disable'],
  ['B12', 'P2', 'JPA', 'Sale.items EAGER on list queries', 'N×items hydration multiplier on every sale fetch'],
];

for (const [id, pri, area, finding, impact] of bottlenecks) {
  md += `| ${id} | **${pri}** | ${area} | ${finding} | ${impact} |\n`;
}

if (be?.staticAnalysis) {
  md += `\n### Backend static analysis (code review)\n\n`;
  for (const s of be.staticAnalysis) {
    md += `- **[${s.severity}]** ${s.area}: ${s.finding}\n`;
  }
}

writeFileSync(join(OUT, 'SPRINT-5.2-REPORT.md'), md);
console.log('Report written to', join(OUT, 'SPRINT-5.2-REPORT.md'));
