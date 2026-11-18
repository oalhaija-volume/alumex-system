import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Render the actual contract component with synthetic contracts only. Block all
// API requests and mutations; no client, contract, or signature is changed.
const output = resolve('.next/cache/qa-contract-delivery-duration');
const localHeadless = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(localHeadless) ? localHeadless : undefined } });
const routePath = '/qa/contract-delivery-duration';

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'browser-entry.tsx'), `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/I18nProvider';
    import {Agreement2027Document} from '@/components/contracts/Agreement2027Document';
    import {emptyAgreement2027Fields,buildAgreement2027Snapshot} from '@/lib/contracts/agreement2027';
    import {agreement2027Terms} from '@/lib/contracts/agreement2027Content';
    import type {ContractSnapshot} from '@/lib/workflow/types';
    const quotation={lines:[],additionalItems:[{id:'fixture-swing',name:'A Swing Door',unit:'item',rate:1700000,quantity:4,total:6800000}],total:6800000,currency:'IQD' as const,version:2,createdAt:'2026-11-18T08:00:00Z',preparedBy:'fixture-author'};
    function fixture(amended:boolean):ContractSnapshot{
      const terms=agreement2027Terms('residential').map(term=>({...term}));
      if(amended){
        terms[3].text+='\\nسعر باب السوينغ الواحد هو (1,000) دولار أمريكي، أو ما يعادله بالدينار العراقي حسب سعر الصرف في يوم السداد.';
        const paragraphs=terms[14].text.split('\\n');
        paragraphs[0]='مدة تنفيذ المشروع للمراحل الجاهزة هي (30) ثلاثون يوماً تقويمياً، مع استثناء حالات القوة القاهرة وفترات التوقف أو التأخير التي يتسبب بها الفريق الأول.';
        terms[14].text=paragraphs.join('\\n');
      }
      const fields=emptyAgreement2027Fields();
      fields.clientLegalName='عميل اختبار مدة التسليم';fields.ownerName=fields.clientLegalName;
      fields.clientClassification='فرد';fields.stateAtSigning='ready';
      return {number:amended?'CT-DURATION-AMENDED':'CT-DURATION-STANDARD',createdAt:'2026-11-18T08:00:00Z',createdBy:'fixture-author',template:'residential',branch:'Rasafa',quotation:structuredClone(quotation),client:{name:fields.clientLegalName,mobile:null,client_type:'individual'},project:{name:amended?'مشروع الاختبار المعدّل':'مشروع الاختبار القياسي',number:'PRJ-DURATION-FIXTURE',address:'عنوان اختباري'},terms,agreement2027:buildAgreement2027Snapshot(quotation,'residential',fields)};
    }
    createRoot(document.getElementById('root')!).render(<I18nProvider><main className="mx-auto w-full max-w-5xl space-y-12 p-4 sm:p-8"><section data-fixture-contract="amended"><Agreement2027Document contract={fixture(true)}/></section><section data-fixture-contract="standard"><Agreement2027Document contract={fixture(false)}/></section></main></I18nProvider>);
  `);
  writeFileSync(resolve(output, 'typescript-loader.cjs'), "const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,removeComments:true}}).outputText;};");
  const require = createRequire(resolve('package.json'));
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  type Stats = { hasErrors(): boolean; toString(options: { all: boolean; errors: boolean }): string };
  await new Promise<void>((accept, reject) => webpack({
    mode: 'production', target: 'web', context: process.cwd(), devtool: false,
    entry: resolve(output, 'browser-entry.tsx'), output: { path: output, filename: 'contract.bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.json'], alias: { '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [resolve(output, 'typescript-loader.cjs')] }] },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    optimization: { minimize: false }, performance: { hints: false },
  }, (error: Error | null, stats: Stats) => error ? reject(error) : stats.hasErrors() ? reject(new Error(stats.toString({ all: false, errors: true }))) : accept()));
});

for (const locale of ['en', 'ar'] as const) test(`${locale}: saved delivery terms control each contract cover without changing another contract`, async ({ page, context, request }, testInfo) => {
  const errors: string[] = [], unexpected: string[] = [];
  const login = await request.get('/login');
  expect(login.status()).toBe(200);
  const styles = [...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Contract delivery fixture</title></head><body><div id="root"></div><script src="/qa/contract-delivery-duration.bundle.js"></script></body></html>`;
  await context.addInitScript(value => localStorage.setItem('alumex_locale', value), locale);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') { unexpected.push(`${req.method()} ${url.hostname}`); return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || url.pathname.startsWith('/api/')) {
      unexpected.push(`${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 405, json: { error: 'Business requests blocked by fixture' } });
    }
    if (url.pathname === routePath && req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/qa/contract-delivery-duration.bundle.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(output, 'contract.bundle.js')) });
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(routePath);
  const amended = page.locator('[data-fixture-contract="amended"]');
  const standard = page.locator('[data-fixture-contract="standard"]');
  const amendedCover = amended.locator('[data-agreement-section="handover"]');
  const standardCover = standard.locator('[data-agreement-section="handover"]');
  await expect(amendedCover.getByText('30 يوم تقويمي وفق شروط العقد', { exact: true })).toBeVisible();
  await expect(amendedCover).not.toContainText('60 يوم عمل');
  await expect(standardCover.getByText('60 يوم عمل وفق شروط العقد', { exact: true })).toBeVisible();
  await expect(standardCover).not.toContainText('30 يوم تقويمي');
  await expect(amended.locator('[data-agreement-clause="15"]')).toContainText('(30) ثلاثون يوماً تقويمياً');
  await expect(amended.locator('[data-agreement-clause="15"]')).not.toContainText('(60)');
  await expect(standard.locator('[data-agreement-clause="15"]')).toContainText('(60)');
  await expect(amended.locator('[data-agreement-clause="4"]')).toContainText('(1,000) دولار أمريكي');
  await expect(amended.locator('[data-agreement-clause="4"]')).toContainText('سعر الصرف في يوم السداد');
  await expect(standard.locator('[data-agreement-clause="4"]')).not.toContainText('(1,000)');
  await expect(amended.locator('[data-agreement-clause="15"]')).toContainText('أيهما يحدث لاحقاً');
  await expect(standard.locator('[data-agreement-clause="15"]')).toContainText('أيهما يحدث لاحقاً');
  await expect(amendedCover).toContainText('6,800,000');
  await expect(standardCover).toContainText('6,800,000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await amendedCover.screenshot({ path: testInfo.outputPath(`${locale}-amended-calendar-delivery.png`) });
  await standardCover.screenshot({ path: testInfo.outputPath(`${locale}-standard-working-delivery.png`) });
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
