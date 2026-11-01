import {expect,test,type Page,type Route} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import type {FieldProject} from '../../src/lib/offline/types';
import type {RegistrationOpening} from '../../src/lib/measurements/registrationOpening';

test.use({
 serviceWorkers:'block',
 // Exercise the online API response boundary at every configured viewport.
 // The separate offline tests cover queued phone/tablet edits.
 userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});
const projectId='11111111-1111-4111-8111-111111111111';
const pathname=`/initial-measurements/${projectId}`;
const endpoint=`/api/initial-measurements/${projectId}`;
const messages={en,ar};
type Locale=keyof typeof messages;
type Fixture={project:FieldProject;openings:RegistrationOpening[]};
type Mutation={method:string;body:Record<string,unknown>};
let bundle:string;
let stylesheetLinks:string;

function term(locale:Locale,key:string,replacements:Record<string,string|number>={}) {
 let value=(messages[locale].terms as Record<string,string>)[key]??key;
 for(const [name,replacement] of Object.entries(replacements))value=value.replaceAll(`{${name}}`,String(replacement));
 return value;
}
function fixture():Fixture {
 return {
  project:{id:projectId,project_name:'Completed commercial facades',project_number:'PRJ-0101',building_type:'commercial_building',branch:'Karkh',created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',registeredBy:'Indoor employee',address:'Baghdad',phone:null,created_at:'2026-11-01T08:00:00Z',updated_at:'2026-11-01T08:00:00Z',structure_readiness:'ready',sales_status:'ready_for_quotation',next_follow_up_at:null,project_notes:null},
  openings:Array.from({length:4},(_,index)=>({id:`bbbbbbbb-bbbb-4bbb-8bbb-${String(index+1).padStart(12,'0')}`,floor:'Whole building',room:'Other',otherRoom:`Facade ${index+1}`,workArea:'facade',facadeNumber:index+1,width:1650,height:index<2?380:390,quantity:1,structuralType:'Facade',openingType:null,hasArch:false,hasRollerShutter:false})),
 };
}

type BundleStats={hasErrors:()=>boolean;toString:(options:Record<string,unknown>)=>string};
type WebpackRunner=((config:Record<string,unknown>,callback:(error:Error|null,stats?:BundleStats)=>void)=>void)&{DefinePlugin:new(definitions:Record<string,string>)=>unknown};

test.beforeAll(async({request},testInfo)=>{
 // Mount the actual online component without depending on private accounts or
 // a prebuilt artifact. All measurements API traffic is fulfilled below.
 const directory=testInfo.outputPath('online-component');await mkdir(directory,{recursive:true});
 const entry=resolve(directory,'entry.tsx'),loader=resolve(directory,'typescript-loader.cjs');
 await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {I18nProvider} from '@/components/i18n/I18nProvider';import {InitialMeasurements} from '@/components/measurements/InitialMeasurements';createRoot(document.getElementById('root')!).render(<I18nProvider><InitialMeasurements projectId="${projectId}" role="Indoor Sales"/></I18nProvider>);`);
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

async function mount(page:Page,locale:Locale,state:Fixture,onMutation:(route:Route,mutation:Mutation)=>Promise<void>) {
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(locale=>localStorage.setItem('alumex_locale',locale),locale);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://localhost:3003')return route.abort('blockedbyclient');
  if(url.pathname===pathname&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}</head><body><div id="root"></div><script src="/completed-facade-test.js"></script></body></html>`});
  if(url.pathname==='/completed-facade-test.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname===endpoint){
   if(request.method()==='GET')return route.fulfill({json:{...state,canCancelProject:false,canDelayMeasurements:false}});
   return onMutation(route,{method:request.method(),body:request.postDataJSON() as Record<string,unknown>});
  }
  if(url.pathname.startsWith('/api/')){
   if(request.method()!=='GET')throw new Error('Unexpected business mutation.');
   if(url.pathname.startsWith('/api/measurement-reports/'))return route.fulfill({json:{reports:[]}});
   return route.fulfill({json:{actor:{id:state.project.created_by,name:'Indoor employee',role:'Indoor Sales',branch:'Karkh'},projects:[state.project],openings:[],queue:[],syncedAt:null,indoorSales:[],outdoorSales:[]}});
  }
  return route.continue();
 });
 await page.goto(pathname);
 await expect(page.locator('h1')).toHaveText(messages[locale].initialStep.title);
 await expect(page.getByRole('region',{name:term(locale,'Saved facades'),exact:true})).toBeVisible();
 return errors;
}

for(const locale of ['en','ar'] as const){
 test(`${locale}: completed facades reopen, save facade 5, reload and finish without losing existing dimensions`,async({page},testInfo)=>{
  const state=fixture(),original=structuredClone(state.openings),mutations:Mutation[]=[];
  let releaseReopen:()=>void=()=>{};
  const reopenGate=new Promise<void>(accept=>{releaseReopen=accept;});
  const errors=await mount(page,locale,state,async(route,mutation)=>{
   mutations.push(mutation);
   if(mutation.method==='PATCH'&&mutation.body.action==='reopen'){
    await reopenGate;state.project={...state.project,sales_status:'new_lead'};
    return route.fulfill({json:{project:state.project,salesStatus:'new_lead'}});
   }
   if(mutation.method==='POST'){
    expect(state.project.sales_status).toBe('new_lead');
    const added=mutation.body as unknown as RegistrationOpening;
    expect(added).toMatchObject({structuralType:'Facade',workArea:'facade',facadeNumber:5,floor:'Whole building',room:'Other',otherRoom:'Facade 5',width:1800,height:400,quantity:1,openingType:null,hasArch:false,hasRollerShutter:false});
    state.openings.push(added);return route.fulfill({status:201,json:{id:added.id}});
   }
   expect(mutation).toMatchObject({method:'PATCH',body:{action:'finish'}});
   state.project={...state.project,sales_status:'ready_for_quotation'};
   return route.fulfill({json:{project:state.project,salesStatus:'ready_for_quotation'}});
  });
  const saved=page.getByRole('region',{name:term(locale,'Saved facades'),exact:true});
  const add=saved.getByRole('button',{name:term(locale,'Add another facade'),exact:true});
  const form=page.getByRole('form',{name:term(locale,'Facade measurements'),exact:true});
  await expect(saved.locator('tbody tr')).toHaveCount(4);await expect(add).toBeVisible();
  await add.click();await expect.poll(()=>mutations.length).toBe(1);await expect(add).toBeDisabled();await expect(form).toHaveCount(0);await expect(saved.locator('tbody tr')).toHaveCount(4);
  releaseReopen();await expect(form).toBeVisible();
  const number=form.getByRole('spinbutton',{name:term(locale,'Facade number'),exact:true});
  await expect(number).toHaveValue('5');await expect(number).toBeFocused();
  await form.getByRole('spinbutton',{name:term(locale,'Width (cm)'),exact:true}).fill('1800');
  await form.getByRole('spinbutton',{name:term(locale,'Length (cm)'),exact:true}).fill('400');
  await form.screenshot({path:testInfo.outputPath('facade-5-form.png')});
  await form.getByRole('button',{name:term(locale,'Save facade'),exact:true}).click();
  await expect(saved.locator('tbody tr')).toHaveCount(5);expect(state.openings.slice(0,4)).toEqual(original);
  await expect(saved.locator('tbody tr').last()).toContainText(term(locale,'Facade {number}',{number:5}));
  await expect(saved.locator('tbody tr').last()).toContainText('1,800');await expect(saved.locator('tbody tr').last()).toContainText('400');
  await page.reload();await expect(saved.locator('tbody tr')).toHaveCount(5);expect(state.openings.slice(0,4)).toEqual(original);
  await page.getByRole('button',{name:messages[locale].initialStep.finish,exact:true}).click();
  await expect(add).toBeVisible();await expect(form).toHaveCount(0);await expect(saved.locator('tbody tr')).toHaveCount(5);
  expect(state.project.sales_status).toBe('ready_for_quotation');
  expect(mutations.map(mutation=>[mutation.method,mutation.body.action??mutation.body.structuralType])).toEqual([['PATCH','reopen'],['POST','Facade'],['PATCH','finish']]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await saved.screenshot({path:testInfo.outputPath('completed-five-facades.png')});
 });

 test(`${locale}: denied reopen keeps completed facades closed and never submits a new facade`,async({page})=>{
  const state=fixture(),original=structuredClone(state.openings),mutations:Mutation[]=[];
  const message='Measurements are locked once a quotation has been saved.';
  await mount(page,locale,state,async(route,mutation)=>{mutations.push(mutation);return route.fulfill({status:409,json:{error:message}});});
  const saved=page.getByRole('region',{name:term(locale,'Saved facades'),exact:true});
  const add=saved.getByRole('button',{name:term(locale,'Add another facade'),exact:true});
  await add.click();await expect(page.getByRole('alert')).toHaveText(term(locale,message));
  await expect(add).toBeEnabled();await expect(page.getByRole('form',{name:term(locale,'Facade measurements'),exact:true})).toHaveCount(0);
  await expect(page.getByRole('spinbutton',{name:term(locale,'Facade number'),exact:true})).toHaveCount(0);await expect(saved.locator('tbody tr')).toHaveCount(4);
  expect(mutations).toEqual([{method:'PATCH',body:{action:'reopen'}}]);expect(state.project.sales_status).toBe('ready_for_quotation');expect(state.openings).toEqual(original);
 });

 test(`${locale}: direct completed-facade addition stays hidden for locked, cancelled, delayed and additional-opening tasks`,async({page})=>{
  const state=fixture(),mutations:Mutation[]=[];
  await mount(page,locale,state,async(route,mutation)=>{mutations.push(mutation);return route.fulfill({status:409,json:{error:'Unexpected mutation blocked.'}});});
  const base=structuredClone(state.project);
  const cases:Partial<FieldProject>[]=[
   {sales_status:'contract_signed'},
   {sales_status:'cancelled',client_cancelled_at:'2026-11-01T09:00:00Z'},
   {measurement_delayed:true,measurement_delay_note:'Client asked to visit later'},
   {additional_openings_state:'requested'},
   {additional_openings_state:'submitted'},
  ];
  for(const changes of cases){
   state.project={...base,...changes};await page.reload();
   await expect(page.getByRole('region',{name:term(locale,'Saved facades'),exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:term(locale,'Add another facade'),exact:true})).toHaveCount(0);
   await expect(page.getByRole('form',{name:term(locale,'Facade measurements'),exact:true})).toHaveCount(0);
  }
  expect(mutations).toEqual([]);
 });
}
