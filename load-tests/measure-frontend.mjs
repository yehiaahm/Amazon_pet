/**
 * Sprint 5.2 — Frontend measurement harness (no app code changes).
 * Simulates POS catalog, cart, invoice filter, dashboard aggregation at enterprise scale.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'results');
mkdirSync(OUT, { recursive: true });

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function bench(name, fn, iterations = 50) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    iterations,
    min: +times[0].toFixed(2),
    p50: +percentile(times, 50).toFixed(2),
    p95: +percentile(times, 95).toFixed(2),
    p99: +percentile(times, 99).toFixed(2),
    max: +times[times.length - 1].toFixed(2),
    mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
  };
}

function mockProduct(i) {
  return {
    id: `p-${i}`,
    sku: `SKU-${String(i).padStart(6, '0')}`,
    name: `Product ${i} Premium Pet Food`,
    categoryId: `c-${i % 50}`,
    brandId: `b-${i % 200}`,
    unitId: 'u-1',
    minStockLimit: 5,
  };
}

function mockVariant(i) {
  return {
    id: `v-${i}`,
    productId: `p-${i}`,
    name: 'Standard',
    price: 10 + (i % 100),
    cost: 5,
    stockQuantity: 20 + (i % 50),
    barcode: `890${String(i).padStart(10, '0')}`,
  };
}

function buildProductByIdMap(products) {
  const map = new Map();
  for (const p of products) map.set(p.id, p);
  return map;
}

function buildBaseCatalogItems(variants, productById) {
  const list = [];
  for (const v of variants) {
    const prod = productById.get(v.productId);
    if (!prod) continue;
    list.push({
      id: v.id,
      name: `${prod.name} (${v.name})`,
      price: v.price,
      cost: v.cost,
      type: 'PRODUCT',
      stock: v.stockQuantity,
      sku: prod.sku,
      barcode: v.barcode,
    });
  }
  return list;
}

function filterCatalogItems(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const result = [];
  for (const item of items) {
    if (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      (item.barcode && item.barcode.toLowerCase().includes(q))
    ) {
      result.push(item);
    }
  }
  return result;
}

function barcodeLookup(items, code) {
  for (const item of items) {
    if (item.barcode === code || item.sku === code) return item;
  }
  return null;
}

function mockSale(i) {
  const itemCount = 1 + (i % 5);
  const items = [];
  for (let j = 0; j < itemCount; j++) {
    items.push({
      type: 'PRODUCT',
      itemId: `v-${(i + j) % 100000}`,
      name: `Item ${j}`,
      quantity: 1 + (j % 3),
      price: 25.5,
      cost: 12,
    });
  }
  return {
    id: `sale-${i}`,
    saleNumber: `INV-${String(i).padStart(8, '0')}`,
    totalAmount: 50 + (i % 200),
    tax: 5,
    discount: 0,
    paymentMethod: i % 2 ? 'CASH' : 'CARD',
    status: 'COMPLETED',
    date: new Date(Date.now() - (i % 365) * 86400000).toISOString(),
    customerId: `cust-${i % 20000}`,
    items,
  };
}

function estimateJsonBytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

const PRODUCT_SCALES = [10_000, 50_000, 100_000];
const results = { phase: 'frontend', timestamp: new Date().toISOString(), measurements: [] };

console.log('=== Phase 1: Dataset generation (in-memory) ===');
for (const size of PRODUCT_SCALES) {
  const gen = bench(`generate-products-${size}`, () => {
    const products = new Array(size);
    const variants = new Array(size);
    for (let i = 0; i < size; i++) {
      products[i] = mockProduct(i);
      variants[i] = mockVariant(i);
    }
    return { products, variants };
  }, 5);
  const products = Array.from({ length: size }, (_, i) => mockProduct(i));
  const variants = Array.from({ length: size }, (_, i) => mockVariant(i));
  const payloadBytes = estimateJsonBytes({ products, variants });
  results.measurements.push({
    category: 'dataset_generation',
    entity: 'products+variants',
    count: size,
    generationMs: gen,
    estimatedApiPayloadMB: +(payloadBytes / 1024 / 1024).toFixed(2),
  });
  console.log(`  ${size} products: gen p50=${gen.p50}ms, payload≈${(payloadBytes / 1024 / 1024).toFixed(1)} MB`);
}

const customers = 20_000;
const pets = 40_000;
const employees = 500;
const suppliers = 5_000;
const salesCount = 250_000;
const purchaseInvoices = 150_000;

const entityEstimates = [
  { entity: 'customers', count: customers, bytesEach: 280 },
  { entity: 'pets', count: pets, bytesEach: 220 },
  { entity: 'employees', count: employees, bytesEach: 350 },
  { entity: 'suppliers', count: suppliers, bytesEach: 300 },
  { entity: 'sales', count: salesCount, bytesEach: 650 },
  { entity: 'purchase_invoices', count: purchaseInvoices, bytesEach: 800 },
];
for (const e of entityEstimates) {
  results.measurements.push({
    category: 'dataset_storage_estimate',
    ...e,
    estimatedTotalMB: +((e.count * e.bytesEach) / 1024 / 1024).toFixed(1),
  });
}

console.log('\n=== Phase 2: POS stress (client-side simulation) ===');
for (const size of PRODUCT_SCALES) {
  const products = Array.from({ length: size }, (_, i) => mockProduct(i));
  const variants = Array.from({ length: size }, (_, i) => mockVariant(i));
  const map = buildProductByIdMap(products);
  const catalog = buildBaseCatalogItems(variants, map);

  const buildMs = bench(`catalog-build-${size}`, () => buildBaseCatalogItems(variants, map), 20);
  const searchMs = bench(`catalog-search-${size}`, () => filterCatalogItems(catalog, 'Product 999'), 30);
  const barcodeMs = bench(`barcode-lookup-${size}`, () => barcodeLookup(catalog, `890${String(Math.floor(size / 2)).padStart(10, '0')}`), 100);
  const emptySearchMs = bench(`catalog-empty-search-${size}`, () => filterCatalogItems(catalog, ''), 20);

  // Cart simulation
  let cart = [];
  const addToCartMs = bench(`add-to-cart-${size}`, () => {
    const item = catalog[Math.floor(Math.random() * catalog.length)];
    const existing = cart.find(c => c.id === item.id);
    if (existing) existing.qty += 1;
    else cart.push({ id: item.id, qty: 1, price: item.price });
    if (cart.length > 50) cart = cart.slice(-30);
  }, 200);

  const removeMs = bench(`remove-from-cart`, () => {
    if (cart.length) cart.splice(Math.floor(Math.random() * cart.length), 1);
  }, 200);

  const checkoutMs = bench(`checkout-total`, () => {
    let total = 0;
    for (const c of cart) total += c.price * c.qty;
    return total;
  }, 200);

  results.measurements.push({
    category: 'pos_stress',
    catalogSize: size,
    buildCatalog: buildMs,
    search: searchMs,
    barcodeLookup: barcodeMs,
    emptySearch: emptySearchMs,
    addToCart: addToCartMs,
    removeFromCart: removeMs,
    checkoutTotal: checkoutMs,
    domNodesVirtualized: Math.ceil(15 / 3) * 6,
    domNodesWithoutVirtualization: size,
  });
  console.log(`  ${size}: build p95=${buildMs.p95}ms search p95=${searchMs.p95}ms barcode p95=${barcodeMs.p95}ms`);
}

console.log('\n=== Phase 2: Invoice tab filter (250k sales) ===');
const allSales = Array.from({ length: salesCount }, (_, i) => mockSale(i));
const invoiceFilterMs = bench('invoice-filter-250k', () => {
  const q = 'INV-00001234';
  return allSales.filter(s =>
    s.saleNumber?.includes(q) ||
    s.customerId?.includes(q) ||
    s.items?.some(it => it.name?.toLowerCase().includes('item'))
  );
}, 10);
const salesParseMs = bench('json-parse-250k-sales', () => JSON.parse(JSON.stringify(allSales)), 5);
results.measurements.push({
  category: 'pos_invoices',
  salesCount,
  filter: invoiceFilterMs,
  jsonParse: salesParseMs,
  heapSalesArrayMB: +(estimateJsonBytes(allSales) / 1024 / 1024).toFixed(1),
});
console.log(`  filter p95=${invoiceFilterMs.p95}ms parse p95=${salesParseMs.p95}ms`);

console.log('\n=== Phase 3: Inventory client simulation ===');
for (const size of [10_000, 50_000, 100_000]) {
  const products = Array.from({ length: size }, (_, i) => mockProduct(i));
  const filterCat = bench(`inv-filter-category-${size}`, () =>
    products.filter(p => p.categoryId === 'c-12'), 30);
  const filterBrand = bench(`inv-filter-brand-${size}`, () =>
    products.filter(p => p.name.toLowerCase().includes('premium')), 30);
  const searchSku = bench(`inv-search-sku-${size}`, () =>
    products.filter(p => p.sku.includes('000999')), 30);
  results.measurements.push({
    category: 'inventory_client',
    productCount: size,
    filterByCategory: filterCat,
    filterByName: filterBrand,
    searchBySku: searchSku,
  });
}

console.log('\n=== Phase 4: Dashboard client aggregation ===');
const dashSales = Array.from({ length: salesCount }, (_, i) => mockSale(i));
const dashMetrics = bench('dashboard-aggregate-250k', () => {
  const monthStart = new Date();
  monthStart.setDate(1);
  let revenue = 0;
  let count = 0;
  const byProduct = new Map();
  for (const s of dashSales) {
    if (s.status !== 'COMPLETED') continue;
    const d = new Date(s.date);
    if (d < monthStart) continue;
    revenue += s.totalAmount;
    count++;
    for (const it of s.items || []) {
      byProduct.set(it.itemId, (byProduct.get(it.itemId) || 0) + it.quantity);
    }
  }
  const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { revenue, count, top };
}, 10);
results.measurements.push({
  category: 'dashboard_client',
  salesCount,
  aggregation: dashMetrics,
});

console.log('\n=== Phase 5: Memory simulation ===');
const memSamples = [];
function sampleMemory(label, holder) {
  if (global.gc) global.gc();
  const mu = process.memoryUsage();
  memSamples.push({
    label,
    heapUsedMB: +(mu.heapUsed / 1024 / 1024).toFixed(1),
    heapTotalMB: +(mu.heapTotal / 1024 / 1024).toFixed(1),
    rssMB: +(mu.rss / 1024 / 1024).toFixed(1),
    heldObjects: holder?.length ?? 0,
  });
}

let held = [];
sampleMemory('baseline', held);
held = Array.from({ length: 100_000 }, (_, i) => mockVariant(i));
sampleMemory('100k-variants', held);
const map = buildProductByIdMap(Array.from({ length: 100_000 }, (_, i) => mockProduct(i)));
held = buildBaseCatalogItems(held, map);
sampleMemory('100k-catalog', held);
held = Array.from({ length: 250_000 }, (_, i) => mockSale(i));
sampleMemory('250k-sales', held);

results.measurements.push({ category: 'memory_node_simulation', samples: memSamples });

console.log('\n=== Phase 7: Long-running session simulation (accelerated) ===');
const sessionSamples = [];
let sessionCart = [];
let sessionSales = [];
const iterations = 2000;
for (let i = 0; i < iterations; i++) {
  sessionCart.push({ id: `v-${i}`, qty: 1, price: 10 });
  if (sessionCart.length > 100) sessionCart = sessionCart.slice(-50);
  sessionSales.push(mockSale(i));
  if (i % 200 === 0) {
    if (global.gc) global.gc();
    const mu = process.memoryUsage();
    sessionSamples.push({
      iteration: i,
      heapUsedMB: +(mu.heapUsed / 1024 / 1024).toFixed(1),
      salesRetained: sessionSales.length,
    });
  }
}
results.measurements.push({
  category: 'long_running_simulation',
  note: '2000 sale iterations retained (12h proxy); full 12h requires live Electron',
  iterations,
  samples: sessionSamples,
  heapGrowthMB: sessionSamples.length >= 2
    ? +(sessionSamples[sessionSamples.length - 1].heapUsedMB - sessionSamples[0].heapUsedMB).toFixed(1)
    : 0,
});

writeFileSync(join(OUT, 'frontend-measurements.json'), JSON.stringify(results, null, 2));
console.log(`\nWrote ${join(OUT, 'frontend-measurements.json')}`);
