// No Browser connector is available: use repository-local Playwright.
// Run --phase=before --source=<frozen repository snapshot> or --phase=after
// --source=. . Use --polling-ms=0 for initial samples and a separate one-sample
// --scenarios=follow-ups --polling-ms=65000 run for real polling counts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { performanceApiResponse, performanceFixtures, performanceProjectId } from './performance-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.cwd(), root, 'Run this benchmark inside the repository root.');
const options = Object.fromEntries(process.argv.slice(2).map(value => { assert.match(value, /^--[a-z-]+=.+$/); const split = value.indexOf('='); return [value.slice(2, split), value.slice(split + 1)]; }));
assert.ok(['before', 'after'].includes(options.phase), 'Use --phase=before|after.');
const sourceRoot = realpathSync(resolve(root, options.source ?? '.'));
assert.ok(sourceRoot === root || sourceRoot.startsWith(root + sep), 'Source must remain inside this repository.');
const samples = Number(options.samples ?? 3), pollingMs = Number(options['polling-ms'] ?? 65000);
assert.ok(samples >= 1 && samples <= 7 && pollingMs >= 0 && pollingMs <= 120000);
const output = resolve(root, `artifacts/performance-20261126/${options.phase}-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const buildOutput = resolve(root, `.next/cache/performance-bundles-${options.phase}-${Date.now()}`);
mkdirSync(buildOutput, { recursive: true, mode: 0o700 });
const fixture = performanceFixtures();
const sha = value => createHash('sha256').update(value).digest('hex');
const delay = milliseconds => new Promise(accept => setTimeout(accept, milliseconds));
const network = { latencyMs: 80, bytesPerSecond: 187500, cpuSlowdown: 4 };
const scenarios = (options.scenarios ?? 'dashboard,projects,overview,follow-ups').split(',');
assert.ok(scenarios.every(value => ['dashboard', 'projects', 'overview', 'follow-ups'].includes(value)), 'Unknown scenario.');
const components = { dashboard: ['SalesDashboard', 'workflow/SalesDashboard', ''], projects: ['ProjectWorkspace', 'workflow/ProjectWorkspace', ''],
 overview: ['ProjectOverview', 'workflow/ProjectOverview', ` projectId="${performanceProjectId}"`], 'follow-ups': ['ProjectWorkspace', 'workflow/ProjectWorkspace', ''] };
const entry = {};
for (const scenario of scenarios) {
 const [name, path, props] = components[scenario];
 const file = resolve(buildOutput, `${scenario}.entry.tsx`);
 writeFileSync(file, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {${name}} from '@/components/${path}';createRoot(document.getElementById('root')!).render(<I18nProvider><${name}${props}/></I18nProvider>);`, { flag: 'wx', mode: 0o600 });
 entry[scenario] = file;
}
const loader = resolve(buildOutput, 'typescript-loader.cjs'), cssLoader = resolve(buildOutput, 'css-loader.cjs');
const fontStub = resolve(buildOutput, 'font-metadata.mjs');
writeFileSync(fontStub, `export const Noto_Sans_Arabic=()=>({variable:'performance-dashboard-arabic',className:'performance-dashboard-arabic',style:{fontFamily:'Arial'}});`, { flag: 'wx', mode: 0o600 });
writeFileSync(loader, `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`, { flag: 'wx', mode: 0o600 });
writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'performance_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`, { flag: 'wx', mode: 0o600 });
const require = createRequire(resolve(root, 'package.json'));
const { webpack } = require('next/dist/compiled/webpack/webpack');
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const minimizer = { apply(compiler) { compiler.hooks.compilation.tap('PerformanceMinifier', compilation => {
 compilation.hooks.processAssets.tapPromise({ name: 'PerformanceMinifier', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE }, async assets => {
  for (const [name, asset] of Object.entries(assets)) if (name.endsWith('.js')) {
   const result = await swc.minify(String(asset.source()), { compress: true, mangle: true });
   compilation.updateAsset(name, new webpack.sources.RawSource(result.code));
  }
 });
}); } };
console.log(JSON.stringify({ phase: options.phase, event: 'build-start', source: relative(root, sourceRoot), output: relative(root, output), bundles: relative(root, buildOutput) }));
let sourceFingerprints = {};
if (options['bundle-source']) {
 const saved = realpathSync(resolve(root, options['bundle-source']));
 assert.ok(saved.startsWith(root + sep), 'Saved bundles must remain inside the repository.');
 for (const name of readdirSync(saved).filter(name => /\.(bundle|chunk)\.js$/.test(name))) copyFileSync(resolve(saved, name), resolve(buildOutput, name));
 const provenance = resolve(saved, 'source-fingerprints.json');
 if (existsSync(provenance)) {
  sourceFingerprints = JSON.parse(readFileSync(provenance, 'utf8'));
  for (const [path, fingerprint] of Object.entries(sourceFingerprints)) assert.equal(sha(readFileSync(resolve(sourceRoot, path))), fingerprint, `Source changed after the saved build: ${path}`);
 }
} else {
 const compiled = await new Promise((accept, reject) => webpack({ mode: 'production', target: 'web', context: root, devtool: false, entry,
 output: { path: buildOutput, filename: '[name].bundle.js', chunkFilename: '[id].chunk.js', publicPath: '/performance-assets/' },
 resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve(sourceRoot, 'src'), 'next/font/google$': fontStub }, modules: [resolve(root, 'node_modules'), 'node_modules'] },
 module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
 plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
 optimization: { minimize: true, minimizer: [minimizer], splitChunks: false }, performance: { hints: false },
}, (error, stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept(stats)));
 sourceFingerprints = Object.fromEntries([...compiled.compilation.fileDependencies].filter(file => (file.startsWith(resolve(sourceRoot, 'src') + sep) || file.startsWith(resolve(sourceRoot, 'messages') + sep)) && statSync(file).isFile())
  .sort().map(file => [relative(sourceRoot, file), sha(readFileSync(file))]));
}
writeFileSync(resolve(buildOutput, 'source-fingerprints.json'), JSON.stringify(sourceFingerprints, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

const assetsRoot = realpathSync(resolve(root, options['assets-source'] ?? options.source ?? '.'));
assert.ok(assetsRoot === root || assetsRoot.startsWith(root + sep));
const staticRoot = resolve(assetsRoot, '.next/static');
function files(directory) { return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)]) : []; }
const productionAssets = files(staticRoot).filter(file => ['.js', '.css'].includes(extname(file)));
const productionCss = productionAssets.filter(file => extname(file) === '.css').map(file => readFileSync(file, 'utf8')).join('\n');
const bundleFiles = readdirSync(buildOutput).filter(file => /\.(bundle|chunk)\.js$/.test(file));
const bundleSizes = bundleFiles.map(name => { const body = readFileSync(resolve(buildOutput, name)); return { name, bytes: body.length, gzipBytes: gzipSync(body).length, sha256: sha(body) }; });
const assetSummary = { importedSourceFiles: Object.keys(sourceFingerprints).length, sourceFingerprintSha256: sha(JSON.stringify(sourceFingerprints)), productionBuildPresent: productionAssets.length > 0, productionJavaScriptFiles: productionAssets.filter(file => extname(file) === '.js').length,
 productionJavaScriptBytes: productionAssets.filter(file => extname(file) === '.js').reduce((sum, file) => sum + statSync(file).size, 0),
 productionCssBytes: Buffer.byteLength(productionCss), harnessBundles: bundleSizes };
if (options['build-only'] === 'true') {
 writeFileSync(resolve(output, 'build-summary.json'), JSON.stringify({ phase: options.phase, source: relative(root, sourceRoot), bundles: relative(root, buildOutput), assets: assetSummary }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
 console.log(JSON.stringify({ phase: options.phase, event: 'build-only-complete', bundles: relative(root, buildOutput), report: relative(root, resolve(output, 'build-summary.json')) }));
 process.exit(0);
}
const executable = resolve(root, '.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const browser = await chromium.launch({ headless: true, ...(existsSync(executable) ? { executablePath: executable } : {}) });
const all = [];
console.log(JSON.stringify({ phase: options.phase, event: 'timed-browser-start' }));
try {
 for (const scenario of scenarios) for (const sample of (scenario === 'follow-ups' ? [...Array(samples).keys()].reverse() : [...Array(samples).keys()])) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
   locale: 'en-US', timezoneId: 'Asia/Baghdad', serviceWorkers: 'block' });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: network.cpuSlowdown });
  const responses = [], errors = [], blocked = [];
  page.on('pageerror', error => { errors.push(error.message); console.log(JSON.stringify({ phase: options.phase, scenario, event: 'browser-error', message: error.message })); void page.close(); });
  await context.addInitScript(() => {
   localStorage.setItem('alumex_locale', 'en');
   Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
   window.__performanceBenchmark = { firstDataRenderMs: null, longTasks: [] };
   try { new PerformanceObserver(list => window.__performanceBenchmark.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true }); } catch { /* Chromium supports long task entries. */ }
   const observe = () => { if (window.__performanceBenchmark.firstDataRenderMs === null && document.body?.textContent.includes('Benchmark project 001')) window.__performanceBenchmark.firstDataRenderMs = performance.now(); };
   new MutationObserver(observe).observe(document, { subtree: true, childList: true, characterData: true });
  });
  async function deliver(route, value, contentType, kind) {
   const raw = Buffer.isBuffer(value) ? value : Buffer.from(value), body = gzipSync(raw);
   const record = { path: new URL(route.request().url()).pathname + new URL(route.request().url()).search, kind, decodedBytes: raw.length, gzipEquivalentBytes: body.length, startedAtMs: Date.now() };
   responses.push(record);
   await delay(network.latencyMs + body.length / network.bytesPerSecond * 1000);
   try { await route.fulfill({ status: 200, contentType, headers: { 'cache-control': 'no-store' }, body: raw }); } catch (error) { if (!page.isClosed()) throw error; }
  }
  await context.route('**/*', async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin !== 'http://localhost:3003') { blocked.push(`${request.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
   if (request.method() !== 'GET') { blocked.push(`${request.method()} ${url.pathname}`); return route.abort('blockedbyclient'); }
   if (url.pathname.startsWith('/performance-assets/')) {
    const name = url.pathname.slice('/performance-assets/'.length);
    if (name === 'styles.css') return deliver(route, productionCss, 'text/css', 'css');
    assert.ok(bundleFiles.includes(name), `Unexpected benchmark asset ${name}`);
    return deliver(route, readFileSync(resolve(buildOutput, name)), 'text/javascript', 'javascript');
   }
   if (url.pathname.startsWith('/api/')) {
    const result = performanceApiResponse(url, fixture);
    assert.notEqual(result, undefined, `Unexpected benchmark API ${url.pathname}`);
    return deliver(route, JSON.stringify(result), 'application/json', 'api');
   }
   if (url.pathname.startsWith('/performance/')) return deliver(route, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/performance-assets/styles.css"><title>Controlled performance benchmark</title></head><body><div id="root"></div><script src="/performance-assets/${scenario}.bundle.js"></script></body></html>`, 'text/html', 'document');
   if (url.pathname.startsWith('/_next/static/')) {
    const file = resolve(staticRoot, url.pathname.slice('/_next/static/'.length));
    assert.ok(file.startsWith(staticRoot + sep) && existsSync(file), 'Unknown frozen static asset');
    return deliver(route, readFileSync(file), extname(file) === '.woff2' ? 'font/woff2' : 'application/octet-stream', 'font');
   }
   if (url.pathname.startsWith('/contracts/') || url.pathname.startsWith('/images/')) {
    const file = resolve(sourceRoot, 'public', '.' + url.pathname);
    if (existsSync(file)) return deliver(route, readFileSync(file), extname(file) === '.svg' ? 'image/svg+xml' : 'application/octet-stream', 'image');
   }
   blocked.push(`GET ${url.pathname}`);return route.abort('blockedbyclient');
  });
  const wallStart = Date.now();
  await page.goto(`http://localhost:3003/performance/${scenario}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByText('Benchmark project 001', { exact: true }).first().waitFor({ state: 'attached', timeout: 120000 });
  await page.evaluate(() => new Promise(accept => requestAnimationFrame(() => requestAnimationFrame(accept))));
  await delay(300);
  const initialEnd = responses.length;
  const metrics = await page.evaluate(() => ({ ...window.__performanceBenchmark, paints: performance.getEntriesByType('paint').map(entry => ({ name: entry.name, timeMs: entry.startTime })),
   domElements: document.querySelectorAll('*').length, projectCards: document.querySelectorAll('article[id^="project-"]').length, nowMs: performance.now() }));
  const measurement = { scenario, sample: sample + 1, wallReadyMs: Date.now() - wallStart, ...metrics,
   initialRequests: initialEnd, initialApiRequests: responses.slice(0, initialEnd).filter(row => row.kind === 'api').length,
   initialDecodedBytes: responses.slice(0, initialEnd).reduce((sum, row) => sum + row.decodedBytes, 0),
   initialGzipEquivalentBytes: responses.slice(0, initialEnd).reduce((sum, row) => sum + row.gzipEquivalentBytes, 0), initialResponses: responses.slice(0, initialEnd) };
  if (scenario === 'follow-ups' && sample === 0 && pollingMs) {
   const cards = page.locator('article[id^="project-"]');
   for (let index = 0; index < Math.min(10, await cards.count()); index++) {
    await cards.nth(index).locator('h4').last().scrollIntoViewIfNeeded();await delay(250);
   }
   await cards.first().locator('h4').last().scrollIntoViewIfNeeded();await delay(600);
   const start = responses.length;
   console.log(JSON.stringify({ phase: options.phase, event: 'initial-timings-finished-polling-start', realDurationMs: pollingMs }));
   await delay(pollingMs);
   measurement.polling = { mode: 'real-wall-clock', durationMs: pollingMs, visitedCards: Math.min(10, await cards.count()), requests: responses.slice(start).length,
    followUpRequests: responses.slice(start).filter(row => row.path.includes('/follow-ups')).length,
    decodedBytes: responses.slice(start).reduce((sum, row) => sum + row.decodedBytes, 0), responses: responses.slice(start) };
  }
  assert.deepEqual(errors, [], 'The browser must render without exceptions');
  assert.deepEqual(blocked, [], 'No requests may leave the isolated fixture boundary');
  all.push(measurement);
  writeFileSync(resolve(output, `${scenario}-${sample + 1}.json`), JSON.stringify(measurement, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: options.phase, scenario, sample: sample + 1, firstDataRenderMs: measurement.firstDataRenderMs, apiRequests: measurement.initialApiRequests, decodedBytes: measurement.initialDecodedBytes }));
  await context.close();
 }
} finally { await browser.close(); }
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = { phase: options.phase, source: relative(root, sourceRoot), bundles: relative(root, buildOutput), cssSource: relative(root, assetsRoot), samples, fixture: { projects: 200, followUpsPerProject: 30, overviewOpenings: 30, quoteHistories: 12, documentRevisions: 3, fingerprintSha256: sha(JSON.stringify(fixture)) },
 conditions: { browser: 'local Chromium headless', viewport: '390x844', locale: 'en', deviceScaleFactor: 1, cpuSlowdown: network.cpuSlowdown,
  delivery: 'Decoded Playwright response bodies paced per response at 80ms + estimated gzipBytes/187500 bytes-per-second; concurrent requests retain independent pacing. Gzip sizes are estimates, not measured wire traffic.', cache: 'fresh context each sample, no service workers',
  boundary: 'Actual application React components in separate optimized Webpack entry bundles; deterministic API fixtures. The standalone harness substitutes Next font metadata and uses identical frozen production CSS in both phases. It does not measure the full Next server/auth/layout, production users, or database latency.' },
 assets: assetSummary, scenarios: Object.fromEntries(scenarios.map(scenario => { const rows = all.filter(row => row.scenario === scenario); return [scenario, {
  medianFirstDataRenderMs: median(rows.map(row => row.firstDataRenderMs)), medianWallReadyMs: median(rows.map(row => row.wallReadyMs)), medianInitialApiRequests: median(rows.map(row => row.initialApiRequests)),
  medianInitialDecodedBytes: median(rows.map(row => row.initialDecodedBytes)), medianInitialGzipEquivalentBytes: median(rows.map(row => row.initialGzipEquivalentBytes)), medianDomElements: median(rows.map(row => row.domElements)),
  ...(rows.find(row => row.polling) ? { polling: rows.find(row => row.polling).polling } : {}) }]; })), measurements: all };
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ phase: options.phase, passed: true, summary: relative(root, resolve(output, 'summary.json')) }));
