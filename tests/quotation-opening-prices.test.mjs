import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

function load(path,dependencies={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};
 new Function('require','exports',code)(name=>{
  if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}
const catalogRules=load('../src/lib/workflow/catalogRules.ts');
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':catalogRules});
const messages=Object.fromEntries(['en','ar'].map(locale=>[locale,JSON.parse(readFileSync(new URL(`../messages/${locale}.json`,import.meta.url),'utf8'))]));
const catalog=[
 {id:'system',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:240000,is_active:true},
 {id:'glass',name:'Low-E Glass',category:'glass_option',unit:'sqm',unit_price:20000,is_active:true},
 {id:'shutter',name:'Roller Shutter - Foam',category:'addon',unit:'item',unit_price:30000,is_active:true},
 {id:'bars',name:'Georgian bars',category:'addon',unit:'meter',unit_price:5000,is_active:true},
 {id:'standalone',name:'A Swing Door',category:'standalone_product',unit:'item',unit_price:100000,is_active:true},
];
const charge=(id,name,unit,rate,quantity)=>({id,name,unit,rate,quantity,total:Math.round(rate*quantity)});

function quotation(firstRate=470000,discount=0) {
 const system={...charge('system','Alumex System','sqm',firstRate,2),rateSource:'quotation'};
 const glass=charge('glass','Low-E Glass','sqm',20000,2);
 const extras=[charge('shutter','Roller Shutter - Foam','item',30000,2),{...charge('roller-shutter-motor:shutter','Roller shutter motor','item',125000,2),motorFor:'shutter'},charge('bars','Georgian bars','meter',5000,3)];
 const lines=[
  {opening:{id:'edited',floor:'GF',room:'Office',width:50,height:100,quantity:2,opening_type:'Window',opening_direction:'Sliding',has_roller_shutter:true},area:1,system,glass,extras,total:system.total+glass.total+extras.reduce((sum,item)=>sum+item.total,0)},
  {opening:{id:'untouched',floor:'GF',room:'Living',width:200,height:150,quantity:1,opening_type:'Window',opening_direction:'Sliding'},area:3,system:charge('system','Alumex System','sqm',240000,3),glass:null,extras:[],total:720000},
 ];
 const additionalItems=[charge('standalone','A Swing Door','item',100000,1)];
 return pricing.applyQuotationDiscount({version:2,lines,additionalItems,total:lines.reduce((sum,line)=>sum+line.total,0)+100000,currency:'IQD',createdAt:'2026-10-24T08:00:00Z',preparedBy:'fixture-author'},discount);
}

function freeze(value) {
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}
function i18n(locale) {
 const formatNumber=(value,maximumFractionDigits=4)=>new Intl.NumberFormat(locale==='ar'?'ar-IQ':'en-GB',{numberingSystem:'latn',maximumFractionDigits}).format(value);
 return {
  locale,direction:locale==='ar'?'rtl':'ltr',
  term(value,replacements={}) {return (messages[locale].terms[value]??value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match);},
  formatNumber,formatMoney:value=>formatNumber(value,0)+(locale==='ar'?' د.ع':' IQD'),formatDate:()=> '24/10/2026',errorMessage:value=>value,
 };
}
function components(locale) {
 const translations=i18n(locale);
 const shared={'react':React,'react/jsx-runtime':jsxRuntime,'@/components/i18n/I18nProvider':{useI18n:()=>translations},'@/lib/workflow/pricing':pricing};
 const indicators=load('../src/components/workflow/OpeningAreaIndicator.tsx',shared);
 const document=load('../src/components/workflow/CommercialDocument.tsx',{...shared,'./OpeningAreaIndicator':indicators});
 return {translations,shared,indicators,document};
}
const text=html=>html.replace(/<[^>]*>/g,'').replaceAll('&amp;','&');
function openingRows(html) {
 return [...html.matchAll(/<tbody\b[^>]*class="document-opening-group[^\"]*"[^>]*>([\s\S]*?)<\/tbody>/g)].map(group=>[...group[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row=>[...row[1].matchAll(/<td\b[^>]*class="[^\"]*\bdocument-table-number\b[^\"]*"[^>]*>([\s\S]*?)<\/td>/g)].map(cell=>text(cell[1]))));
}
function checkSavedPrices(html,translations,discount) {
 const {formatNumber:number,formatMoney:money,term}=translations;
 const rows=openingRows(html);
 assert.deepEqual(rows,[
  [
   ['2',`2 ${term('m²')}`,number(470000),number(940000),number(1305000)],
   [`2 ${term('m²')}`,number(20000),number(40000)],
   [`2 ${term('item')}`,number(30000),number(60000)],
   [`2 ${term('item')}`,number(125000),number(250000)],
   [`3 ${term('m')}`,number(5000),number(15000)],
  ],
  [['1',`3 ${term('m²')}`,number(240000),number(720000),number(720000)]],
 ]);
 assert.ok(html.includes(term('Minimum billable area: 1 m² per window.')));
 const summary=new Map([...html.matchAll(/<dt>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(match=>[text(match[1]),text(match[2])]));
 assert.equal(summary.get(term('Total opening area')),`4 ${term('m²')}`,'Measured area includes repetitions once and excludes billing minimums');
 const displayedTotal=text(html.match(/<div class="document-total">[\s\S]*?<strong>([\s\S]*?)<\/strong>/)[1]);
 const openingTotals=rows.map(group=>Number(group[0].at(-1).replaceAll(',','')));
 assert.equal(openingTotals.reduce((sum,value)=>sum+value,0)+100000,2125000,'Displayed opening totals plus the standalone item reconcile to the saved subtotal');
 assert.equal(displayedTotal,money(discount?2018750:2125000));
 if(discount){
  assert.equal(summary.get(term('Subtotal')),money(2125000));
  assert.equal(summary.get(term('Discount (5%)')),money(-106250));
 }
 assert.ok(!html.includes('data-client-system-rate'),'There is no common-rate explanation or redistribution');
}

for(const locale of ['en','ar'])for(const discount of [0,5])test(`${locale} schedule displays saved opening rates and accessories exactly with ${discount}% discount`,()=>{
 const {document,translations}=components(locale);
 const saved=freeze(quotation(470000,discount));
 const before=structuredClone(saved);
 const html=renderToStaticMarkup(React.createElement(document.OpeningSchedule,{quote:saved,showOpeningAreaTotal:true,showAreaColors:true}));
 checkSavedPrices(html,translations,discount);
 assert.deepEqual(saved,before,'Rendering must not mutate persisted charges or discounts');
});

for(const locale of ['en','ar'])for(const discount of [0,5])test(`${locale} active quotation keeps the other opening unchanged after editing 240000 to 470000 (${discount}% discount)`,()=>{
 const {document,translations,shared,indicators}=components(locale);
 const snapshots=freeze({previous:quotation(240000,discount),current:quotation(470000,discount),contract:{quotation:quotation(240000,discount)},catalog:structuredClone(catalog)});
 const before=structuredClone(snapshots);
 function render(saved) {
  const data={project:{project_name:'Price display fixture',project_number:'PRJ-FIXTURE',address:'Baghdad',branch:'Karkh',sales_status:'quotation_in_progress'},client:{name:'Fixture client',mobile:null},openings:saved.lines.map(line=>line.opening),catalog:snapshots.catalog,history:[],flow:{project_id:'project-fixture',revision:2,stage:'quotation',quotation:saved,contract:null,evidence:null,signed_at:null}};
  const empty=()=>null;
  const {QuotationWorkspace}=load('../src/components/workflow/QuotationWorkspace.tsx',{
   ...shared,'next/link':({children,href})=>React.createElement('a',{href},children),'@/lib/workflow/catalogRules':catalogRules,
   '@/lib/workflow/quotationOpenings':{quotationOpenings:(existing,added)=>{assert.deepEqual(added,[]);return existing;}},
   './StandaloneItems':{StandaloneItems:empty},'@/components/measurements/MeasurementReports':{MeasurementReports:empty},'./ProjectRecord':{ProjectRecord:empty},'./QuotationOpeningForm':{QuotationOpeningForm:empty},'./OpeningAreaIndicator':indicators,'./CommercialDocument':document,
   './ui':{button:'button',card:'card',field:'field',secondary:'secondary',Notice:empty,Workspace:({children})=>React.createElement('main',null,children),useResource:()=>({data,loading:false,error:'',reload:()=>{throw Error('Rendering must not write or fetch data');}}),api:()=>{throw Error('Rendering must not write or fetch data');}},
  });
  return renderToStaticMarkup(React.createElement(QuotationWorkspace,{projectId:'project-fixture'}));
 }
 const previous=openingRows(render(snapshots.previous));
 const html=render(snapshots.current);
 const current=openingRows(html);
 checkSavedPrices(html,translations,discount);
 assert.deepEqual(current[1],previous[1],'The untouched opening retains its own rate, system amount and total');
 assert.deepEqual(current[0].slice(1),previous[0].slice(1),'Glass, shutter, motor and other accessories are unaffected by the system-rate edit');
 assert.equal(Number(current[0][0][3].replaceAll(',',''))-Number(previous[0][0][3].replaceAll(',','')),460000,'Only the edited opening receives the rate difference across its two billable sqm');
 assert.deepEqual(snapshots,before,'Current, historical and contract snapshots and catalog entries stay intact');
});
