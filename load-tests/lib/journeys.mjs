import { apiCall, uuid, randInt, randChoice, randDecimal } from './client.mjs';
import { randomProduct, randomCustomerName, randomPhone, randomPet } from './data.mjs';

// Each journey function returns an array of { name, ok, status, ms } samples
// and mutates nothing global — caller aggregates.

async function step(samples, name, promise) {
  const r = await promise;
  samples.push({ name, ok: r.ok, status: r.status, ms: r.ms, error: r.error });
  return r;
}

/** The core POS sale journey described in the spec: login(once)->dashboard->search customer->
 * open customer->open pet->search product->add product->create order->refresh dashboard. */
export async function posSaleJourney(token, fixture, samples) {
  await step(samples, 'dashboard', apiCall('GET', '/api/v1/analytics/dashboard', { token }));

  const customer = randChoice(fixture.customers);
  const searchTerm = customer.customerId.slice(0, 6);
  await step(samples, 'search_customer', apiCall('GET', `/api/v1/customers?search=${searchTerm}`, { token }));
  await step(samples, 'open_customer', apiCall('GET', `/api/v1/customers/${customer.customerId}`, { token }));
  if (customer.petId) {
    await step(samples, 'open_customer_pets', apiCall('GET', `/api/v1/customers/${customer.customerId}/pets`, { token }));
  }

  const numLines = randInt(1, 4);
  const chosenProducts = Array.from({ length: numLines }, () => randChoice(fixture.products));
  await step(samples, 'search_product', apiCall('GET', `/api/v1/products?search=${chosenProducts[0].sku.slice(0, 6)}`, { token }));

  const items = chosenProducts.map(p => {
    const qty = randInt(1, 3);
    return { itemId: p.variantId, quantity: qty, price: p.price, cost: p.cost, _lineTotal: p.price * qty };
  });
  const subtotal = +items.reduce((s, i) => s + i._lineTotal, 0).toFixed(2);
  // Server always applies customer.discount% automatically as "loyalty discount" (SaleService.java:245-246),
  // on top of which a cashier may add a manual discount capped at 10% of subtotal net of that (line 248-257).
  const loyaltyDiscount = +(subtotal * (customer.discount || 0) / 100).toFixed(2);
  const maxManualDiscount = +(subtotal * 0.10).toFixed(2);
  const manualDiscount = Math.random() < 0.15 ? +Math.min(maxManualDiscount, subtotal * 0.05).toFixed(2) : 0;
  const discount = +(loyaltyDiscount + manualDiscount).toFixed(2);
  const total = +(subtotal - discount).toFixed(2);

  const saleRes = await step(samples, 'create_sale', apiCall('POST', '/api/v1/sales', {
    token,
    headers: { 'Idempotency-Key': uuid() },
    body: {
      posSessionId: fixture.posSessionId,
      customerId: customer.customerId,
      totalAmount: total,
      tax: 0,
      discount,
      paymentMethod: randChoice(['CASH', 'CARD', 'INSTAPAY']),
      items: items.map(({ _lineTotal, ...rest }) => rest),
      delivery: false,
    },
  }));

  await step(samples, 'refresh_dashboard', apiCall('GET', '/api/v1/analytics/dashboard', { token }));
  return saleRes;
}

export async function newCustomerJourney(token, fixture, samples) {
  const custRes = await step(samples, 'create_customer', apiCall('POST', '/api/v1/customers', {
    token,
    body: { name: randomCustomerName(), phone: randomPhone(), discount: 0 },
  }));
  if (custRes.ok && custRes.json?.data?.id && Math.random() < 0.7) {
    await step(samples, 'create_pet', apiCall('POST', `/api/v1/pets?customerId=${custRes.json.data.id}`, {
      token, body: randomPet(),
    }));
  }
  return custRes;
}

export async function newProductJourney(token, fixture, samples) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = randomProduct(suffix);
  const r = await step(samples, 'create_product', apiCall('POST', '/api/v1/products', { token, body }));
  if (r.ok && r.json?.data?.variantId) {
    await step(samples, 'stock_new_product', apiCall('POST', '/api/v1/inventory/adjust', {
      token,
      body: { variantId: r.json.data.variantId, warehouseId: fixture.warehouseId, diff: randInt(20, 200), type: 'PURCHASE', employeeId: fixture.employeeId },
    }));
  }
  return r;
}

export async function browseJourney(token, fixture, samples, isElevated = true) {
  await step(samples, 'dashboard', apiCall('GET', '/api/v1/analytics/dashboard', { token }));
  if (isElevated) {
    await step(samples, 'kpis', apiCall('GET', '/api/v1/analytics/kpis', { token }));
  }
  await step(samples, 'products_list', apiCall('GET', '/api/v1/products?page=0&size=50', { token }));
  await step(samples, 'sales_list', apiCall('GET', '/api/v1/sales?page=0&size=20', { token }));
  await step(samples, 'low_stock', apiCall('GET', '/api/v1/inventory/low-stock', { token }));
}

/** Weighted-random mixed traffic: mirrors realistic daily mix (mostly POS sales,
 * fewer new-customer/product registrations, some pure browsing/reporting).
 * Routes owner/manager-only actions (product create, KPIs) only to accounts that
 * actually hold those permissions, matching real RBAC rather than generating noise 403s. */
export async function mixedJourney(token, fixture, samples, cred) {
  // RBAC as actually seeded (V27__RBAC_Permissions.sql): CASHIER gets customers.view only,
  // not customers.add/products.add/dashboard.financial_kpis — those are OWNER/MANAGER-only.
  const isElevated = cred && (cred.role === 'OWNER' || cred.role === 'MANAGER');
  const r = Math.random();
  if (r < 0.65) return posSaleJourney(token, fixture, samples);
  if (isElevated && r < 0.80) return newCustomerJourney(token, fixture, samples);
  if (isElevated && r < 0.90) return newProductJourney(token, fixture, samples);
  return browseJourney(token, fixture, samples, isElevated);
}
