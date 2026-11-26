import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Explicit directories keep failed calibration and interrupted runs out of the
// comparison. Partial summaries identify which interrupted samples are valid.
const root = process.cwd();
const options = Object.fromEntries(process.argv.slice(2).map(value => { const index = value.indexOf('='); assert.ok(index > 2); return [value.slice(2, index), value.slice(index + 1)]; }));
function samples(paths) {
 const rows = [];
 for (const path of paths.split(',')) {
  const directory = realpathSync(resolve(root, path));
  assert.ok(directory.startsWith(resolve(root, 'artifacts/performance-20261126') + sep));
  const names = readdirSync(directory);
  const partial = names.includes('partial-valid-summary.json') ? JSON.parse(readFileSync(resolve(directory, 'partial-valid-summary.json'), 'utf8')) : null;
  for (const name of names.filter(name => /^(dashboard|projects|overview|follow-ups)-\d+\.json$/.test(name))) {
   const row = JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
   if (!partial || partial.validScenarios.includes(row.scenario)) rows.push(row);
  }
 }
 return rows;
}
const before = samples(options.before), after = samples(options.after);
const median = values => { assert.ok(values.length); return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]; };
const summarize = rows => ({ samples: rows.length, firstDataRenderMs: median(rows.map(row => row.firstDataRenderMs)),
 firstContentfulPaintMs: median(rows.map(row => row.paints.find(paint => paint.name === 'first-contentful-paint')?.timeMs ?? 0)),
 longTaskTimeMs: median(rows.map(row => row.longTasks.reduce((sum, task) => sum + task.duration, 0))),
 apiRequests: median(rows.map(row => row.initialApiRequests)), apiResponseBodyBytes: median(rows.map(row => row.initialResponses.filter(response => response.kind === 'api').reduce((sum, response) => sum + response.decodedBytes, 0))),
 initialJavaScriptBytes: median(rows.map(row => row.initialResponses.filter(response => response.kind === 'javascript').reduce((sum, response) => sum + response.decodedBytes, 0))),
 domElements: median(rows.map(row => row.domElements)), polling: rows.find(row => row.polling)?.polling ?? null });
const comparison = {};
for (const scenario of ['dashboard', 'projects', 'overview', 'follow-ups']) {
 const original = summarize(before.filter(row => row.scenario === scenario)), revised = summarize(after.filter(row => row.scenario === scenario));
 comparison[scenario] = { before: original, after: revised,
  responseBodyReductionPercent: (1 - revised.apiResponseBodyBytes / original.apiResponseBodyBytes) * 100,
  firstDataRenderReductionPercent: (1 - revised.firstDataRenderMs / original.firstDataRenderMs) * 100,
  domReductionPercent: (1 - revised.domElements / original.domElements) * 100 };
}
for (const [phase, option] of [['before', 'before-polling'], ['after', 'after-polling']]) if (options[option]) {
 const rows = samples(options[option]);
 const polling = rows.find(row => row.polling)?.polling;
 assert.ok(polling, `Missing ${phase} polling evidence`);
 comparison['follow-ups'][phase].polling = polling;
}
const output = resolve(root, options.output ?? 'artifacts/performance-20261126/comparison.json');
assert.ok(output.startsWith(resolve(root, 'artifacts/performance-20261126') + sep));
const report = { scope: 'Controlled local actual-component Chromium benchmark with sanitized deterministic API fixtures; response-body bytes are fulfilled fixture bytes, not production telemetry or database timings.',
 conditions: { mobileViewport: '390x844', locale: 'en', cpuSlowdown: 4, initialSamplesPerScenario: 3,
  frameworkBoundary: 'Standalone real-component Webpack bundles, Next font metadata shim, identical frozen production CSS; full Next server/auth/layout and real backend latency excluded.',
  delivery: '80ms plus estimated gzip size at 187500 bytes/second per response; decoded bodies fulfilled by Playwright', polling: 'Real 65-second wall-clock window after visiting 10 cards, with the first history section left visible' },
 beforeDirectories: options.before.split(','), afterDirectories: options.after.split(','), comparison };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ report: output, comparison }));
