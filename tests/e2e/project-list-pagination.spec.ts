import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

// No Browser plugin is available. Use the repository's isolated Playwright
// component harness, synthetic API records and a local browser executable.
const executable = resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell');
test.use({ serviceWorkers: 'block', video: 'off', launchOptions: { executablePath: existsSync(executable) ? executable : undefined } });
let bundle = '', styles = '';
const uuid=(value:number)=>`${value.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
let projectListFixture: (options:{count:number})=>{get:(query:string)=>Promise<{status:number;body:unknown}>};
test.beforeAll(async ({ request }, info) => {
 // Playwright transforms static .mjs imports into CommonJS. Load this Node
 // fixture natively so its repository-relative import.meta paths stay valid.
 const nativeImport=new Function('url','return import(url)') as (url:string)=>Promise<{projectListFixture:typeof projectListFixture}>;
 ({projectListFixture}=await nativeImport(pathToFileURL(resolve('tests/helpers/project-list-fixture.mjs')).href));
 const output = info.outputPath('component');mkdirSync(output,{recursive:true});
 const entry=resolve(output,'entry.tsx'),loader=resolve(output,'loader.cjs');
 writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/components/i18n/I18nProvider';import{ProjectWorkspace}from'@/components/workflow/ProjectWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ProjectWorkspace/></I18nProvider>);`);
 writeFileSync(loader,`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
 const require=createRequire(resolve('package.json'));const {webpack}=require('next/dist/compiled/webpack/webpack');
 type Stats={hasErrors():boolean;toString(options:{all:boolean;errors:boolean}):string};
 await new Promise<void>((accept,reject)=>webpack({mode:'production',target:'web',context:process.cwd(),devtool:false,entry,output:{path:output,filename:'project-list.js'},resolve:{extensions:['.tsx','.ts','.js','.json'],alias:{'@':resolve('src')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'production'})}),new webpack.optimize.LimitChunkCountPlugin({maxChunks:1})],optimization:{minimize:false},performance:{hints:false}},(error:Error|null,stats:Stats)=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):accept()));
 bundle=readFileSync(resolve(output,'project-list.js'),'utf8');const login=await request.get('/login');expect(login.status()).toBe(200);styles=[...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('');
});

for(const locale of ['en','ar'] as const)test(`${locale}: project pages, server search and attribution filters retain complete counts`,async({page,context},info)=>{
 if(info.project.name==='mobile-chromium')await page.setViewportSize({width:375,height:950});
 const fixture=projectListFixture({count:103});const terms:Record<string,string>=JSON.parse(readFileSync(resolve(`messages/${locale}.json`),'utf8')).terms;const term=(value:string)=>terms[value]??value;
 const errors:string[]=[],unexpected:string[]=[],reads:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(value=>{localStorage.setItem('alumex_locale',value);Reflect.deleteProperty(Navigator.prototype,'serviceWorker');},locale);
 const html=`<!doctype html><html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/project-list.js"></script></body></html>`;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://localhost:3003'||request.method()!=='GET'){unexpected.push(`${request.method()} ${url.pathname}`);return route.fulfill({status:405,json:{error:'Unexpected request'}});}
  if(url.pathname==='/projects'&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/qa/project-list.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname==='/api/workspace'){reads.push(url.search);const result=await fixture.get(url.search);return route.fulfill({status:result.status,json:result.body});}
  if(/^\/api\/projects\/.+\/follow-ups$/.test(url.pathname))return route.fulfill({json:{entries:[]}});
  if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);return route.fulfill({status:404,json:{}});}
  return route.continue();
 });
 await page.goto('/projects');await expect(page.locator('article[id^="project-"]')).toHaveCount(25);
 const firstPageIds=await page.locator('article[id^="project-"]').evaluateAll(nodes=>nodes.map(node=>node.id));
 await expect(page.getByRole('button',{name:'Outdoor colleague',exact:true})).toContainText('40');
 await page.getByRole('button',{name:term('Next'),exact:true}).click();await expect(page.getByText(term('Page {page} of {pages}').replace('{page}','2').replace('{pages}','5'),{exact:true})).toBeVisible();
 const secondPageIds=await page.locator('article[id^="project-"]').evaluateAll(nodes=>nodes.map(node=>node.id));expect(secondPageIds.some(id=>firstPageIds.includes(id))).toBe(false);
 await page.getByRole('searchbox').fill('PRJ-٠٠٧٨');await expect(page.locator('article[id^="project-"]')).toHaveCount(1);await expect(page.locator(`#project-${uuid(78)}`)).toBeVisible();
 expect(reads.some(search=>new URLSearchParams(search).get('q')==='PRJ-٠٠٧٨')).toBe(true);
 await page.getByRole('button',{name:term('Clear filters'),exact:true}).click();await expect(page.locator('article[id^="project-"]')).toHaveCount(25);
 await page.getByRole('button',{name:'Outdoor colleague',exact:true}).click();await expect(page.locator('article[id^="project-"]')).toHaveCount(25);await expect(page.getByRole('button',{name:term('Next'),exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:term('Registration date order'),exact:true}).selectOption('oldest');await expect(page.locator(`#project-${uuid(1)}`)).toBeVisible();
 await page.goto(`/projects#project-${uuid(2)}`);await expect(page.locator(`#project-${uuid(2)}`)).toBeVisible();await expect(page.locator(`#project-${uuid(2)}`)).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('project-list-pagination.png'),fullPage:true});expect(errors).toEqual([]);expect(unexpected).toEqual([]);
});
