import { readFileSync, writeFileSync } from 'node:fs';
import { runStage, printStageSummary } from './lib/loadrunner.mjs';
import { mixedJourney } from './lib/journeys.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));

// Concurrency ramp scaled to this system's actual constraints (HikariCP maximumPoolSize=20,
// single local backend process, single local MySQL instance) rather than an arbitrary
// enterprise-SaaS number. We escalate until the system clearly degrades, then stop.
const STAGES = [10, 25, 50, 100, 200, 400, 800];
const DURATION_SEC = 30;
const DEGRADE_ERROR_RATE = 25; // % - stop ramp if we blow past this
const DEGRADE_P95_MS = 5000;

const results = [];
for (const concurrency of STAGES) {
  const result = await runStage({ concurrency, durationSec: DURATION_SEC, fixture, journeyFn: mixedJourney, label: `ramp-${concurrency}` });
  printStageSummary(result);
  results.push(result);
  writeFileSync(new URL('./results/graduated-ramp.json', import.meta.url), JSON.stringify(results, null, 2));

  if (result.overall.errorRate > DEGRADE_ERROR_RATE || result.overall.p95 > DEGRADE_P95_MS) {
    console.log(`\n!!! DEGRADATION THRESHOLD HIT at concurrency=${concurrency} (errorRate=${result.overall.errorRate}%, p95=${result.overall.p95}ms) — stopping ramp.`);
    break;
  }
  // brief cool-down between stages so one stage's tail requests don't bleed into the next
  await new Promise(r => setTimeout(r, 3000));
}

console.log('\n=== RAMP COMPLETE ===');
for (const r of results) {
  console.log(`concurrency=${r.concurrency}: rps=${r.rps} errRate=${r.overall.errorRate}% p50=${r.overall.p50} p95=${r.overall.p95} p99=${r.overall.p99} journeys=${r.journeysCompleted}`);
}
