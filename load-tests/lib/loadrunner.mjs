import { login, summarize, randChoice } from './client.mjs';

const tokenCache = new Map();
async function getToken(cred) {
  if (tokenCache.has(cred.username)) return tokenCache.get(cred.username);
  const t = await login(cred.username, cred.password);
  tokenCache.set(cred.username, t);
  return t;
}

/**
 * Runs `concurrency` parallel workers continuously executing `journeyFn` for `durationSec`.
 * Returns { samples, journeysCompleted, journeysFailed, wallMs, perSecond }.
 */
export async function runStage({ concurrency, durationSec, fixture, journeyFn, label }) {
  const samples = [];
  const perSecondCounts = new Map(); // second-bucket -> {count, errors}
  let journeysCompleted = 0;
  let journeysFailed = 0;
  const startedAt = Date.now();
  const endAt = startedAt + durationSec * 1000;

  function recordSecondBucket(sample) {
    const bucket = Math.floor((Date.now() - startedAt) / 1000);
    if (!perSecondCounts.has(bucket)) perSecondCounts.set(bucket, { count: 0, errors: 0 });
    const b = perSecondCounts.get(bucket);
    b.count++;
    if (!sample.ok) b.errors++;
  }

  async function worker(workerIdx) {
    const cred = fixture.cashiers[workerIdx % fixture.cashiers.length];
    let token;
    try {
      token = await getToken(cred);
    } catch (e) {
      console.error(`[${label}] worker ${workerIdx} login failed:`, e.message);
      return;
    }
    while (Date.now() < endAt) {
      const localSamples = [];
      try {
        await journeyFn(token, fixture, localSamples, cred);
        journeysCompleted++;
      } catch (e) {
        journeysFailed++;
        localSamples.push({ name: 'journey_exception', ok: false, status: 0, ms: 0, error: String(e.message || e) });
      }
      for (const s of localSamples) {
        samples.push(s);
        recordSecondBucket(s);
      }
    }
  }

  console.log(`[${label}] starting: concurrency=${concurrency} duration=${durationSec}s`);
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  const wallMs = Date.now() - startedAt;

  const byName = {};
  for (const s of samples) {
    if (!byName[s.name]) byName[s.name] = [];
    byName[s.name].push(s);
  }
  const perEndpoint = {};
  for (const [name, arr] of Object.entries(byName)) perEndpoint[name] = summarize(arr);

  const overall = summarize(samples);
  const secondsElapsed = Math.max(1, Math.ceil(wallMs / 1000));
  const rps = +(samples.length / secondsElapsed).toFixed(1);
  const journeysPerSec = +(journeysCompleted / secondsElapsed).toFixed(2);

  return {
    label, concurrency, durationSec, wallMs,
    journeysCompleted, journeysFailed,
    totalRequests: samples.length,
    rps, journeysPerSec,
    overall, perEndpoint,
  };
}

export function printStageSummary(result) {
  console.log(`\n=== ${result.label} (concurrency=${result.concurrency}) ===`);
  console.log(`  journeys: ${result.journeysCompleted} ok / ${result.journeysFailed} failed | requests: ${result.totalRequests} | rps=${result.rps}`);
  console.log(`  overall: errorRate=${result.overall.errorRate}% p50=${result.overall.p50}ms p95=${result.overall.p95}ms p99=${result.overall.p99}ms max=${result.overall.max}ms`);
  console.log(`  status codes:`, result.overall.statusCounts);
  for (const [name, s] of Object.entries(result.perEndpoint)) {
    console.log(`   - ${name}: n=${s.total} err=${s.errorRate}% p50=${s.p50} p95=${s.p95} p99=${s.p99}`);
  }
}
