import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

const cache=new Map();
const translations={locale:'en',direction:'ltr',term:(value,replacements={})=>String(value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match),formatNumber:value=>String(value),formatMoney:value=>`${value} IQD`,formatDate:value=>value,formatDateTime:value=>value};
const dependencies={'react':React,'react/jsx-runtime':jsx,'@/components/i18n/I18nProvider':{useI18n:()=>translations}};
function load(path){
 const initial=path instanceof URL?path:new URL(path,import.meta.url);
 const url=existsSync(initial)?initial:['.ts','.tsx'].map(extension=>new URL(initial.href+extension)).find(candidate=>existsSync(candidate));
 assert(url,`Missing module ${initial}`);
 if(cache.has(url.href))return cache.get(url.href);
 if(url.pathname.endsWith('.json')){
  const data=JSON.parse(readFileSync(url,'utf8'));cache.set(url.href,data);return data;
 }
 if(url.pathname.endsWith('.module.css')){
  const names=[...readFileSync(url,'utf8').matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match=>match[1]);
  const classes=Object.fromEntries(names.map(name=>[name,name]));cache.set(url.href,classes);return classes;
 }
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
const {OpeningSchedule,DocumentParties}=load('../src/components/workflow/CommercialDocument.tsx');
const {SavedContractDocument}=load('../src/components/contracts/SavedContractDocument.tsx');
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

for(const total of [2,2_000_002])test(`the original contract words slot retains the dual ending for ${total} IQD without repeating its printed currency label`,()=>{
 const quotation={...priceQuotation([opening],[choice],catalog,'indoor'),total};
 const agreement=buildAgreement2027Snapshot(quotation,'residential',emptyAgreement2027Fields());
 const contract={number:'CT-DUAL-AMOUNT',createdAt:'2026-11-22T09:00:00Z',template:'residential',client:{name:'Client',mobile:'07000',client_type:'individual'},project:{name:'Project',number:'PRJ-DUAL',address:'Baghdad'},quotation,agreement2027:agreement,terms:agreement2027Terms('residential')};
 const before=structuredClone(contract);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract}));
 const filledWords=html.match(/data-agreement-field="contractAmountWords"[^>]*>([^<]*)<\/div>/)?.[1];
 assert.ok(filledWords,'The original source amount-in-words field must be populated');
 assert.match(filledWords,/اثنان/);
 assert.doesNotMatch(filledWords,/دينار|دنانير/);
 if(total===2_000_002)assert.match(filledWords,/مليونان/);
 assert.deepEqual(contract,before,'Rendering an amount-in-words field must not rewrite its saved financial snapshot');
});

function sourceSpecificationText(html){
 assert.ok(html.includes('data-agreement-product='),'The contract must render its approved product selection');
 return html.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');
}
function sourceContract(quotation,specifications=[]){
 return {number:'CT-SELECTED-SPECS',createdAt:'2026-11-22T09:00:00Z',template:'residential',client:{name:'Client',mobile:'07000',client_type:'individual'},project:{name:'Project',number:'PRJ-SELECTED',address:'Baghdad'},quotation,agreement2027:buildAgreement2027Snapshot(quotation,'residential',emptyAgreement2027Fields(),specifications),terms:agreement2027Terms('residential')};
}

test('quotation parties display both corrected names and keep the stable project reference',()=>{
 const html=renderToStaticMarkup(React.createElement(DocumentParties,{client:{name:'Corrected client',mobile:'07000'},project:{name:'Corrected project title',number:'PRJ-UNCHANGED',address:'Baghdad'}}));
 assert.match(html,/Corrected client/);assert.match(html,/data-document-project-name/);assert.match(html,/Corrected project title/);assert.match(html,/PRJ-UNCHANGED/);
});

for(const layout of ['plain','historical','source'])test(`${layout} corrected contract displays synchronized party and project names without changing saved prices`,()=>{
 const quotation=priceQuotation([opening],[choice],catalog,'indoor');
 const contract=sourceContract(quotation);
 contract.client.name='Corrected client';contract.project.name='Corrected project title';
 contract.agreement2027.fields.clientLegalName='Corrected client';contract.agreement2027.fields.ownerName='Corrected client';
 if(layout==='plain')delete contract.agreement2027;
 if(layout==='historical')delete contract.agreement2027.documentLayout;
 const before=structuredClone(contract);
 const html=renderToStaticMarkup(React.createElement(SavedContractDocument,{contract}));
 assert.match(html,/Corrected client/);assert.match(html,/Corrected project title/);
 assert.deepEqual(contract,before);assert.equal(contract.quotation.total,quotation.total);
});

test('a new A16-only contract renders its selected specification and approved rate without the rest of the catalog or empty price rows',()=>{
 const quotation=priceQuotation([opening],[{...choice,systemModel:'A16',glassId:'',extras:[]}],catalog,'indoor');
 const contract=sourceContract(quotation);const before=structuredClone(contract);
 assert.equal(contract.agreement2027.selectedProductsOnly,true);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract}));
 const text=sourceSpecificationText(html);
 assert.match(text,/ALUMEX A16/);
 assert.match(text,/270,000/);
 for(const name of ['ALUMEX A16 Pro','ALUMEX 16 PRO','ALUMEX 4500','ALUMEX PUSH OUT','ALUMEX SKYLIGHT','ALUMEX CURTAIN WALL','THE ADDRESS AS A18','Low-E Glass','Georgian bars'])assert.equal(text.toLowerCase().includes(name.toLowerCase()),false,name);
 assert.doesNotMatch(html,/>—</,'Unselected products must not become empty-price rows');
 assert.deepEqual(contract,before);
});

test('an approved product absent from the reference PDF still renders its actual saved name and technical specifications',()=>{
 const quotation=priceQuotation([opening],[{...choice,glassId:'',extras:[]}],catalog,'indoor');
 quotation.lines[0].system.name='BESPOKE NARROW-FRAME X9';
 delete quotation.lines[0].systemModel;
 const specification={openingId:opening.id,aluminumColor:'برونزي خاص',glassColor:'شفاف معتمد',bottomFrame:'عتبة معتمدة',notes:'المقبض حسب المخطط الموقع',technicalDescription:'مواصفة X9 المعتمدة: عمق 77 ملم وسماكة 2.4 ملم'};
 const contract=sourceContract(quotation,[specification]);const before=structuredClone(contract);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract}));
 const text=sourceSpecificationText(html);
 for(const value of [quotation.lines[0].system.name,'270,000',specification.technicalDescription,specification.aluminumColor,specification.glassColor,specification.bottomFrame,specification.notes])assert.ok(text.includes(value),value);
 assert.doesNotMatch(text,/ALUMEX (?:A?16|4500)|THE ADDRESS AS A18/);
 assert.deepEqual(contract,before);
});

test('a captured source contract without the new selection flag keeps its historical document projection',()=>{
 const quotation=priceQuotation([opening],[{...choice,systemModel:'A16',glassId:'',extras:[]}],catalog,'indoor');
 const contract=sourceContract(quotation);
 delete contract.agreement2027.selectedProductsOnly;
 const before=structuredClone(contract);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract,signedAt:'2026-11-23T10:00:00Z'}));
 assert.ok(html.includes('data-agreement-field="rate-alumex-4500"'),'Existing saved source layouts are not silently rewritten by a read');
 assert.deepEqual(contract,before);
});

for(const kind of ['residential','commercial'])for(const compact of [true,false])test(`${kind} ${compact?'compact':'full'} source contracts include their saved quotation opening schedule exactly once`,()=>{
 const openings=[[67,39],[57,53],[93,50],[164,73]].map(([width,height],index)=>({...opening,id:`hinged-${index}`,width,height,quantity:1,opening_direction:'Hinged'}));
 const products=[...catalog,{id:'standalone-door',name:'A Swing Door',category:'standalone_product',unit:'item',unit_price:120000,is_active:true}];
 const quotation=priceQuotation(openings,openings.map(item=>({openingId:item.id,systemId:'system',systemRate:300000,extras:[]})),products,'indoor',[{id:'standalone-door',quantity:2}]);
 const contract={...sourceContract(quotation),template:kind,terms:agreement2027Terms(kind),agreement2027:buildAgreement2027Snapshot(quotation,kind,emptyAgreement2027Fields())};
 contract.agreement2027.compactLayout=compact?true:undefined;
 const before=structuredClone(contract);
 function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}}
 freeze(contract);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract,signedAt:'2026-11-26T09:00:00Z',evidence:{method:'hard_copy',signer:'Saved signer'}}));
 assert.equal((html.match(/data-contract-opening-schedule/g)??[]).length,1);
 assert.equal((html.match(/class="document-schedule"/g)??[]).length,1,'The full quotation list must appear once per contract');
 const appendix=html.slice(html.indexOf('data-contract-opening-schedule'));
 assert.equal((appendix.match(/class="document-opening-group/g)??[]).length,4,'Each saved opening receives its own schedule row');
 for(const [width,height] of [[67,39],[57,53],[93,50],[164,73]])assert.ok(appendix.includes(`${width} × ${height}`));
 const billed=Number(appendix.match(/data-area="([^"]+)"/)?.[1]);
 assert.ok(Math.abs(billed-4.1972)<1e-9,'The schedule must retain the saved window billing minimums');
 assert.ok(appendix.includes('Billable area'));
 assert.ok(appendix.includes('A Swing Door'),'Standalone quotation products accompany the opening rows');
 assert.ok(appendix.includes(`${quotation.total} IQD`),'The schedule reconciles to the frozen contract quotation');
 assert.ok(appendix.includes(contract.number),'The appendix identifies its contract');
 assert.doesNotMatch(appendix,/2\.23|0\.2613|0\.3021|0\.465|m² measured/);
 assert.ok(html.indexOf('data-agreement-layout="source-pdf-2027"')<html.indexOf('data-contract-opening-schedule'));
 assert.deepEqual(contract,before,'Displaying the contract appendix must not revise signed quotation, terms or product selections');
});

test('historical agreements retain one existing opening schedule without a duplicate appendix',()=>{
 const contract=sourceContract(priceQuotation([opening],[choice],catalog,'indoor'));
 contract.agreement2027.documentLayout=undefined;
 const before=structuredClone(contract);
 const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract}));
 assert.equal((html.match(/class="document-schedule"/g)??[]).length,1);
 assert.equal(html.includes('data-contract-opening-schedule'),false);
 assert.deepEqual(contract,before);
});

for(const kind of ['residential','commercial','unified'])test(`${kind} historical contracts retain one saved billable opening list even with fewer than four terms`,()=>{
 const openings=[[67,39],[57,53],[93,50],[164,73]].map(([width,height],index)=>({...opening,id:`historical-hinged-${index}`,width,height,quantity:1,opening_direction:'Hinged'}));
 const quotation=priceQuotation(openings,openings.map(item=>({openingId:item.id,systemId:'system',systemRate:300000,extras:[]})),catalog,'saved-author');
 const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const fields=emptyAgreement2027Fields();
 fields.approvals.salesEngineer={name:'Saved engineer',date:'2026-11-26',signature};
 fields.companyRepresentativeSignature=signature;
 const agreement=buildAgreement2027Snapshot(quotation,kind,fields,[{openingId:openings[0].id,aluminumColor:'Saved bronze',glassColor:'Saved clear',bottomFrame:'',notes:'Saved opening detail'}]);
 agreement.documentLayout=undefined;
 for(const length of [0,1,2,3,4,19]){
  const terms=agreement2027Terms(kind).slice(0,length);
  const contract={...sourceContract(quotation),template:kind,terms,agreement2027:agreement};
  const before=structuredClone(contract);
  function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}}
  freeze(contract);
  const html=renderToStaticMarkup(React.createElement(Agreement2027Document,{contract,signedAt:'2026-11-26T09:00:00Z'}));
  assert.equal((html.match(/class="document-schedule"/g)??[]).length,1,`${length} saved terms must still render exactly one opening list`);
  assert.equal((html.match(/data-agreement-section="specifications"/g)??[]).length,1);
  assert.equal((html.match(/class="document-opening-group/g)??[]).length,4);
  const specifications=html.indexOf('data-agreement-section="specifications"');
  assert.ok(specifications<html.indexOf('data-agreement-section="annex"'),'The saved list remains before the readiness annex');
  if(length>=4){
   assert.ok(specifications>html.indexOf('data-agreement-clause="4"'),'Existing contracts keep the list inside their fourth saved term');
   if(length>4)assert.ok(specifications<html.indexOf('data-agreement-clause="5"'));
  }
  const subtotal=html.slice(html.indexOf('data-group-subtotal="hinged"'));
  assert.match(subtotal,/Billable area/);
  assert.ok(Math.abs(Number(subtotal.match(/data-area="([^"]+)"/)?.[1])-4.1972)<1e-9);
  assert.ok(subtotal.includes('1259160 IQD'),'The list retains every saved charge and its quotation total');
  assert.doesNotMatch(html,/0\.2613|0\.3021|0\.465|m² measured/);
  assert.ok(html.includes('Saved opening detail'));
  assert.ok(html.includes(signature),'Saved staff signature remains visible');
  assert.equal((html.match(/data-agreement-clause="/g)??[]).length,length,'No legal terms are added or removed');
  assert.deepEqual(contract,before,'Display fallback cannot rewrite saved terms, amounts, specifications, signatures or billing quantities');
 }
});
