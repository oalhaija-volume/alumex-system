import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

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
const {quotationItemGroups}=load('../src/lib/quotations/itemGroups.ts',{
 '../workflow/catalogRules':catalogRules,
 '@/lib/workflow/catalogRules':catalogRules,
});
const charge=(id,name,total)=>({id,name,unit:'item',rate:total,quantity:1,total});
function line(id,{type='Window',direction='Sliding',product='Alumex System',systemAmount=240000,glassAmount=0,extras=[],width=100,height=100,quantity=1}={}) {
 const system={...charge(`system-${id}`,product,systemAmount),unit:'sqm'};
 const glass=glassAmount?{...charge(`glass-${id}`,'Low-E Glass',glassAmount),unit:'sqm'}:null;
 return {opening:{id,floor:'GF',room:'Office',width,height,quantity,opening_type:type,opening_direction:direction},area:width*height/10000*quantity,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((sum,item)=>sum+item.total,0)};
}
function freeze(value) {
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

test('quotation and contract groups put sliding, hinged, curtain wall and louvers together in a stable order',()=>{
 const lines=[
  line('hinged-door',{type:'Door',direction:'Hinged',product:'Alumex Hinged Door',systemAmount:305000}),
  line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall',systemAmount:600000}),
  line('sliding-first'),
  line('louver',{type:'Louver',direction:'Hinged',product:'Louver',systemAmount:150000}),
  line('hinged-window',{direction:'Hinged',product:'Alumex Hinged Window',systemAmount:260000}),
  line('sliding-second',{type:'Door',systemAmount:280000}),
 ];
 const result=quotationItemGroups({lines});
 assert.deepEqual(result.map(group=>group.label),['Sliding','Hinged','Curtain Wall','Louver']);
 assert.deepEqual(result.map(group=>group.lines.map(item=>item.opening.id)),[
  ['sliding-first','sliding-second'],['hinged-door','hinged-window'],['curtain'],['louver'],
 ]);
 assert.deepEqual(result.map(group=>group.subtotal),[520000,565000,600000,150000]);
 assert.deepEqual(result.map(group=>group.key),['sliding','hinged','curtain wall','louver']);
});

test('group subtotals include glass, shutters, motors and facade extras without applying discounts twice',()=>{
 const saved=pricing.applyQuotationDiscount({
  lines:[
   line('sliding',{glassAmount:20000,extras:[charge('shutter','Roller shutter',35000),charge('motor','Roller shutter motor',125000)]}),
   line('hinged',{direction:'Hinged',systemAmount:260000}),
   line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall',systemAmount:400000}),
  ],
  additionalItems:[{...charge('facade-curtain','Curtain Wall',600000),extras:[charge('pushout','Curtain Wall Pushout',50000)]}],
  total:0,currency:'IQD',createdAt:'2026-11-01T08:00:00Z',preparedBy:'fixture',
 },5);
 const before=structuredClone(saved);
 freeze(saved);
 const result=quotationItemGroups(saved);
 assert.equal(result.find(group=>group.label==='Sliding').subtotal,420000);
 assert.equal(result.find(group=>group.label==='Hinged').subtotal,260000);
 const curtain=result.find(group=>group.label==='Curtain Wall');
 assert.equal(curtain.subtotal,1050000);
 assert.deepEqual(curtain.lines.map(item=>item.opening.id),['curtain']);
 assert.deepEqual(curtain.additionalItems.map(item=>item.id),['facade-curtain']);
 const groupTotal=result.reduce((sum,group)=>sum+group.subtotal,0);
 assert.equal(groupTotal,saved.discount.subtotal);
 assert.equal(groupTotal-saved.discount.amount,saved.total);
 assert.equal(result.reduce((sum,group)=>sum+group.area,0),3);
 assert.equal(result.reduce((sum,group)=>sum+group.openingCount,0),3);
 assert.deepEqual(saved,before,'Display grouping must not reorder saved arrays or change any saved amounts');
});

test('Louver and Lift & Slide products take precedence over a measured window operation',()=>{
 const result=quotationItemGroups({lines:[
  line('window-louver',{direction:'Hinged',product:'Louvres'}),
  line('lift-slide',{direction:'Hinged',product:'Lift & Slide'}),
  line('regular-hinge',{direction:'Hinged'}),
 ]});
 assert.deepEqual(result.map(group=>[group.label,group.lines.map(item=>item.opening.id)]),[
  ['Sliding',['lift-slide']],['Hinged',['regular-hinge']],['Louver',['window-louver']],
 ]);
});

test('legacy openings without an operation use explicit sliding and hinged system names',()=>{
 const result=quotationItemGroups({lines:[
  line('old-hinge',{direction:null,product:'Alumex Hinged Window'}),
  line('old-slide',{type:'Door',direction:null,product:'Alumex Sliding Door'}),
 ]});
 assert.deepEqual(result.map(group=>[group.label,group.lines.map(item=>item.opening.id)]),[
  ['Sliding',['old-slide']],['Hinged',['old-hinge']],
 ]);
});

test('standalone aliases merge into the matching opening group with consistent normalized keys',()=>{
 const result=quotationItemGroups({
  lines:[line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall'})],
  additionalItems:[
   charge('curtain-a',' curtain-wall ',100000),
   charge('curtain-b','CURTAIN   WALL',200000),
   charge('louver-a','Louvers',150000),
   charge('louver-b','louvres',175000),
   charge('lift','Lift-and-Slide',300000),
  ],
 });
 assert.deepEqual(result.map(group=>[group.key,group.subtotal]),[['sliding',300000],['curtain wall',540000],['louver',325000]]);
 assert.deepEqual(result.find(group=>group.key==='curtain wall').additionalItems.map(item=>item.id),['curtain-a','curtain-b']);
});

test('empty and standalone-only quotations keep all products in alphabetical groups',()=>{
 assert.deepEqual(quotationItemGroups({lines:[]}),[]);
 assert.deepEqual(quotationItemGroups({lines:[],additionalItems:[]}),[]);
 const result=quotationItemGroups({lines:[],additionalItems:[
  charge('zinc','Zinc Panels',70000),
  charge('cladding-one','Cladding',100000),
  charge('photocell','Photocell Door - GEZE',300000),
  charge('cladding-two',' cladding ',50000),
 ]});
 assert.deepEqual(result.map(group=>group.key),['cladding','photocell door geze','zinc panels']);
 assert.deepEqual(result.map(group=>group.subtotal),[150000,300000,70000]);
 assert.deepEqual(result[0].additionalItems.map(item=>item.id),['cladding-one','cladding-two']);
 assert.ok(result.every(group=>group.lines.length===0));
});

test('unknown and historical opening types remain visible with their full saved prices',()=>{
 const saved={lines:[
  line('custom',{type:'Custom opening',direction:null,product:'Special System',systemAmount:123456}),
  line('no-type',{type:null,direction:null,product:'Historic Product',systemAmount:234567}),
  line('no-label',{type:null,direction:null,product:'',systemAmount:345678}),
 ]};
 const result=quotationItemGroups(saved);
 assert.equal(result.flatMap(group=>group.lines).length,3);
 assert.deepEqual(new Set(result.flatMap(group=>group.lines.map(item=>item.opening.id))),new Set(['custom','no-type','no-label']));
 assert.ok(result.every(group=>group.label.trim().length>0));
 assert.equal(result.reduce((sum,group)=>sum+group.subtotal,0),703701);
});

test('each group totals measured area and repeated physical openings exactly once',()=>{
 const result=quotationItemGroups({lines:[
  line('sliding-a',{width:75,height:150,quantity:3}),
  line('sliding-b',{width:125,height:200,quantity:2}),
  line('hinged',{direction:'Hinged',width:80,height:125,quantity:4}),
 ]});
 assert.deepEqual(result.map(group=>[group.key,group.area,group.openingCount]),[
  ['sliding',8.375,5],['hinged',4,4],
 ]);
 assert.equal(result.reduce((sum,group)=>sum+group.area,0),12.375);
 assert.equal(result.reduce((sum,group)=>sum+group.openingCount,0),9);
});

test('metrics use measured window area while prices retain the per-window billing minimum',()=>{
 const opening={id:'small-window',floor:'GF',room:'Office',width:50,height:75,quantity:4,opening_type:'Window',opening_direction:'Sliding'};
 const catalog=[{id:'alumex',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:240000,is_active:true}];
 const quote=pricing.priceQuotation([opening],[{openingId:opening.id,systemId:'alumex',extras:[]}],catalog,'fixture');
 assert.equal(quote.lines[0].system.quantity,4);
 const [group]=quotationItemGroups(quote);
 assert.equal(group.area,1.5);
 assert.equal(group.openingCount,4);
 assert.equal(group.subtotal,960000);
 assert.equal(quote.total,960000);
});

test('mixed opening and facade services add priced service area without counting reference facades or accessories',()=>{
 const sqm=(id,name,quantity,total)=>({...charge(id,name,total),unit:'sqm',quantity});
 const quote={
  lines:[line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall',width:125,height:200,quantity:2,
   glassAmount:30000,extras:[sqm('film','Window film',5,15000),charge('shutter','Roller shutter',35000),charge('motor','Roller shutter motor',125000)]})],
  additionalItems:[{...sqm('curtain-service','Curtain Wall',12.345678,600000),
   measurements:[{label:'Front',width:123,height:456,quantity:20}],
   extras:[sqm('service-glass','Facade glass',12.345678,50000),charge('pushout','Curtain Wall Pushout',80000)]}],
  facadeMeasurements:[{id:'reference-only',width:1650,height:390,quantity:1,opening_type:'Facade',facade_number:1}],
 };
 const before=structuredClone(quote);freeze(quote);
 const [group]=quotationItemGroups(quote);
 assert.equal(group.area,17.345678);
 assert.equal(group.openingCount,2);
 assert.equal(group.subtotal,1175000);
 assert.deepEqual(quote,before);
});

test('standalone sqm quantities contribute area without inventing opening counts or using other unit quantities',()=>{
 const result=quotationItemGroups({lines:[],additionalItems:[
  {...charge('sqm-a','Cladding',100000),unit:'sqm',quantity:0.125},
  {...charge('sqm-b','Cladding',200000),unit:'sqm',quantity:0.375},
  {...charge('items','Cladding',30000),unit:'item',quantity:25},
  {...charge('length','Cladding',40000),unit:'meter',quantity:100,extras:[{...charge('extra','Glass',5000),unit:'sqm',quantity:999}]},
  {...charge('project','Installation',60000),unit:'project',quantity:1},
 ]});
 assert.deepEqual(result.map(group=>[group.key,group.area,group.openingCount]),[
  ['cladding',0.5,0],['installation',0,0],
 ]);
 assert.equal(result.reduce((sum,group)=>sum+group.subtotal,0),435000);
});

test('older lines without quantities still count one opening and use their saved decimal area',()=>{
 const older=line('older',{width:125,height:125});
 delete older.opening.quantity;
 const [group]=quotationItemGroups({lines:[older]});
 assert.equal(group.area,1.5625);
 assert.equal(group.openingCount,1);
 const [standalone]=quotationItemGroups({lines:[],additionalItems:[charge('product','Historic product',12345)]});
 assert.equal(standalone.area,0);
 assert.equal(standalone.openingCount,0);
});


for(const locale of ['en','ar'])test(`${locale} Curtain Wall measured summary precedes add-ons and its subtotal shows only money`,()=>{
 const terms=JSON.parse(readFileSync(new URL(`../messages/${locale}.json`,import.meta.url),'utf8')).terms;
 const term=(value,replacements={})=>(terms[value]??value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match);
 const formatNumber=(value,maximumFractionDigits=4)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits}).format(value);
 const formatMoney=value=>`${formatNumber(value,0)} ${locale==='ar'?'د.ع':'IQD'}`;
 const document=load('../src/components/workflow/CommercialDocument.tsx',{
  'react/jsx-runtime':jsxRuntime,
  '@/components/i18n/I18nProvider':{useI18n:()=>({locale,term,formatNumber,formatMoney})},
  '@/lib/workflow/pricing':pricing,
  '@/lib/quotations/itemGroups':{quotationItemGroups},
  './OpeningAreaIndicator':{},
 });
 const catalog=[
  {id:'curtain',name:'Curtain Wall',category:'facade_service',unit:'sqm',unit_price:100000,is_active:true},
  {id:'pushout',name:'Curtain Wall Pushout',category:'addon',unit:'sqm',unit_price:750000,is_active:true},
  {id:'system',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:240000,is_active:true},
 ];
 const measured=[
  {id:'curtain-opening',floor:'Ground',room:'Office',width:589,height:500,quantity:1,opening_type:'Curtain Wall',opening_direction:null},
  {id:'sliding-opening',floor:'Ground',room:'Office',width:100,height:100,quantity:1,opening_type:'Window',opening_direction:'Sliding'},
 ];
 const quote=pricing.priceQuotation(measured,[{openingId:'curtain-opening',systemId:'curtain',extras:[]},{openingId:'sliding-opening',systemId:'system',extras:[]}],catalog,'fixture',[
  {id:'curtain',quantity:1,measurements:[{label:'Main facade',width:50,height:10,quantity:1}]},
  {id:'pushout',quantity:12},
 ]);
 const before=structuredClone(quote);
 const markup=renderToStaticMarkup(React.createElement(document.OpeningSchedule,{quote}));
 const headingStart=markup.indexOf('document-curtain-wall-heading');
 assert.ok(headingStart>0);
 const heading=markup.slice(headingStart,markup.indexOf('</dl></div>',headingStart));
 assert.ok(heading.includes(term('Curtain Wall')));
 assert.ok(heading.includes('data-area="529.45" data-opening-count="1"'));
 assert.ok(heading.includes(`529.45 ${term('m²')}`));
 const pushoutRow=markup.match(/<tr>[\s\S]*?<\/tr>/g).find(row=>row.includes(term('Curtain Wall Pushout')));
 assert.ok(pushoutRow);
 assert.ok(pushoutRow.includes(`12 ${term('item')}`));
 assert.ok(pushoutRow.includes('750,000'));
 assert.ok(pushoutRow.includes('9,000,000'));
 assert.equal(pushoutRow.includes(term('m²')),false,'Pushout basis is a count, never the facade area');
 assert.ok(headingStart<markup.indexOf(pushoutRow),'Curtain Wall summary belongs above the add-on rows');
 const subtotalStart=markup.indexOf('data-group-subtotal="curtain wall"');
 const subtotal=markup.slice(subtotalStart,markup.indexOf('</section>',subtotalStart));
 assert.ok(subtotal.includes(formatMoney(61945000)));
 assert.equal(subtotal.includes('document-summary-measures'),false);
 assert.equal(subtotal.includes(term('m²')),false,'The Curtain Wall subtotal cannot appear to apply facade area to Pushout');
 const slidingStart=markup.indexOf('data-group-subtotal="sliding"');
 const slidingSubtotal=markup.slice(slidingStart,markup.indexOf('</section>',slidingStart));
 assert.ok(slidingSubtotal.includes('document-summary-measures'),'Other group summaries keep their existing subtotal layout');
 const grandTotal=markup.slice(markup.indexOf('class="document-total"'));
 assert.ok(grandTotal.includes('data-area="530.45" data-opening-count="2"'));
 assert.ok(grandTotal.includes(formatMoney(62185000)));
 assert.deepEqual(quote,before,'Schedule layout cannot change charges or saved quantities');
});
