// Independent watchdog for the final 16h soak. Deliberately has NO dependency on soak-posthardening.mjs
// or its process -- runs as its own separate node process so it keeps reporting the backend's true
// up/down state even if the load-generator harness itself hangs or dies (exactly the failure mode
// from the 2026-08-21 soak where the harness's own watcher died silently along with a session teardown).
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

const BASE = process.env.LOAD_TEST_BASE_URL || 'http://localhost:8099';
const OUT = process.env.WATCHDOG_OUT || 'C:/projectes/Amazon_pet/load-tests/results/final-16h-soak/watchdog.jsonl';
const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 60000);
const DURATION_MIN = Number(process.env.WATCHDOG_DURATION_MIN || 960);
const endAt = Date.now() + DURATION_MIN * 60000;

writeFileSync(OUT, '');

async function checkHealth() {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${BASE}/api/actuator/health`, { signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const body = await res.text();
    return { reachable: res.ok, status: res.status, ms, body: body.slice(0, 200) };
  } catch (e) {
    return { reachable: false, error: String(e.message || e), ms: Date.now() - t0 };
  }
}

async function getDiskFree() {
  try {
    const { stdout } = await execFileP('powershell', ['-NoProfile', '-Command',
      "(Get-Volume -DriveLetter C).SizeRemaining"], { timeout: 10000 });
    return Number(stdout.trim());
  } catch { return null; }
}

let consecutiveFailures = 0;
let tick = 0;
console.log(`[watchdog] starting, base=${BASE}, interval=${INTERVAL_MS}ms, duration=${DURATION_MIN}min`);

while (Date.now() < endAt) {
  tick++;
  const health = await checkHealth();
  const diskFreeBytes = await getDiskFree();
  const entry = {
    tick, timestamp: new Date().toISOString(), elapsedMin: +((960 * 60000 - (endAt - Date.now())) / 60000).toFixed(1),
    ...health, diskFreeGB: diskFreeBytes ? +(diskFreeBytes / 1e9).toFixed(2) : null,
  };
  appendFileSync(OUT, JSON.stringify(entry) + '\n');

  if (!health.reachable) {
    consecutiveFailures++;
    console.log(`[watchdog] UNREACHABLE (consecutive=${consecutiveFailures}):`, JSON.stringify(health));
    if (consecutiveFailures >= 3) {
      console.log(`[watchdog] CRASH_SUSPECTED at tick ${tick}, ${new Date().toISOString()}`);
    }
  } else {
    if (consecutiveFailures > 0) console.log(`[watchdog] RECOVERED after ${consecutiveFailures} failures`);
    consecutiveFailures = 0;
  }

  if (diskFreeBytes !== null && diskFreeBytes < 500_000_000) {
    console.log(`[watchdog] CRITICAL: disk free below 500MB (${(diskFreeBytes/1e9).toFixed(2)}GB) at tick ${tick}`);
  }

  await new Promise(r => setTimeout(r, INTERVAL_MS));
}
console.log('[watchdog] duration elapsed, exiting');
