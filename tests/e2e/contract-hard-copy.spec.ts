import {expect,test,type Page,type Route} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import storedTerms from '../../src/lib/contracts/uploadedTerms.json';
import type {QuoteSnapshot} from '../../src/lib/workflow/pricing';
import type {ContractSnapshot,SalesFlow} from '../../src/lib/workflow/types';

// Browser plugin not available. Exercise the actual online component through
// the repository's Playwright workflow, with commercial API traffic mocked.
test.use({serviceWorkers:'block'});
const projectId='11111111-1111-4111-8111-111111111111';
const pathname=`/contract/${projectId}`;
const endpoint=`/api/sales-flow/${projectId}`;
const messages={en,ar};
type Locale=keyof typeof messages;
type Fixture={project:{sales_status:string;additional_openings_state:null|'requested'|'submitted'};flow:SalesFlow};
let bundle:string;
let stylesheetLinks:string;

function term(locale:Locale,key:string) {return (messages[locale].terms as Record<string,string>)[key]??key;}
function fixture():Fixture {
 const quotation:QuoteSnapshot={version:4,lines:[{opening:{id:'22222222-2222-4222-8222-222222222222',floor:'GF',room:'Office',width:200,height:150,quantity:1,opening_type:'Window',opening_direction:'Sliding'},area:3,system:{id:'alumex',name:'Alumex System',unit:'sqm',rate:250000,quantity:3,total:750000},glass:null,extras:[],total:750000}],additionalItems:[],total:750000,currency:'IQD',createdAt:'2026-11-05T08:00:00Z',preparedBy:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 const contract:ContractSnapshot={number:'CT-HARD-COPY-3',createdAt:'2026-11-05T09:00:00Z',template:'residential',client:{name:'Hard-copy client',mobile:null,client_type:'individual'},project:{name:'Printed contract project',number:'PRJ-HARD-COPY',address:'Baghdad',branch:'Karkh'},branch:'Karkh',quotation:structuredClone(quotation),terms:structuredClone(storedTerms.residential)};
 return {project:{sales_status:'contract_generated',additional_openings_state:null},flow:{project_id:projectId,revision:3,stage:'contract',signed_at:null,quotation,contract,evidence:null}};
}
function recordSignature(state:Fixture,signer:string) {
 state.project.sales_status='transferred_to_operations';
 state.flow={...state.flow,revision:state.flow.revision+1,stage:'signed',signed_at:'2026-11-05T10:00:00Z',evidence:{method:'hard_copy',signer}};
 return state.flow;
}

type BundleStats={hasErrors:()=>boolean;toString:(options:Record<string,unknown>)=>string};
type WebpackRunner=((config:Record<string,unknown>,callback:(error:Error|null,stats?:BundleStats)=>void)=>void)&{DefinePlugin:new(definitions:Record<string,string>)=>unknown};
test.beforeAll(async({request},testInfo)=>{
 const directory=testInfo.outputPath('online-component');await mkdir(directory,{recursive:true});
 const entry=resolve(directory,'entry.tsx'),loader=resolve(directory,'typescript-loader.cjs');
 await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {ContractWorkspace} from '@/components/workflow/ContractWorkspace';createRoot(document.getElementById('root')!).render(<I18nProvider><ContractWorkspace projectId="${projectId}"/></I18nProvider>);`);
 await writeFile(loader,"const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 const require=createRequire(resolve('package.json'));
 const {webpack}=require('next/dist/compiled/webpack/webpack') as {webpack:WebpackRunner};
 await new Promise<void>((accept,reject)=>webpack({
  mode:'production',target:'web',context:process.cwd(),entry,
  output:{path:directory,filename:'component.js'},
  resolve:{extensions:['.tsx','.ts','.js','.json'],alias:{'@':resolve('src')}},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]},
  plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'production'})})],
  optimization:{minimize:false},performance:{hints:false},
 },(error,stats)=>{
  if(error)return reject(error);
  if(!stats||stats.hasErrors())return reject(new Error(stats?.toString({all:false,errors:true})??'Component bundle unavailable.'));
  accept();
 }));
 bundle=await readFile(resolve(directory,'component.js'),'utf8');
 const login=await request.get('/login');expect(login.status()).toBe(200);
 stylesheetLinks=[...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('');
 expect(stylesheetLinks).toContain('/_next/');
});

async function mount(page:Page,locale:Locale,state:Fixture,onMutation:(route:Route,body:Record<string,unknown>)=>Promise<void>) {
 const pageErrors:string[]=[],consoleErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://localhost:3003')return route.abort('blockedbyclient');
  if(url.pathname===pathname&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${messages[locale].app.title}</title>${stylesheetLinks}</head><body><div id="root"></div><script src="/contract-hard-copy-test.js"></script></body></html>`});
  if(url.pathname==='/contract-hard-copy-test.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname===endpoint){
   if(request.method()==='GET')return route.fulfill({json:state});
   expect(request.method()).toBe('POST');return onMutation(route,request.postDataJSON() as Record<string,unknown>);
  }
  if(url.pathname.startsWith('/api/')){expect(request.method()).toBe('GET');return route.fulfill({json:{actor:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'Indoor Sales'},projects:[],openings:[],queue:[],indoorSales:[],outdoorSales:[]}});}
  return route.continue();
 });
 await page.goto(pathname);
 await expect(page).toHaveURL(`http://localhost:3003${pathname}`);
 await expect(page).toHaveTitle(messages[locale].app.title);
 await expect(page.locator('h1')).toHaveText(term(locale,'Client contract'));
 await expect(page.locator('.commercial-document')).toBeVisible();
 await expect(page.locator('nextjs-portal')).toHaveCount(0);
 return {pageErrors,consoleErrors};
}

for(const locale of ['en','ar'] as const){
 test(`${locale}: indoor sales records a hard-copy signature without an upload and retains it after reload`,async({page},testInfo)=>{
  const state=fixture(),originalContract=structuredClone(state.flow.contract),posts:Record<string,unknown>[]=[];
  let release:()=>void=()=>{};const gate=new Promise<void>(accept=>{release=accept;});
  const health=await mount(page,locale,state,async(route,body)=>{
   posts.push(body);expect(body).toEqual({action:'sign',revision:3,method:'hard_copy',signer:'Printed client signer',consent:true});
   await gate;return route.fulfill({json:{flow:recordSignature(state,'Printed client signer')}});
  });
  await page.getByRole('button',{name:term(locale,'Client signed hard copy'),exact:true}).click();
  const signer=page.getByRole('textbox',{name:term(locale,'Client signer’s full name'),exact:true});
  const consent=page.getByRole('checkbox',{name:term(locale,'I confirm the client has signed the complete printed contract shown above.'),exact:true});
  const save=page.getByRole('button',{name:term(locale,'Record hard-copy signature & send to Operations'),exact:true});
  await expect(page.getByText(term(locale,'Record that the client signed a printed copy of this contract. No upload is required.'),{exact:true})).toBeVisible();
  await expect(page.locator('canvas,input[type=file]')).toHaveCount(0);await expect(save).toBeDisabled();
  await consent.check();await expect(save).toBeDisabled();await consent.uncheck();await signer.fill('Printed client signer');await expect(save).toBeDisabled();await consent.check();await expect(save).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('fieldset').screenshot({path:testInfo.outputPath('hard-copy-ready.png')});
  await save.click();await expect.poll(()=>posts.length).toBe(1);await expect(page.locator('fieldset')).toHaveAttribute('disabled','');
  await expect(signer).toBeDisabled();await expect(consent).toBeDisabled();
  for(const label of ['Sign digitally','Upload signed hard copy','Client signed hard copy'])await expect(page.getByRole('button',{name:term(locale,label),exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:term(locale,'Saving signed contract…'),exact:true})).toBeDisabled();
  release();
  const success=page.getByRole('status').filter({hasText:term(locale,'Signed contract saved. The project is now available in Operations.')});
  await expect(success).toBeVisible();
  const paper=page.locator('.commercial-document');await expect(paper).toContainText(term(locale,'Client signed hard copy'));await expect(paper).toContainText('Printed client signer');
  await expect(paper).toContainText('05/11/2026, 13:00');
  await expect(page.getByRole('heading',{name:term(locale,'Complete signing'),exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:term(locale,'Download signed copy'),exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:term(locale,'Change contract type'),exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:term(locale,'Revise quotation'),exact:true})).toHaveCount(0);
  expect(state.flow.contract).toEqual(originalContract);expect(posts).toHaveLength(1);
  await page.reload();await expect(success).toBeVisible();await expect(paper).toContainText(term(locale,'Client signed hard copy'));await expect(paper).toContainText('Printed client signer');
  await page.emulateMedia({media:'print'});await expect(paper).toContainText(term(locale,'Client signed hard copy'));await expect(paper).toContainText('05/11/2026, 13:00');await page.emulateMedia({media:'screen'});
  await paper.locator('section').last().screenshot({path:testInfo.outputPath('hard-copy-recorded.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(health.pageErrors).toEqual([]);expect(health.consoleErrors).toEqual([]);
 });

 test(`${locale}: switching signing methods requires a fresh hard-copy confirmation`,async({page})=>{
  const posts:Record<string,unknown>[]=[],state=fixture();
  const health=await mount(page,locale,state,async(route,body)=>{posts.push(body);return route.fulfill({status:400,json:{error:'Unexpected mutation.'}});});
  const hardCopy=page.getByRole('button',{name:term(locale,'Client signed hard copy'),exact:true});await hardCopy.click();
  await page.getByRole('textbox',{name:term(locale,'Client signer’s full name'),exact:true}).fill('Printed client signer');
  const consent=page.getByRole('checkbox');await consent.check();
  const save=page.getByRole('button',{name:term(locale,'Record hard-copy signature & send to Operations'),exact:true});await expect(save).toBeEnabled();
  await page.getByRole('button',{name:term(locale,'Upload signed hard copy'),exact:true}).click();await expect(consent).not.toBeChecked();await expect(page.locator('input[type=file]')).toHaveCount(1);await consent.check();
  await hardCopy.click();await expect(consent).not.toBeChecked();await expect(save).toBeDisabled();await expect(page.locator('canvas,input[type=file]')).toHaveCount(0);
  await consent.check();await expect(save).toBeEnabled();await page.getByRole('button',{name:term(locale,'Sign digitally'),exact:true}).click();await expect(consent).not.toBeChecked();await expect(page.locator('canvas')).toBeVisible();
  await hardCopy.click();await expect(consent).not.toBeChecked();await expect(save).toBeDisabled();
  expect(posts).toEqual([]);expect(health.pageErrors).toEqual([]);expect(health.consoleErrors).toEqual([]);
 });

 test(`${locale}: rejected hard-copy recording preserves the unsigned contract and supports retry`,async({page})=>{
  const state=fixture(),original=structuredClone(state),posts:Record<string,unknown>[]=[],message='The project changed. Reload and try again.';
  const health=await mount(page,locale,state,async(route,body)=>{
   posts.push(body);
   if(posts.length===1)return route.fulfill({status:409,json:{error:message}});
   return route.fulfill({json:{flow:recordSignature(state,'Retry signer')}});
  });
  await page.getByRole('button',{name:term(locale,'Client signed hard copy'),exact:true}).click();await page.getByRole('textbox',{name:term(locale,'Client signer’s full name'),exact:true}).fill('Retry signer');await page.getByRole('checkbox').check();
  const save=page.getByRole('button',{name:term(locale,'Record hard-copy signature & send to Operations'),exact:true});await save.click();
  await expect(page.getByRole('alert')).toHaveText(term(locale,message));await expect(save).toBeEnabled();expect(state).toEqual(original);expect(posts).toHaveLength(1);
  await expect(page.getByRole('checkbox')).toBeChecked();await expect(page.getByRole('textbox',{name:term(locale,'Client signer’s full name'),exact:true})).toHaveValue('Retry signer');
  await save.click();await expect(page.locator('.commercial-document')).toContainText('Retry signer');await expect(page.getByRole('heading',{name:term(locale,'Complete signing'),exact:true})).toHaveCount(0);expect(posts).toHaveLength(2);
  expect(health.pageErrors).toEqual([]);expect(health.consoleErrors.filter(message=>!message.includes('409'))).toEqual([]);
 });
}
