import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { login, apiCall, summarize } from './lib/client.mjs';
import { mixedJourney } from './lib/journeys.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));

// Chosen well below the ramp's saturation point (Hikari pool maxed out with 191 pending
// threads already at concurrency=100) so we're observing sustained-load degradation,
// not re-measuring the already-known saturation collapse.
const CONCURRENCY = Number(process.env.SOAK_CONCURRENCY || 15);
const DURATION_MIN = Number(process.env.SOAK_DURATION_MIN || 240); // 4 hours default
const SNAPSHOT_INTERVAL_SEC = 60;

const timeSeriesPath = new URL('./results/soak-timeseries.jsonl', import.meta.url);
const summaryPath = new URL('./results/soak-summary.json', import.meta.url);

const ownerToken = await login('owner_marwan', '0533');

function getJavaProcessStats() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='java.exe'\\" | Select-Object ProcessId,WorkingSetSize,VirtualSize | ConvertTo-Json"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    // Pick the java process with the largest working set (the backend, not some IDE helper)
    const biggest = list.reduce((a, b) => (b.WorkingSetSize > (a?.WorkingSetSize || 0) ? b : a), null);
    return biggest ? { pid: biggest.ProcessId, rssBytes: biggest.WorkingSetSize, vssBytes: biggest.VirtualSize } : null;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function getActuatorMetrics() {
  const r = await apiCall('GET', '/api/actuator/prometheus', { token: ownerToken, timeoutMs: 8000 });
  if (!r.ok || !r.text) return null;
  const text = r.text;
  const grab = (metric) => {
    const m = text.match(new RegExp(`${metric}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)`));
    return m ? Number(m[1]) : null;
  };
  return {
    hikariActive: grab('hikaricp_connections_active'),
    hikariIdle: grab('hikaricp_connections_idle'),
    hikariPending: grab('hikaricp_connections_pending'),
    jvmHeapUsed: (() => {
      const matches = [...text.matchAll(/jvm_memory_used_bytes\{area="heap"[^}]*\}\s+([0-9.eE+-]+)/g)];
      return matches.reduce((sum, m) => sum + Number(m[1]), 0);
    })(),
  };
}

let stop = false;
process.on('SIGTERM', () => { stop = true; });
process.on('SIGINT', () => { stop = true; });
process.on('uncaughtException', (e) => {
  console.error('[soak] uncaughtException (continuing):', e && e.stack ? e.stack : e);
});
process.on('unhandledRejection', (e) => {
  console.error('[soak] unhandledRejection (continuing):', e && e.stack ? e.stack : e);
});

const startedAt = Date.now();
const endAt = startedAt + DURATION_MIN * 60 * 1000;
const allSamples = [];
let journeysCompleted = 0, journeysFailed = 0;

const tokenCache = new Map();
async function getToken(cred) {
  if (tokenCache.has(cred.username)) return tokenCache.get(cred.username);
  const t = await login(cred.username, cred.password);
  tokenCache.set(cred.username, t);
  return t;
}

async function worker(idx) {
  const cred = fixture.cashiers[idx % fixture.cashiers.length];
  const token = await getToken(cred);
  while (Date.now() < endAt && !stop) {
    const local = [];
    try {
      await mixedJourney(token, fixture, local, cred);
      journeysCompleted++;
    } catch (e) {
      journeysFailed++;
      local.push({ name: 'journey_exception', ok: false, status: 0, ms: 0 });
    }
    for (const s of local) allSamples.push(s);
    if (allSamples.length > 50000) allSamples.splice(0, allSamples.length - 20000); // cap memory of the harness itself
  }
}

async function snapshotLoop() {
  let tick = 0;
  while (Date.now() < endAt && !stop) {
    await new Promise(r => setTimeout(r, SNAPSHOT_INTERVAL_SEC * 1000));
    tick++;
    try {
      const elapsedMin = +((Date.now() - startedAt) / 60000).toFixed(1);
      const recentSamples = allSamples.slice(-2000); // rolling window for current latency snapshot
      const recentSummary = summarize(recentSamples);
      const javaStats = getJavaProcessStats();
      const actuator = await getActuatorMetrics().catch(e => ({ error: String(e.message || e) }));
      const snapshot = {
        tick, elapsedMin, timestamp: new Date().toISOString(),
        journeysCompleted, journeysFailed,
        recentRequestCount: recentSamples.length,
        recentErrorRate: recentSummary.errorRate,
        recentP50: recentSummary.p50, recentP95: recentSummary.p95, recentP99: recentSummary.p99,
        javaRssMB: javaStats?.rssBytes ? +(javaStats.rssBytes / 1024 / 1024).toFixed(1) : null,
        javaStatsError: javaStats?.error || null,
        hikariActive: actuator?.hikariActive, hikariIdle: actuator?.hikariIdle, hikariPending: actuator?.hikariPending,
        jvmHeapUsedMB: actuator?.jvmHeapUsed ? +(actuator.jvmHeapUsed / 1024 / 1024).toFixed(1) : null,
      };
      appendFileSync(timeSeriesPath, JSON.stringify(snapshot) + '\n');
      console.log(`[soak t=${elapsedMin}min] journeys=${journeysCompleted} recentErr=${snapshot.recentErrorRate}% p95=${snapshot.recentP95}ms javaRSS=${snapshot.javaRssMB}MB heap=${snapshot.jvmHeapUsedMB}MB hikari(active=${snapshot.hikariActive},pending=${snapshot.hikariPending})`);
    } catch (e) {
      console.error(`[soak] snapshot ${tick} failed (continuing):`, e && e.stack ? e.stack : e);
      try { appendFileSync(timeSeriesPath, JSON.stringify({ tick, snapshotError: String(e.message || e) }) + '\n'); } catch {}
    }
  }
}

console.log(`[soak] starting: concurrency=${CONCURRENCY}, duration=${DURATION_MIN}min`);
const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
await Promise.all([snapshotLoop(), ...workers]);

const wallMin = +((Date.now() - startedAt) / 60000).toFixed(1);
const finalSummary = {
  concurrency: CONCURRENCY, plannedDurationMin: DURATION_MIN, actualDurationMin: wallMin,
  journeysCompleted, journeysFailed,
  overall: summarize(allSamples.slice(-50000)),
};
writeFileSync(summaryPath, JSON.stringify(finalSummary, null, 2));
console.log('\n=== SOAK COMPLETE ===', JSON.stringify(finalSummary, null, 2));
