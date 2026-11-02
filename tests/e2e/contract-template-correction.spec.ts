import {expect,test,type Page,type Route} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import storedTerms from '../../src/lib/contracts/uploadedTerms.json';
import type {QuoteSnapshot} from '../../src/lib/workflow/pricing';
import type {ContractSnapshot,SalesFlow} from '../../src/lib/workflow/types';

test.use({serviceWorkers:'block'});
const projectId='11111111-1111-4111-8111-111111111111';
const pathname=`/contract/${projectId}`;
const endpoint=`/api/sales-flow/${projectId}`;
const messages={en,ar};
type Locale=keyof typeof messages;
type Template='commercial'|'residential';
type Fixture={project:{sales_status:string;additional_openings_state:null|'requested'|'submitted'};flow:SalesFlow};
let bundle:string;
let stylesheetLinks:string;

function term(locale:Locale,key:string) {return (messages[locale].terms as Record<string,string>)[key]??key;}
function caption(template:Template) {return template==='commercial'?'Commercial supply & installation contract / عقد بيع وتركيب ألمنيوم — مشروع تجاري':'Residential supply & installation contract / عقد بيع وتركيب ألمنيوم — مشروع سكني';}
function firstPayment(template:Template) {return storedTerms[template].find(section=>section.title==='payment terms')!.text.split('\n')[0];}
function fixture():Fixture {
 const quotation:QuoteSnapshot={version:4,lines:[{opening:{id:'22222222-2222-4222-8222-222222222222',floor:'GF',room:'Office',width:500,height:800,quantity:2,opening_type:'Window',opening_direction:'Sliding'},area:80,system:{id:'alumex',name:'Alumex System',unit:'sqm',rate:250000,quantity:80,total:20000000},glass:null,extras:[],total:20000000}],additionalItems:[],discount:{percent:5,subtotal:20000000,amount:1000000},total:19000000,currency:'IQD',createdAt:'2026-11-01T08:00:00Z',preparedBy:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 const contract:ContractSnapshot={number:'CT-TEMPLATE-3',createdAt:'2026-11-01T09:00:00Z',template:'commercial',client:{name:'Company client with residential work',mobile:null,client_type:'company'},project:{name:'Residential house project',number:'PRJ-TEMPLATE',address:'Baghdad',branch:'Karkh'},branch:'Karkh',quotation:structuredClone(quotation),terms:structuredClone(storedTerms.commercial)};
 return {project:{sales_status:'contract_generated',additional_openings_state:null},flow:{project_id:projectId,revision:3,stage:'contract',signed_at:null,quotation,contract,evidence:null}};
}
function correctTemplate(state:Fixture) {
 state.flow={...state.flow,revision:state.flow.revision+1,contract:{...state.flow.contract!,number:'CT-TEMPLATE-4',template:'residential',terms:structuredClone(storedTerms.residential)}};
 return state.flow;
}

type BundleStats={hasErrors:()=>boolean;toString:(options:Record<string,unknown>)=>string};
type WebpackRunner=((config:Record<string,unknown>,callback:(error:Error|null,stats?:BundleStats)=>void)=>void)&{DefinePlugin:new(definitions:Record<string,string>)=>unknown};

test.beforeAll(async({request},testInfo)=>{
 // Mount the actual online component without depending on private accounts or
 // a prebuilt artifact. All contract API traffic is fulfilled below.
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
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://localhost:3003')return route.abort('blockedbyclient');
  if(url.pathname===pathname&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/contract-template-test.js"></script></body></html>`});
  if(url.pathname==='/contract-template-test.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname===endpoint){
   if(request.method()==='GET')return route.fulfill({json:state});
   expect(request.method()).toBe('POST');return onMutation(route,request.postDataJSON() as Record<string,unknown>);
  }
  if(url.pathname.startsWith('/api/')){expect(request.method()).toBe('GET');return route.fulfill({json:{actor:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'Indoor Sales'},projects:[],openings:[],queue:[],indoorSales:[],outdoorSales:[]}});}
  return route.continue();
 });
 await page.goto(pathname);await expect(page.locator('h1')).toHaveText(term(locale,'Client contract'));await expect(page.locator('.commercial-document')).toBeVisible();return errors;
}
async function drawSignature(page:Page) {
 const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const blank=await canvas.evaluate(node=>(node as HTMLCanvasElement).toDataURL());const box=await canvas.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width*.15,box!.y+box!.height*.3);await page.mouse.down();await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.65,{steps:12});await page.mouse.up();
 await expect.poll(()=>canvas.evaluate(node=>(node as HTMLCanvasElement).toDataURL())).not.toBe(blank);return blank;
}
for(const locale of ['en','ar'] as const){
 test(`${locale}: change corporate contract to residential terms without changing the company or quotation and require a fresh signature`,async({page},testInfo)=>{
  const state=fixture(),originalQuote=structuredClone(state.flow.quotation),originalContract=structuredClone(state.flow.contract),posts:Record<string,unknown>[]=[];
  let release:()=>void=()=>{};const gate=new Promise<void>(accept=>{release=accept;});
  const errors=await mount(page,locale,state,async(route,body)=>{posts.push(body);expect(body).toEqual({action:'change-contract-template',revision:3,template:'residential',confirmed:true});await gate;return route.fulfill({json:{flow:correctTemplate(state)}});});
  const paper=page.locator('.commercial-document'),change=page.getByRole('button',{name:term(locale,'Change contract type'),exact:true}),editor=page.getByRole('region',{name:term(locale,'Change contract type'),exact:true});
  await expect(paper).toContainText(term(locale,caption('commercial')));await expect(paper).toContainText(firstPayment('commercial'));
  await change.click();const select=editor.getByRole('combobox',{name:term(locale,'Contract type'),exact:true});const save=editor.getByRole('button',{name:term(locale,'Save contract type'),exact:true});
  await expect(select).toHaveValue('commercial');await expect(save).toBeDisabled();await editor.getByRole('button',{name:term(locale,'Cancel changes'),exact:true}).click();await expect(editor).toHaveCount(0);expect(posts).toHaveLength(0);
  const signer=page.getByRole('textbox',{name:term(locale,'Client signer’s full name')});await signer.fill('Previous review signer');const blank=await drawSignature(page);
  const consent=page.getByRole('checkbox');await consent.check();const sign=page.locator('fieldset > button').last();await expect(sign).toHaveText(term(locale,'Save signed contract & send to Operations'));await expect(sign).toBeEnabled();
  await change.click();await select.selectOption('residential');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await editor.screenshot({path:testInfo.outputPath('contract-type-selection.png')});await save.dblclick();await expect.poll(()=>posts.length).toBe(1);await expect(editor.getByRole('button').first()).toBeDisabled();await expect(sign).toBeDisabled();
  await expect(paper).toContainText(firstPayment('commercial'));release();
  await expect(page.getByText(term(locale,'Contract type changed. Review the new terms before signing.'),{exact:true})).toBeVisible();await expect(editor).toHaveCount(0);
  await expect(paper).toContainText(term(locale,caption('residential')));await expect(paper).not.toContainText(term(locale,caption('commercial')));await expect(paper).toContainText(firstPayment('residential'));await expect(paper).not.toContainText(firstPayment('commercial'));
  expect(state.flow.quotation).toEqual(originalQuote);expect(state.flow.contract!.quotation).toEqual(originalQuote);expect(state.flow.contract!.client.client_type).toBe('company');expect(originalContract!.template).toBe('commercial');expect(state.flow.revision).toBe(4);
  await expect(paper.locator('.document-total')).toContainText('19,000,000');await expect(signer).toHaveValue('');await expect(consent).not.toBeChecked();await expect.poll(()=>page.locator('canvas').evaluate(node=>(node as HTMLCanvasElement).toDataURL())).toBe(blank);
  await signer.fill('New review signer');await consent.check();await expect(sign).toBeDisabled();expect(posts).toHaveLength(1);
  await page.emulateMedia({media:'print'});await expect(paper).toContainText(firstPayment('residential'));await expect(paper).not.toContainText(firstPayment('commercial'));
  if((page.viewportSize()?.width??0)>=1000)await page.pdf({path:testInfo.outputPath('corrected-residential-contract.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'});
  await paper.locator('.document-note').first().screenshot({path:testInfo.outputPath('residential-contract-title.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 });

 test(`${locale}: contract correction clears an uploaded signed copy and resets signing method, name and consent`,async({page})=>{
  const state=fixture(),posts:Record<string,unknown>[]=[];await mount(page,locale,state,async(route,body)=>{posts.push(body);expect(body.action).toBe('change-contract-template');return route.fulfill({json:{flow:correctTemplate(state)}});});
  await page.getByRole('button',{name:term(locale,'Upload signed hard copy'),exact:true}).click();await page.getByRole('textbox',{name:term(locale,'Client signer’s full name')}).fill('Upload signer');await page.locator('input[type=file]').setInputFiles({name:'old-commercial-signed.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nold commercial fixture\n%%EOF')});await page.getByRole('checkbox').check();
  const sign=page.getByRole('button',{name:term(locale,'Save signed contract & send to Operations'),exact:true});await expect(sign).toBeEnabled();
  await page.getByRole('button',{name:term(locale,'Change contract type'),exact:true}).click();const editor=page.getByRole('region',{name:term(locale,'Change contract type'),exact:true});await editor.getByRole('combobox',{name:term(locale,'Contract type'),exact:true}).selectOption('residential');await editor.getByRole('button',{name:term(locale,'Save contract type'),exact:true}).click();
  await expect(page.locator('.commercial-document')).toContainText(firstPayment('residential'));await expect(page.locator('canvas')).toBeVisible();await expect(page.locator('input[type=file]')).toHaveCount(0);await expect(page.getByRole('textbox',{name:term(locale,'Client signer’s full name')})).toHaveValue('');await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(sign).toBeDisabled();
  await page.getByRole('button',{name:term(locale,'Upload signed hard copy'),exact:true}).click();expect(await page.locator('input[type=file]').evaluate(node=>(node as HTMLInputElement).files?.length)).toBe(0);await expect(page.getByText('old-commercial-signed.pdf',{exact:true})).toHaveCount(0);expect(posts).toHaveLength(1);
 });

 test(`${locale}: a denied correction preserves the existing contract and allows a clear retry without altering quotation totals`,async({page})=>{
  const state=fixture(),original=structuredClone(state),posts:Record<string,unknown>[]=[];const message='The project changed. Reload and try again.';
  await mount(page,locale,state,async(route,body)=>{posts.push(body);return route.fulfill({status:409,json:{error:message}});});
  await page.getByRole('button',{name:term(locale,'Change contract type'),exact:true}).click();const editor=page.getByRole('region',{name:term(locale,'Change contract type'),exact:true});await editor.getByRole('combobox',{name:term(locale,'Contract type'),exact:true}).selectOption('residential');await editor.getByRole('button',{name:term(locale,'Save contract type'),exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText(term(locale,message));await expect(page.locator('.commercial-document')).toContainText(firstPayment('commercial'));await expect(page.locator('.commercial-document')).not.toContainText(firstPayment('residential'));expect(state).toEqual(original);expect(posts).toHaveLength(1);await expect(editor.getByRole('button',{name:term(locale,'Save contract type'),exact:true})).toBeEnabled();
 });

 test(`${locale}: signed, evidenced, transferred and measurement-pending contracts cannot expose template correction`,async({page})=>{
  const state=fixture(),original=structuredClone(state),posts:Record<string,unknown>[]=[];await mount(page,locale,state,async(route,body)=>{posts.push(body);return route.fulfill({status:409,json:{error:'Unexpected mutation blocked.'}});});
  await expect(page.getByRole('button',{name:term(locale,'Change contract type'),exact:true})).toBeVisible();
  for(const mode of ['signed','evidence','transferred','requested','submitted','cancelled'] as const){
   state.project=structuredClone(original.project);state.flow=structuredClone(original.flow);
   if(mode==='signed'){state.flow.signed_at='2026-11-01T10:00:00Z';state.project.sales_status='contract_signed';}
   if(mode==='evidence')state.flow.evidence={method:'upload',signer:'Existing signer',path:'existing-signed.pdf'};
   if(mode==='transferred'){state.flow.stage='operations';state.project.sales_status='transferred_to_operations';}
   if(mode==='requested'||mode==='submitted')state.project.additional_openings_state=mode;
   if(mode==='cancelled')state.project.sales_status='cancelled';
   await page.reload();await expect(page.locator('.commercial-document')).toBeVisible();await expect(page.getByRole('button',{name:term(locale,'Change contract type'),exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:term(locale,'Change contract type'),exact:true})).toHaveCount(0);
  }
  expect(posts).toEqual([]);
 });
}
