import { login, apiCall, uuid } from './lib/client.mjs';

const token = await login('owner_marwan', '0533');
const sku = 'WHTEST-' + Date.now();
const create = await apiCall('POST', '/api/v1/products', {
  token,
  body: { product: { name: 'WH Test ' + sku, sku, categoryName: 'Food' }, variant: { name: 'Std', price: 100, cost: 60, initialStock: 0 } },
});
const variantId = create.json?.data?.variantId;
console.log('variant', variantId);

// Stock ONLY wh-main this time (not wh-shelf)
const adjust = await apiCall('POST', '/api/v1/inventory/adjust', {
  token,
  body: { variantId, warehouseId: 'wh-main', diff: 50, type: 'PURCHASE', employeeId: 'e-1' },
});
console.log('adjust to wh-main', adjust.status, adjust.json?.data?.stockQuantity);

const active = await apiCall('GET', '/api/v1/pos-sessions/active', { token });
const posSessionId = active.json?.data?.id;
console.log('session', posSessionId, 'branch', active.json?.data?.branch?.id);

const sale = await apiCall('POST', '/api/v1/sales', {
  token,
  headers: { 'Idempotency-Key': uuid() },
  body: {
    posSessionId,
    totalAmount: 100,
    tax: 0,
    discount: 0,
    paymentMethod: 'CASH',
    items: [{ itemId: variantId, quantity: 1, price: 100.0, cost: 60.0 }],
    delivery: false,
  },
});
console.log('sale (stock is in wh-main only)', sale.status, JSON.stringify(sale.json));
