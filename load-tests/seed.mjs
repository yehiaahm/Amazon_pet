import { login, apiCall } from './lib/client.mjs';
import { randomProduct, randomCustomerName, randomPhone, randomPet } from './lib/data.mjs';
import { writeFileSync } from 'node:fs';

const OWNER_USER = 'owner_marwan';
const OWNER_PASS = '8829';
const NUM_PRODUCTS = 60;
const NUM_CASHIERS = 8;
const NUM_BASE_CUSTOMERS = 40;
const STOCK_PER_PRODUCT = 500;
// NOTE (post-hardening soak, 2026-08-21): debug-warehouse.mjs's old comment claiming 'wh-main' was
// stale — SaleService.resolveSalesWarehouseId was hardened to deterministically resolve to the
// well-known retail-facing warehouse StockService.DEFAULT_SALES_WAREHOUSE = "wh-shelf" for branch
// b-1 (see SaleService.java:649-671), not "the first warehouse row for the branch" like before.
// Stocking 'wh-main' now silently produces "available stock: 0" at checkout even though the catalog
// shows stock — confirmed live against the running post-hardening backend. Using the correct
// warehouse here so the soak's sustained sale traffic actually finds stock.
const WAREHOUSE_ID = 'wh-shelf';

async function main() {
  const ownerToken = await login(OWNER_USER, OWNER_PASS);
  console.log('[seed] owner logged in');

  const employeeId = 'e-1';

  // 1. Create cashier/manager accounts for realistic multi-session concurrent load
  const cashiers = [{ username: OWNER_USER, password: OWNER_PASS, role: 'OWNER' }];
  for (let i = 0; i < NUM_CASHIERS; i++) {
    const username = `lt_cashier_${i}_${Date.now()}`;
    const password = 'LoadTest123!';
    const role = i === 0 ? 'MANAGER' : 'CASHIER'; // one manager among the cashiers for KPI/product-create coverage
    const r = await apiCall('POST', '/api/v1/employees', {
      token: ownerToken,
      body: { username, password, fullName: `Load Test ${role} ${i}`, role },
    });
    if (r.ok) {
      cashiers.push({ username, password, role });
    } else {
      console.error('[seed] failed to create cashier', i, r.status, JSON.stringify(r.json));
    }
  }
  console.log(`[seed] created ${cashiers.length - 1} cashier accounts`);

  // 2. Create product catalog with stock
  const products = [];
  for (let i = 0; i < NUM_PRODUCTS; i++) {
    const suffix = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    const body = randomProduct(suffix);
    const r = await apiCall('POST', '/api/v1/products', { token: ownerToken, body });
    if (!r.ok) {
      console.error('[seed] product create failed', i, r.status, JSON.stringify(r.json));
      continue;
    }
    const variantId = r.json.data.variantId;
    const price = r.json.data.price;
    const cost = r.json.data.cost;
    const adj = await apiCall('POST', '/api/v1/inventory/adjust', {
      token: ownerToken,
      body: { variantId, warehouseId: WAREHOUSE_ID, diff: STOCK_PER_PRODUCT, type: 'PURCHASE', employeeId },
    });
    if (!adj.ok) {
      console.error('[seed] stock adjust failed', i, adj.status, JSON.stringify(adj.json));
      continue;
    }
    products.push({ variantId, price, cost, sku: body.product.sku, name: body.product.name });
    if ((i + 1) % 10 === 0) console.log(`[seed] products ${i + 1}/${NUM_PRODUCTS}`);
  }
  console.log(`[seed] created ${products.length} products with ${STOCK_PER_PRODUCT} stock each in ${WAREHOUSE_ID}`);

  // 3. Create base customers (+ pets for ~60%)
  const customers = [];
  for (let i = 0; i < NUM_BASE_CUSTOMERS; i++) {
    const discount = Math.random() < 0.2 ? 5 : 0;
    const r = await apiCall('POST', '/api/v1/customers', {
      token: ownerToken,
      body: { name: randomCustomerName(), phone: randomPhone(), discount },
    });
    if (!r.ok) {
      console.error('[seed] customer create failed', i, r.status, JSON.stringify(r.json));
      continue;
    }
    const customerId = r.json.data.id;
    let petId = null;
    if (Math.random() < 0.6) {
      const petBody = randomPet();
      const pr = await apiCall('POST', `/api/v1/pets?customerId=${customerId}`, { token: ownerToken, body: petBody });
      if (pr.ok) petId = pr.json.data.id;
    }
    customers.push({ customerId, petId, discount });
  }
  console.log(`[seed] created ${customers.length} customers`);

  // 4. Ensure a POS session is open for the branch (sale creation needs an OPEN session; sessions are per-branch, not per-employee)
  let posSessionId;
  const active = await apiCall('GET', '/api/v1/pos-sessions/active', { token: ownerToken });
  if (active.ok && active.json?.data?.id) {
    posSessionId = active.json.data.id;
    console.log('[seed] reusing already-open POS session', posSessionId);
  } else {
    const open = await apiCall('POST', '/api/v1/pos-sessions/open', { token: ownerToken, body: { openingBalance: 1000, branchId: 'b-1' } });
    if (!open.ok) throw new Error('Could not open POS session: ' + JSON.stringify(open.json));
    posSessionId = open.json.data.id;
    console.log('[seed] opened new POS session', posSessionId);
  }

  const fixture = { cashiers, products, customers, posSessionId, branchId: 'b-1', warehouseId: WAREHOUSE_ID, employeeId };
  writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2));
  console.log('[seed] wrote fixture.json:', products.length, 'products,', customers.length, 'customers,', cashiers.length, 'logins');
}

main().catch(e => { console.error('[seed] FATAL', e); process.exit(1); });
