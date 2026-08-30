// Consolidates all 4 run segments (run1, run2, run3-partial, run3b) into final unified
// results files: metrics.csv, latency.csv, soak-timeseries.jsonl (final), errors.json, summary.json.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const DIR = 'C:/projectes/Amazon_pet/load-tests/results/post-hardening-soak/';
const segments = [
  { name: 'run1', file: 'soak-timeseries-run1.jsonl', outcome: 'CRASHED (external termination, likely environmental — see README)' },
  { name: 'run2', file: 'soak-timeseries-run2.jsonl', outcome: 'TERMINATED (session-lifecycle coupling suspected, not an app crash — see README)' },
  { name: 'run3-partial', file: 'soak-timeseries-run3-partial-intentionally-stopped.jsonl', outcome: 'INTENTIONALLY STOPPED (to fix process-detachment mechanism)' },
  { name: 'run3b', file: 'soak-timeseries-run3b.jsonl', outcome: 'INTENTIONALLY STOPPED (reached cumulative time target)' },
];

const header = ["run","tick","elapsedMin","cumulativeElapsedMin","timestamp","journeysCompleted","journeysFailed","recentRequestCount","recentErrorRate","recentP50","recentP90","recentP95","recentP99","springRssMB","jvmHeapUsedMB","jvmHeapCommittedMB","jvmHeapMaxMB","jvmOldGenUsedMB","threadsLive","processCpuUsagePct","gcPauseCount","gcPauseSumMs","hikariActive","hikariIdle","hikariPending","hikariMax","sysRamUsedMB","sysRamTotalMB","sysRamAvailMB","sysRamUsedPct","sysCpuPct","diskBytesPerSec","appReachable"];
const csvRows = [header.join(',')];
const latRows = ['run,tick,elapsedMin,cumulativeElapsedMin,timestamp,endpoint_scope,p50,p90,p95,p99,max,count,errorRate'];
const allRows = [];

let cumulativeOffset = 0;
let totalJourneys = 0;
let peakRss = 0, peakRssRun = '', peakRssTick = 0;
let minRss = Infinity;
const rssAtStart = {};

for (const seg of segments) {
  let lines;
  try { lines = readFileSync(DIR + seg.file, 'utf8').trim().split('\n').filter(Boolean); } catch { continue; }
  let segMaxElapsed = 0;
  let firstRss = null, lastRss = null;
  for (const line of lines) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.snapshotError) continue;
    const cumulativeElapsedMin = +(cumulativeOffset + o.elapsedMin).toFixed(1);
    segMaxElapsed = Math.max(segMaxElapsed, o.elapsedMin || 0);
    const row = { run: seg.name, cumulativeElapsedMin, ...o };
    allRows.push(row);
    csvRows.push(header.map(k => row[k] === undefined || row[k] === null ? '' : row[k]).join(','));
    latRows.push([seg.name, o.tick, o.elapsedMin, cumulativeElapsedMin, o.timestamp, 'overall_recent', o.recentP50, o.recentP90, o.recentP95, o.recentP99, '', o.recentRequestCount, o.recentErrorRate].join(','));
    if (o.springRssMB) {
      if (firstRss === null) firstRss = o.springRssMB;
      lastRss = o.springRssMB;
      if (o.springRssMB > peakRss) { peakRss = o.springRssMB; peakRssRun = seg.name; peakRssTick = o.tick; }
      if (o.springRssMB < minRss) minRss = o.springRssMB;
    }
    if (o.journeysCompleted) totalJourneys = Math.max(totalJourneys, o.journeysCompleted); // resets per-run, just track last
  }
  rssAtStart[seg.name] = { firstRss, lastRss, maxElapsed: segMaxElapsed };
  cumulativeOffset += segMaxElapsed;
}

writeFileSync(DIR + 'metrics.csv', csvRows.join('\n') + '\n');
writeFileSync(DIR + 'latency.csv', latRows.join('\n') + '\n');
writeFileSync(DIR + 'soak-timeseries.jsonl', allRows.map(r => JSON.stringify(r)).join('\n') + '\n');

console.log('Consolidated', allRows.length, 'total ticks across', segments.length, 'segments');
console.log('Cumulative elapsed (sum of segment durations):', cumulativeOffset.toFixed(1), 'min');
console.log('Peak springRSS:', peakRss, 'MB (run', peakRssRun, 'tick', peakRssTick, ')');
console.log('Min springRSS observed:', minRss, 'MB');
console.log('Per-segment RSS (first -> last):', JSON.stringify(rssAtStart, null, 2));

// Aggregate error/status data from what's available: each run's own errors don't have a unified
// source (run1/run2/run3b were force-terminated before writing their own errors.json), so we
// derive an approximate aggregate from the recentErrorRate/recentRequestCount time series —
// documented clearly as an approximation, not exact per-status-code counts.
let weightedErrorSum = 0, totalReqWeight = 0;
for (const r of allRows) {
  if (r.recentRequestCount && r.recentErrorRate !== undefined) {
    weightedErrorSum += (r.recentErrorRate / 100) * r.recentRequestCount;
    totalReqWeight += r.recentRequestCount;
  }
}
const approxOverallErrorRatePct = totalReqWeight ? +((weightedErrorSum / totalReqWeight) * 100).toFixed(2) : null;
console.log('Approx overall error rate (weighted avg of rolling windows):', approxOverallErrorRatePct, '%');
console.log('NOTE: this is an approximation from recentErrorRate/recentRequestCount ticks, not exact status-code tallies, because run1/run2/run3b were all force-terminated before they could write an authoritative errors.json from their in-memory per-request samples.');
