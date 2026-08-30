import { login, apiCall } from './lib/client.mjs';

const token = await login('owner_marwan', '0533');
const sku = 'DBG-' + Date.now();
const create = await apiCall('POST', '/api/v1/products', {
  token,
  body: { product: { name: 'Debug Item ' + sku, sku, categoryName: 'Food' }, variant: { name: 'Std', price: 100, cost: 60, initialStock: 0 } },
});
const variantId = create.json?.data?.variantId;
console.log('variant', variantId, 'stockQuantity in create response =', create.json?.data?.stockQuantity);

const adjust = await apiCall('POST', '/api/v1/inventory/adjust', {
  token,
  body: { variantId, warehouseId: 'wh-shelf', diff: 50, type: 'PURCHASE', employeeId: 'e-1' },
});
console.log('adjust status', adjust.status);
console.log('adjust response stockQuantity =', adjust.json?.data?.stockQuantity);
console.log('adjust full', JSON.stringify(adjust.json?.data).slice(0, 500));

const batches = await apiCall('GET', `/api/v1/inventory/batches?productVariantId=${variantId}`, { token });
console.log('batches', batches.status, JSON.stringify(batches.json).slice(0, 800));

const variantsList = await apiCall('GET', `/api/v1/inventory/variants?search=${sku}`, { token });
console.log('variants search', variantsList.status, JSON.stringify(variantsList.json).slice(0, 800));
