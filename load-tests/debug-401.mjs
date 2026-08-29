import { readFileSync } from 'node:fs';
import { login, apiCall } from './lib/client.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));
const token = await login('owner_marwan', '0533');
console.log('got token, firing 150 concurrent dashboard requests with the SAME token');

const results = await Promise.all(
  Array.from({ length: 150 }, () => apiCall('GET', '/api/v1/analytics/dashboard', { token }))
);
const statusCounts = {};
for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
console.log('status counts', statusCounts);
const unauthorized = results.filter(r => r.status === 401);
if (unauthorized.length) {
  console.log('sample 401 body:', JSON.stringify(unauthorized[0].json || unauthorized[0].text));
}
