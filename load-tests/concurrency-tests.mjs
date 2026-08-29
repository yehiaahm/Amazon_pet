import { readFileSync, writeFileSync } from 'node:fs';
import { login, apiCall, uuid } from './lib/client.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));
const token = await login('owner_marwan', '0533');
const report = {};

async function makeStockedProduct(qty) {
  const sku = 'RACE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const create = await apiCall('POST', '/api/v1/products', {
    token, body: { product: { name: 'Race Test ' + sku, sku, categoryName: 'Food' }, variant: { name: 'Std', price: 50, cost: 30, initialStock: 0 } },
  });
  const variantId = create.json.data.variantId;
  await apiCall('POST', '/api/v1/inventory/adjust', {
    token, body: { variantId, warehouseId: fixture.warehouseId, diff: qty, type: 'PURCHASE', employeeId: fixture.employeeId },
  });
  return variantId;
}

// --- Test 1: N concurrent buyers vs limited stock (overselling / negative stock / lost updates check) ---
async function testConcurrentStockDepletion() {
  const STOCK = 30;
  const BUYERS = 60;
  const variantId = await makeStockedProduct(STOCK);
  console.log(`[race1] variant ${variantId} stocked with ${STOCK} units, firing ${BUYERS} concurrent 1-unit sales`);

  const promises = Array.from({ length: BUYERS }, () =>
    apiCall('POST', '/api/v1/sales', {
      token,
      headers: { 'Idempotency-Key': uuid() },
      body: {
        posSessionId: fixture.posSessionId,
        totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH',
        items: [{ itemId: variantId, quantity: 1, price: 50, cost: 30 }],
        delivery: false,
      },
    })
  );
  const results = await Promise.all(promises);
  const succeeded = results.filter(r => r.ok).length;
  const insufficientStock = results.filter(r => !r.ok && r.json?.message?.includes('مخزون')).length;
  const otherErrors = results.filter(r => !r.ok && !r.json?.message?.includes('مخزون'));

  const variantCheck = await apiCall('GET', `/api/v1/inventory/variants?search=${variantId}`, { token });
  const finalStock = variantCheck.json?.data?.content?.[0]?.stockQuantity;

  report.concurrentStockDepletion = {
    initialStock: STOCK, buyers: BUYERS, succeeded, insufficientStock,
    otherErrorCount: otherErrors.length,
    otherErrorSamples: otherErrors.slice(0, 5).map(r => ({ status: r.status, message: r.json?.message || r.error })),
    finalReportedStock: finalStock,
    OVERSOLD: succeeded > STOCK,
    NEGATIVE_STOCK: finalStock < 0,
    STOCK_MATCHES_EXPECTED: finalStock === (STOCK - succeeded),
  };
  console.log('[race1]', JSON.stringify(report.concurrentStockDepletion, null, 2));
}

// --- Test 2: same Idempotency-Key fired concurrently (must not create duplicate sales) ---
async function testIdempotencyRace() {
  const variantId = await makeStockedProduct(100);
  const key = uuid();
  const CONCURRENT = 10;
  console.log(`[race2] firing ${CONCURRENT} concurrent POSTs with the SAME idempotency key`);
  const body = {
    posSessionId: fixture.posSessionId,
    totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH',
    items: [{ itemId: variantId, quantity: 1, price: 50, cost: 30 }],
    delivery: false,
  };
  const promises = Array.from({ length: CONCURRENT }, () =>
    apiCall('POST', '/api/v1/sales', { token, headers: { 'Idempotency-Key': key }, body })
  );
  const results = await Promise.all(promises);
  const saleIds = new Set(results.filter(r => r.ok).map(r => r.json?.data?.id).filter(Boolean));
  const statusCounts = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  const variantCheck = await apiCall('GET', `/api/v1/inventory/variants?search=${variantId}`, { token });
  const finalStock = variantCheck.json?.data?.content?.[0]?.stockQuantity;

  report.idempotencyRace = {
    concurrent: CONCURRENT, statusCounts,
    distinctSaleIdsCreated: saleIds.size,
    DUPLICATE_SALES_CREATED: saleIds.size > 1,
    initialStock: 100, finalStock, stockDeductedByExpectedAmount: finalStock === 100 - 1,
  };
  console.log('[race2]', JSON.stringify(report.idempotencyRace, null, 2));
}

// --- Test 3: concurrent customer creation with same phone (unique constraint race) ---
async function testConcurrentCustomerCreation() {
  const phone = '0199' + Math.floor(Math.random() * 10000000);
  const CONCURRENT = 15;
  console.log(`[race3] firing ${CONCURRENT} concurrent customer creations with the SAME phone`);
  const promises = Array.from({ length: CONCURRENT }, (_, i) =>
    apiCall('POST', '/api/v1/customers', { token, body: { name: 'Race Customer ' + i, phone, discount: 0 } })
  );
  const results = await Promise.all(promises);
  const succeeded = results.filter(r => r.ok);
  report.concurrentCustomerCreation = {
    concurrent: CONCURRENT,
    succeededCount: succeeded.length,
    DUPLICATE_CUSTOMERS_CREATED: succeeded.length > 1,
    statusCounts: results.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
  };
  console.log('[race3]', JSON.stringify(report.concurrentCustomerCreation, null, 2));
}

// --- Test 4: concurrent loyalty redemption against one customer's balance ---
async function testConcurrentLoyaltyRedemption() {
  const phone = '0198' + Math.floor(Math.random() * 10000000);
  const custRes = await apiCall('POST', '/api/v1/customers', { token, body: { name: 'Loyalty Race Cust', phone, discount: 0 } });
  const customerId = custRes.json?.data?.id;
  if (!customerId) { report.concurrentLoyaltyRedemption = { SKIPPED: true, reason: 'customer create failed' }; return; }

  // Build up a loyalty balance first via a real sale + earn, if the API supports it directly we'd need
  // a loyalty top-up endpoint; skip earning mechanics and just attempt concurrent redemption requests
  // against a zero/low balance to confirm no over-redemption / negative balance is possible.
  const variantId = await makeStockedProduct(50);
  const CONCURRENT = 8;
  console.log(`[race4] firing ${CONCURRENT} concurrent sales all requesting loyalty redemption for the same customer`);
  const promises = Array.from({ length: CONCURRENT }, () =>
    apiCall('POST', '/api/v1/sales', {
      token,
      headers: { 'Idempotency-Key': uuid() },
      body: {
        posSessionId: fixture.posSessionId, customerId,
        totalAmount: 50, tax: 0, discount: 0, paymentMethod: 'CASH',
        items: [{ itemId: variantId, quantity: 1, price: 50, cost: 30 }],
        delivery: false, loyaltyRedeem: 1000, // way beyond any real balance — should clamp, never go negative
      },
    })
  );
  const results = await Promise.all(promises);
  report.concurrentLoyaltyRedemption = {
    concurrent: CONCURRENT,
    succeeded: results.filter(r => r.ok).length,
    statusCounts: results.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
    note: 'all requested loyaltyRedeem=1000 against a fresh/low-balance customer; server must clamp to actual balance, never go negative',
  };
  console.log('[race4]', JSON.stringify(report.concurrentLoyaltyRedemption, null, 2));
}

await testConcurrentStockDepletion();
await testIdempotencyRace();
await testConcurrentCustomerCreation();
await testConcurrentLoyaltyRedemption();

writeFileSync(new URL('./results/concurrency-tests.json', import.meta.url), JSON.stringify(report, null, 2));
console.log('\n=== CONCURRENCY TEST REPORT WRITTEN to results/concurrency-tests.json ===');
