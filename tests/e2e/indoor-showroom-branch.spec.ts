import {expect,test,type Page} from '@playwright/test';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

// Browser connector tools are unavailable. The existing Playwright component
// harness uses only localhost:3003 and intercepts every business request.
const executablePath=[resolve('.next/cache/qa-client-name/chrome-headless-shell-mac-arm64/chrome-headless-shell'),resolve('artifacts/mini-crm-review-20261015/browser/chrome-headless-shell-mac-arm64/chrome-headless-shell')].find(path=>existsSync(path));
test.use({serviceWorkers:'block',video:'off',launchOptions:{executablePath}});
const origin='http://localhost:3003';
const actorA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorB='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const dictionaries={en,ar};
let bundle:string,styles:string;

test.beforeAll(async({request},testInfo)=>{
 const directory=testInfo.outputPath('showroom-component');await mkdir(directory,{recursive:true});
 const entry=resolve(directory,'entry.tsx'),loader=resolve(directory,'loader.cjs'),transport=resolve(directory,'transport.ts'),store=resolve(directory,'store.ts'),map=resolve(directory,'map.tsx');
 await writeFile(transport,"export const fieldFetch=(url:string,init?:RequestInit)=>fetch(url,init);export const isFieldOnline=()=>true;export const isDeviceWorkspace=()=>false;export const prepareOffline=async()=>null;");
 await writeFile(store,'export const readFieldState=async()=>null;');
 await writeFile(map,"import React from 'react';export function ProjectLocationPicker({onChange,onSearchSelect}:{onChange:(value:{latitude:number;longitude:number})=>void;onSearchSelect:(address:string)=>void}){return <button type='button' onClick={()=>{onChange({latitude:33.3,longitude:44.4});onSearchSelect('Showroom fixture location');}}>Set fixture location</button>;}");
 await writeFile(entry,`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/components/i18n/I18nProvider';import{OutdoorIntake}from'@/components/intake/OutdoorIntake';import type{FieldState}from'@/lib/offline/types';function Harness(){const params=new URLSearchParams(location.search);const[state,setState]=useState<Pick<FieldState,'actor'|'outdoorSales'>>({actor:{id:'${actorA}',name:'Showroom fixture',role:'Indoor Sales',branch:(params.get('branch')??'Karkh')as'Karkh'|'Rasafa'},outdoorSales:[]});(window as unknown as {updateShowroom:(branch:'Karkh'|'Rasafa',id?:string)=>void}).updateShowroom=(branch,id)=>setState(current=>({...current,actor:{...current.actor,branch,...(id?{id,name:'Fresh showroom employee'}:{})}}));return <OutdoorIntake initialEmployeeState={state}/>;}createRoot(document.getElementById('root')!).render(<I18nProvider><Harness/></I18nProvider>);`);
 await writeFile(loader,"const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};");
 const require=createRequire(resolve('package.json')),{webpack}=require('next/dist/compiled/webpack/webpack');
 type Stats={hasErrors():boolean;toString(options:{all:boolean;errors:boolean}):string};
 await new Promise<void>((accept,reject)=>webpack({mode:'production',target:'web',context:process.cwd(),entry,output:{path:directory,filename:'component.js'},resolve:{extensions:['.tsx','.ts','.js','.json'],alias:{'@/lib/offline/client':transport,'@/lib/offline/store':store,'@/components/projects/ProjectLocationPicker':map,'@':resolve('src')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'production'})})],optimization:{minimize:false},performance:{hints:false}},(error:Error|null,stats:Stats)=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):accept()));
 bundle=await readFile(resolve(directory,'component.js'),'utf8');const login=await request.get('/login');expect(login.status()).toBe(200);styles=[...(await login.text()).matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('');
});

async function prepare(page:Page,locale:'en'|'ar',branch:'Karkh'|'Rasafa'){
 const posts:Record<string,unknown>[]=[],errors:string[]=[],unexpected:string[]=[];
 await page.clock.setFixedTime(new Date('2026-11-15T20:59:00Z'));await page.addInitScript(value=>localStorage.setItem('alumex_locale',value),locale);
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){unexpected.push(`${request.method()} ${url.origin}`);return route.abort('blockedbyclient');}
  if(url.pathname==='/api/sales-intake'&&request.method()==='POST'){posts.push(request.postDataJSON());return route.fulfill({status:201,json:{projectId,pending:false}});}
  if(!['GET','HEAD'].includes(request.method())){unexpected.push(`${request.method()} ${url.pathname}`);return route.fulfill({status:405,json:{error:'Unexpected write blocked'}});}
  if(url.pathname==='/qa/indoor-showroom'&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/qa/indoor-showroom.js"></script></body></html>`});
  if(url.pathname==='/qa/indoor-showroom.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(url.pathname==='/mini-crm'&&request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>Showroom saved fixture</h1></body></html>'});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{}});
  return route.continue();
 });
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`/qa/indoor-showroom?branch=${branch}`);await expect(page.getByRole('heading',{name:dictionaries[locale].registration.title,exact:true})).toBeVisible();return{posts,errors,unexpected};
}
async function values(page:Page){return page.locator('input[name="projectBranch"]').evaluateAll(inputs=>inputs.map(input=>(input as HTMLInputElement).value));}
async function fillAndSave(page:Page,locale:'en'|'ar',actorId=actorA){
 const dictionary=dictionaries[locale];await page.getByRole('textbox',{name:dictionary.mobileIntake.name,exact:true}).fill('Showroom branch fixture');await page.getByRole('textbox',{name:dictionary.mobileIntake.phone,exact:true}).fill('07000000000');await page.getByRole('button',{name:'Set fixture location',exact:true}).click();await page.locator('input[name="readiness"][value="not_ready"]').check();await page.locator('#outdoor-assignee').selectOption(actorId);await page.getByRole('button',{name:dictionary.registration.save,exact:true}).click();await expect(page).toHaveURL(`${origin}/mini-crm`);
}
for(const locale of ['en','ar']as const){
 for(const branch of ['Karkh','Rasafa']as const)test(`${locale}: ${branch} showroom registers its own branch without outdoor calendar rotation`,async({page},testInfo)=>{
  const{posts,errors,unexpected}=await prepare(page,locale,branch);expect(await values(page)).toEqual(branch==='Karkh'?['Karkh','Governorates']:['Rasafa']);await expect(page.locator('#project-branch-rotation')).toHaveCount(0);
  await page.locator(`input[name="projectBranch"][value="${branch}"]`).check();await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(await values(page)).toEqual(branch==='Karkh'?['Karkh','Governorates']:['Rasafa']);await expect(page.locator(`input[name="projectBranch"][value="${branch}"]`)).toBeChecked();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`${locale}-${branch}-showroom.png`),fullPage:true});await fillAndSave(page,locale);expect(posts).toHaveLength(1);expect(posts[0]).toMatchObject({registrationActorId:actorA,project:{branch,assignedOutdoorSalesId:actorA}});expect(errors).toEqual([]);expect(unexpected).toEqual([]);
 });
 test(`${locale}: fresh verified Rasafa props replace a mounted Karkh showroom state`,async({page})=>{
  const{posts,errors,unexpected}=await prepare(page,locale,'Karkh');await page.locator('input[name="projectBranch"][value="Karkh"]').check();await page.evaluate(()=>{(window as unknown as{updateShowroom:(branch:string)=>void}).updateShowroom('Rasafa');});await expect.poll(()=>values(page)).toEqual(['Rasafa']);await expect(page.locator('input[name="projectBranch"][value="Rasafa"]')).toBeChecked();await expect(page.locator('#project-branch-assignment')).toContainText(locale==='en'?'Rasafa':'الرصافة');await expect(page.locator('#project-governorate')).toHaveCount(0);await fillAndSave(page,locale);expect(posts[0]).toMatchObject({registrationActorId:actorA,project:{branch:'Rasafa'}});expect(errors).toEqual([]);expect(unexpected).toEqual([]);
 });
 test(`${locale}: fresh account props replace both showroom branch and submitted actor`,async({page})=>{
  const{posts,errors,unexpected}=await prepare(page,locale,'Karkh');await page.locator('input[name="projectBranch"][value="Karkh"]').check();await page.locator('#outdoor-assignee').selectOption(actorA);await page.evaluate(id=>{(window as unknown as{updateShowroom:(branch:string,id:string)=>void}).updateShowroom('Rasafa',id);},actorB);await expect.poll(()=>values(page)).toEqual(['Rasafa']);await expect(page.locator(`#outdoor-assignee option[value="${actorA}"]`)).toHaveCount(0);await fillAndSave(page,locale,actorB);expect(posts[0]).toMatchObject({registrationActorId:actorB,project:{branch:'Rasafa',assignedOutdoorSalesId:actorB}});expect(errors).toEqual([]);expect(unexpected).toEqual([]);
 });
}
