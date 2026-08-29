import { login, apiCall } from './lib/client.mjs';

console.log('logging in...');
const t0 = Date.now();
const token = await login('owner_marwan', '0533');
console.log('login took', Date.now() - t0, 'ms');

const t1 = Date.now();
const health = await apiCall('GET', '/api/actuator/health', { token, timeoutMs: 10000 });
console.log('health', health.status, Date.now() - t1, 'ms');

const t2 = Date.now();
const prom = await apiCall('GET', '/api/actuator/prometheus', { token, timeoutMs: 10000 });
console.log('prometheus', prom.status, Date.now() - t2, 'ms');
if (prom.ok) {
  const text = prom.text || '';
  for (const line of text.split('\n')) {
    if (line.includes('hikaricp_connections_active') || line.includes('hikaricp_connections_idle') || line.includes('hikaricp_connections_pending')) {
      console.log(' ', line);
    }
  }
}

const t3 = Date.now();
const dash = await apiCall('GET', '/api/v1/analytics/dashboard', { token, timeoutMs: 15000 });
console.log('dashboard', dash.status, Date.now() - t3, 'ms');
