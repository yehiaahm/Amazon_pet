import { readFileSync } from 'node:fs';
import { runStage, printStageSummary } from './lib/loadrunner.mjs';
import { mixedJourney } from './lib/journeys.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));
const result = await runStage({ concurrency: 5, durationSec: 10, fixture, journeyFn: mixedJourney, label: 'smoke-stage' });
printStageSummary(result);
