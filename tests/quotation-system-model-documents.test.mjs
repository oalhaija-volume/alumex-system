import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

const cache=new Map();
const translations={locale:'en',direction:'ltr',term:(value,replacements={})=>String(value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match),formatNumber:value=>String(value),formatMoney:value=>`${value} IQD`};
const dependencies={'react':React,'react/jsx-runtime':jsx,'@/components/i18n/I18nProvider':{useI18n:()=>translations}};
function load(path){
 const initial=path instanceof URL?path:new URL(path,import.meta.url);
 const url=existsSync(initial)?initial:['.ts','.tsx'].map(extension=>new URL(initial.href+extension)).find(candidate=>existsSync(candidate));
 assert(url,`Missing module ${initial}`);
 if(cache.has(url.href))return cache.get(url.href);
 const exports={};cache.set(url.href,exports);
 const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',source)(name=>{
  if(Object.hasOwn(dependencies,name))return dependencies[name];
  if(name.startsWith('@/'))return load(`../src/${name.slice(2)}`);
  if(name.startsWith('.'))return load(new URL(name,url));
  throw new Error(`Unexpected module ${name}`);
 },exports);
 return exports;
}
const {priceQuotation}=load('../src/lib/workflow/pricing.ts');
const {operationalSpecifications}=load('../src/lib/workflow/operations.ts');
const {OpeningSchedule}=load('../src/components/workflow/CommercialDocument.tsx');
const {Agreement2027Document}=load('../src/components/contracts/Agreement2027Document.tsx');
const {emptyAgreement2027Fields,buildAgreement2027Snapshot}=load('../src/lib/contracts/agreement2027.ts');
const {agreement2027Terms}=load('../src/lib/contracts/agreement2027Content.ts');
const catalog=[
 {id:'system',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:280000,is_active:true},
 {id:'glass',name:'Low-E Glass',category:'glass_option',unit:'sqm',unit_price:20000,is_active:true},
 {id:'bars',name:'Georgian bars',category:'addon',unit:'meter',unit_price:5000,is_active:true},
];
const opening={id:'opening',floor:'GF',room:'Office',width:200,height:100,quantity:2,opening_type:'Window',opening_direction:'Sliding'};
const choice={openingId:opening.id,systemId:'system',systemRate:270000,glassId:'glass',extras:[{id:'bars',quantity:2}]};

for(const systemModel of ['A16','A16 Pro','A16 Pro+','4500','4500 Pro'])test(`${systemModel} reaches quotation, contract and Operations without financial leakage or snapshot mutation`,()=>{
 const measured={...opening,opening_direction:systemModel.startsWith('4500')?'Hinged':'Sliding'};
 const quotation=priceQuotation([measured],[{...choice,systemModel}],catalog,'indoor');
 const before=structuredClone(quotation);
 const label=`ALUMEX ${systemModel}`;
 const html=renderToStaticMarkup(React.createElement(OpeningSchedule,{quote:quotation}));
 assert.ok(html.includes(label));
 assert.equal(quotation.lines[0].system.name,'Alumex System','The original catalog charge remains intact');
 const agreement=buildAgreement2027Snapshot(quotation,'residential',emptyAgreement2027Fields(),[{openingId:opening.id,aluminumColor:'black',glassColor:'clear',bottomFrame:'',notes:''}]);
 const contract={number:'CT-MODEL',createdAt:'2026-11-16T09:00:00Z',template:'residential',client:{name:'Client',mobile:'07000',client_type:'individual'},project:{name:'Project',number:'PRJ-MODEL',address:'Baghdad'},quotation,agreement2027:agreement,terms:agreement2027Terms('residential')};
 const contractHtml=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract}));
 assert.ok(contractHtml.includes(label));
 const operations=operationalSpecifications(quotation);
 assert.deepEqual(operations,[{openingId:opening.id,system:label,glass:'Low-E Glass',extras:[{name:'Georgian bars',quantity:4,unit:'meter'}]}]);
 assert.equal(/rate|price|total|currency|contract|signature/i.test(JSON.stringify(operations)),false);
 assert.deepEqual(quotation,before);
});

test('legacy model-free documents and Operations retain the saved system name',()=>{
 const quote=priceQuotation([opening],[choice],catalog,'indoor');
 assert.equal(Object.hasOwn(quote.lines[0],'systemModel'),false);
 assert.ok(renderToStaticMarkup(React.createElement(OpeningSchedule,{quote})).includes('Alumex System'));
 assert.equal(operationalSpecifications(quote)[0].system,'Alumex System');
});
