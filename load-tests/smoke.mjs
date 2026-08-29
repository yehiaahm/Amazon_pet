import { login, apiCall, uuid } from './lib/client.mjs';

const token = await login('owner_marwan', '0533');
console.log('login ok');

const sku = 'SMOKE-' + Date.now();
const create = await apiCall('POST', '/api/v1/products', {
  token,
  body: {
    product: { name: 'Test Dog Food ' + sku, sku, categoryName: 'Food' },
    variant: { name: 'قياسي', price: 150.0, cost: 90.0, initialStock: 0 },
  },
});
const variantId = create.json?.data?.variantId;
console.log('product created', create.status, variantId);

const adjust = await apiCall('POST', '/api/v1/inventory/adjust', {
  token,
  body: { variantId, warehouseId: 'wh-shelf', diff: 100, type: 'PURCHASE', employeeId: 'e-1' },
});
console.log('stock adjust', adjust.status, JSON.stringify(adjust.json).slice(0, 300));

const custCreate = await apiCall('POST', '/api/v1/customers', {
  token,
  body: { name: 'Test Customer', phone: '0100000' + Math.floor(Math.random() * 10000), discount: 0 },
});
console.log('customer created', custCreate.status, JSON.stringify(custCreate.json).slice(0, 300));
const customerId = custCreate.json?.data?.id;

const petCreate = await apiCall('POST', `/api/v1/pets?customerId=${customerId}`, {
  token,
  body: { name: 'Rex', species: 'DOG', breed: 'Labrador', age: 3 },
});
console.log('pet created', petCreate.status, JSON.stringify(petCreate.json).slice(0, 300));

let posSessionId;
const active = await apiCall('GET', '/api/v1/pos-sessions/active', { token });
if (active.json?.data?.id) {
  posSessionId = active.json.data.id;
  console.log('reusing active session', posSessionId);
} else {
  const openSession = await apiCall('POST', '/api/v1/pos-sessions/open', {
    token,
    body: { openingBalance: 500, branchId: 'b-1' },
  });
  console.log('session open', openSession.status, JSON.stringify(openSession.json).slice(0, 300));
  posSessionId = openSession.json?.data?.id;
}

const sale = await apiCall('POST', '/api/v1/sales', {
  token,
  headers: { 'Idempotency-Key': uuid() },
  body: {
    posSessionId,
    customerId,
    totalAmount: 300,
    tax: 0,
    discount: 0,
    paymentMethod: 'CASH',
    items: [{ itemId: variantId, quantity: 2, price: 150.0, cost: 90.0 }],
    delivery: false,
  },
});
console.log('sale created', sale.status, JSON.stringify(sale.json).slice(0, 500));
