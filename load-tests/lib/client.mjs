import { performance } from 'node:perf_hooks';

export const BASE = process.env.LOAD_TEST_BASE_URL || 'http://localhost:8081';

export class ApiError extends Error {
  constructor(status, body, path) {
    super(`HTTP ${status} on ${path}: ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

export async function apiCall(method, path, { token, body, headers = {}, timeoutMs = 15000 } = {}) {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res, text;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    const ms = performance.now() - t0;
    return { ok: false, status: 0, ms, error: e.name === 'AbortError' ? 'TIMEOUT' : e.message, path, method };
  }
  clearTimeout(timer);
  const ms = performance.now() - t0;
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return {
    ok: res.ok,
    status: res.status,
    ms,
    json,
    text: json ? null : text,
    path,
    method,
  };
}

export async function login(username, password) {
  const r = await apiCall('POST', '/api/auth/login', { body: { username, password } });
  if (!r.ok) throw new ApiError(r.status, r.json ?? r.text, '/api/auth/login');
  return r.json?.data?.token || r.json?.token;
}

export function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(sortedArr.length - 1, idx))];
}

export function summarize(samples) {
  const ok = samples.filter(s => s.ok);
  const failed = samples.filter(s => !s.ok);
  const timings = ok.map(s => s.ms).sort((a, b) => a - b);
  const statusCounts = {};
  for (const s of samples) {
    const key = s.status === 0 ? `ERR:${s.error || 'unknown'}` : String(s.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  return {
    total: samples.length,
    success: ok.length,
    failed: failed.length,
    errorRate: samples.length ? +(failed.length / samples.length * 100).toFixed(2) : 0,
    p50: +percentile(timings, 50).toFixed(1),
    p90: +percentile(timings, 90).toFixed(1),
    p95: +percentile(timings, 95).toFixed(1),
    p99: +percentile(timings, 99).toFixed(1),
    max: timings.length ? +timings[timings.length - 1].toFixed(1) : 0,
    min: timings.length ? +timings[0].toFixed(1) : 0,
    statusCounts,
  };
}

export function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function randChoice(arr) { return arr[randInt(0, arr.length - 1)]; }
export function randDecimal(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  return +v.toFixed(decimals);
}
export function uuid() { return crypto.randomUUID(); }
