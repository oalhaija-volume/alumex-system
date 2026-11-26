import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import type { Database } from '../../src/lib/supabase/database.types';
import type { ContractDocumentRevision } from '../../src/lib/contracts/documentRevisions';
import type { ContractSnapshot, QuotationRevision, SalesFlow } from '../../src/lib/workflow/types';

// Private read-only evidence stays outside source control. The browser renders
// actual frozen snapshots behind local fixture routes; it never authenticates
// to production or sends a business mutation.
const snapshotPath = resolve('.next/cache/client-name-project-repair-1795689689492-1a505ded-877d-434e-94e7-296756baa2d5/after.json');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
type SavedSnapshot = {
  project: Database['public']['Tables']['projects']['Row'];
  client: Database['public']['Tables']['clients']['Row'];
  flow: SalesFlow;
  history: QuotationRevision[];
  revisions: ContractDocumentRevision[];
};
let saved: SavedSnapshot, bundle = '', styles = '';
const number = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 }).format(value);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compact = (value: string) => value.replace(/[\s\u202a-\u202e\u2066-\u2069]/g, '');

// Decode embedded font maps to check the exported PDF itself, rather than only
// the print DOM. Only dimension/count/price matches are reported, never text
// containing client identities or other private contract fields.
async function pdfText(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const unicode = (hex: string) => (hex.match(/.{4}/g) ?? []).map(code => String.fromCharCode(parseInt(code, 16))).join('');
  let text = '';
  for (const page of document.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    const maps = new Map<string, Map<string, string>>();
    for (const [name, reference] of fonts?.entries() ?? []) {
      const font = document.context.lookup(reference);
      if (!(font instanceof PDFDict)) continue;
      const stream = document.context.lookup(font.get(PDFName.of('ToUnicode')));
      if (!(stream instanceof PDFRawStream)) continue;
      const cmap = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      const map = new Map<string, string>();
      for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const entry of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(entry[1].toUpperCase(), unicode(entry[2]));
      }
      for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        for (const entry of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
          const start = parseInt(entry[1], 16), end = parseInt(entry[2], 16), first = parseInt(entry[3], 16);
          for (let glyph = start; glyph <= end; glyph++) map.set(glyph.toString(16).padStart(entry[1].length, '0').toUpperCase(), String.fromCharCode(first + glyph - start));
        }
      }
      maps.set(name.toString().slice(1), map);
    }
    const decode = (font: string, hex: string) => {
      const map = maps.get(font), length = map?.keys().next().value?.length ?? 4;
      let result = '';
      for (let index = 0; index < hex.length; index += length) result += map?.get(hex.slice(index, index + length).toUpperCase()) ?? '';
      return result;
    };
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map(item => document.context.lookup(item)) : [contents];
    let font = '';
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue;
      const content = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      for (const token of content.matchAll(/\/([\w-]+)\s+[\d.-]+\s+Tf|<([\da-f]+)>\s*Tj|\[([^\]]*)\]\s*TJ|\(([^)]*)\)\s*Tj/gi)) {
        if (token[1]) font = token[1];
        else if (token[2]) text += decode(font, token[2]);
        else if (token[3]) text += [...token[3].matchAll(/<([\da-f]+)>/gi)].map(item => decode(font, item[1])).join('');
        else if (token[4]) text += token[4];
      }
    }
    text += '\n';
  }
  return { text: compact(text), pages: document.getPageCount() };
}

async function verifyRows(schedule: Locator, contract: ContractSnapshot) {
  const rows = schedule.locator('tbody.document-opening-group');
  await expect(rows).toHaveCount(contract.quotation.lines.length);
  const actual = await rows.evaluateAll(groups => groups.map(group => {
    const cells = group.querySelector('tr')!.querySelectorAll(':scope > td');
    return JSON.stringify([cells[1].querySelector('bdi')?.textContent?.trim(), cells[2].textContent?.trim(),
      cells[4].textContent?.trim().match(/^[\d,.]+/)?.[0], cells[5].textContent?.trim(), cells[7].textContent?.trim()]);
  }));
  const expected = contract.quotation.lines.map(line => JSON.stringify([
    `${number(line.opening.width)} × ${number(line.opening.height)}`, number(line.opening.quantity ?? 1),
    number(line.system.quantity), number(line.system.rate), number(line.total),
  ]));
  assert.deepEqual(actual.sort(), expected.sort(), 'Every stored opening must retain its dimensions, quantity, charge basis, rate and total.');
  const summary = schedule.locator('.document-total');
  const billableArea = contract.quotation.lines.reduce((sum, line) => sum + line.system.quantity, 0);
  const displayedArea = Number(await summary.locator('[data-area]').getAttribute('data-area'));
  assert.ok(Math.abs(displayedArea - billableArea) < 1e-6, 'The printed summary must retain saved billable area.');
  const displayedTotal = (await summary.locator('strong').innerText()).replace(/[^\d]/g, '');
  assert.equal(displayedTotal, String(contract.quotation.total), 'The stored contract amount must be unchanged.');
}

test.beforeAll(async ({ request }, testInfo) => {
  test.skip(!existsSync(snapshotPath), 'Private saved-contract evidence is unavailable in this checkout.');
  mkdirSync(testInfo.project.outputDir, { recursive: true, mode: 0o700 });
  chmodSync(testInfo.project.outputDir, 0o700);
  saved = JSON.parse(readFileSync(snapshotPath, 'utf8')) as SavedSnapshot;
  const output = testInfo.outputPath('private-component');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const entry = resolve(output, 'entry.tsx'), loader = resolve(output, 'loader.cjs'), cssLoader = resolve(output, 'css-loader.cjs');
  writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ContractWorkspace projectId="${saved.project.id}"/></I18nProvider>);`, { mode: 0o600 });
  writeFileSync(loader, `const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`, { mode: 0o600 });
  writeFileSync(cssLoader, `const postcss=require('postcss');const local=require('next/dist/compiled/postcss-modules-local-by-default');const scope=require('next/dist/compiled/postcss-modules-scope');module.exports=function(source){const done=this.async();postcss([local(),scope({generateScopedName:name=>'qa_saved_'+name})]).process(source,{from:this.resourcePath}).then(result=>{const names={};result.root.walkRules(':export',rule=>{rule.walkDecls(decl=>{names[decl.prop]=decl.value;});rule.remove();});done(null,'const style=document.createElement("style");style.textContent='+JSON.stringify(result.root.toString())+';document.head.appendChild(style);export default '+JSON.stringify(names)+';');},done);};`, { mode: 0o600 });
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({ mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry, output: { path: output, filename: 'saved-contract.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /\.module\.css$/, use: [cssLoader] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) }), new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors()
    ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
  bundle = readFileSync(resolve(output, 'saved-contract.js'), 'utf8');
  const login = await request.get('/login'); expect(login.status()).toBe(200);
  styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: saved project 0097 keeps every opening in revised and original contracts on screen and PDF`, async ({ page, context }, testInfo) => {
  test.setTimeout(120000);
  if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: 950 });
  const before = digest(saved), errors: string[] = [], unexpected: string[] = [];
  const projectId = saved.project.id, pathname = `/contract/${projectId}`;
  const correction = saved.revisions.find(row => row.revision_reason === 'client_name_correction' && !row.superseded_at);
  assert.ok(correction && saved.flow.contract, 'The private evidence must contain both saved contract versions.');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/saved-contract.js"></script></body></html>`;
  await context.addInitScript(value => { localStorage.setItem('alumex_locale', value); Reflect.deleteProperty(Navigator.prototype, 'serviceWorker'); }, locale);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    // The saved site coordinates trigger map tiles outside the document. Keep
    // those reads local too, without sending the real location to a map host.
    if (url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=', 'base64') });
    if (url.origin !== 'http://localhost:3003') { unexpected.push('External browser request blocked.'); return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { unexpected.push('Business mutation blocked.'); return route.fulfill({ status: 405, json: { error: 'Read-only evidence' } }); }
    if (url.pathname === pathname && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/saved-contract.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    if (url.pathname === `/api/sales-flow/${projectId}`) return route.fulfill({ json: saved });
    if (url.pathname === `/api/projects/${projectId}/contract-revisions`) return route.fulfill({ json: { documentRevisions: saved.revisions } });
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { actor: { id: 'fixture-admin', role: 'Admin' }, projects: [{ ...saved.project, client_name: saved.client.client_name, phone: saved.client.mobile, registeredBy: 'Saved employee' }], indoorSales: [], outdoorSales: [] } });
    if (url.pathname.startsWith('/api/')) { unexpected.push('Unexpected business read blocked.'); return route.fulfill({ status: 404, json: {} }); }
    return route.continue();
  });
  await page.goto(pathname);
  const selector = page.locator('select').first();
  await expect(selector).toHaveValue(correction.id);
  for (const [label, contract, value] of [['revised', correction.contract, correction.id], ['original', saved.flow.contract, 'original']] as const) {
    await selector.selectOption(value);
    const paper = page.locator('.commercial-document'), schedule = paper.locator('[data-contract-opening-schedule]');
    await expect(schedule).toBeVisible();
    await verifyRows(schedule, contract);
    const screenshot = testInfo.outputPath(`${locale}-${label}-private-screen.png`);
    await page.screenshot({ path: screenshot, fullPage: true }); chmodSync(screenshot, 0o600);
    await page.emulateMedia({ media: 'print' });
    try {
      await expect(schedule).toBeVisible();
      await verifyRows(schedule, contract);
      await expect(schedule).toHaveCSS('break-before', 'page');
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.commercial-document img')).map(image => image.decode())); });
      const path = testInfo.outputPath(`${locale}-${label}-private-contract.pdf`);
      const bytes = await page.pdf({ path, printBackground: true, preferCSSPageSize: true }); chmodSync(path, 0o600);
      const exported = await pdfText(bytes), expectedDimensions = new Map<string, number>();
      for (const line of contract.quotation.lines) {
        const key = compact(`${number(line.opening.width)} × ${number(line.opening.height)}`);
        expectedDimensions.set(key, (expectedDimensions.get(key) ?? 0) + 1);
      }
      for (const [dimensions, count] of expectedDimensions) assert.ok(exported.text.split(dimensions).length - 1 >= count, 'The PDF must contain every stored opening dimension pair.');
      assert.ok(exported.text.includes(number(contract.quotation.total)), 'The PDF must contain the saved contract amount.');
      assert.ok(exported.text.includes(number(contract.quotation.lines.reduce((sum, line) => sum + line.system.quantity, 0))), 'The PDF must contain saved billable area.');
      assert.ok(exported.pages > await paper.locator('[data-agreement-page]').count(), 'The PDF must include opening schedule pages after the agreement pages.');
      writeFileSync(testInfo.outputPath(`${locale}-${label}-private-verification.json`), JSON.stringify({ rows: contract.quotation.lines.length, physicalOpenings: contract.quotation.lines.reduce((sum, line) => sum + (line.opening.quantity ?? 1), 0), pdfPages: exported.pages, allDimensionPairsPresent: true, savedAreaAndAmountPresent: true }), { mode: 0o600 });
    } finally { await page.emulateMedia({ media: 'screen' }); }
  }
  assert.equal(digest(saved), before, 'The frozen evidence must remain unchanged.');
  assert.equal(errors.length, 0, 'The saved contract must render without browser errors.');
  assert.equal(unexpected.length, 0, 'All browser reads must remain inside the isolated fixture.');
});
