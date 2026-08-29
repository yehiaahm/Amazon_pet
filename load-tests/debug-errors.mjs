import { readFileSync } from 'node:fs';
import { login, apiCall, uuid, randChoice, randInt } from './lib/client.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));

const ownerToken = await login('owner_marwan', '0533');
const cashierCred = fixture.cashiers[1];
const cashierToken = await login(cashierCred.username, cashierCred.password);

console.log('--- cashier trying create_customer ---');
const c1 = await apiCall('POST', '/api/v1/customers', { token: cashierToken, body: { name: 'X', phone: '0111' + randInt(1000000, 9999999), discount: 0 } });
console.log(c1.status, JSON.stringify(c1.json));

console.log('--- cashier trying kpis ---');
const k1 = await apiCall('GET', '/api/v1/analytics/kpis', { token: cashierToken });
console.log(k1.status, JSON.stringify(k1.json));

console.log('--- cashier trying create_product ---');
const p1 = await apiCall('POST', '/api/v1/products', { token: cashierToken, body: { product: { name: 'X', sku: 'ERR-' + Date.now(), categoryName: 'Food' }, variant: { name: 'a', price: 10, cost: 5 } } });
console.log(p1.status, JSON.stringify(p1.json));

console.log('--- multiple create_sale attempts to find the 500/400 causes ---');
for (let i = 0; i < 15; i++) {
  const customer = randChoice(fixture.customers);
  const products = [randChoice(fixture.products), randChoice(fixture.products)];
  const items = products.map(p => ({ itemId: p.variantId, quantity: randInt(1, 3), price: p.price, cost: p.cost }));
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const r = await apiCall('POST', '/api/v1/sales', {
    token: cashierToken,
    headers: { 'Idempotency-Key': uuid() },
    body: { posSessionId: fixture.posSessionId, customerId: customer.customerId, totalAmount: +subtotal.toFixed(2), tax: 0, discount: 0, paymentMethod: 'CASH', items, delivery: false },
  });
  if (!r.ok) console.log('FAIL', r.status, JSON.stringify(r.json).slice(0, 250));
}
