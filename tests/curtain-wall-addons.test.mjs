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
  if(name==='@/lib/intake/projectBranch')return load('../src/lib/intake/projectBranch.ts');
  assert.ok(name in dependencies,`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}
const rules=load('../src/lib/workflow/catalogRules.ts');
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules});
const groups=load('../src/lib/quotations/itemGroups.ts');
const operations=load('../src/lib/workflow/operations.ts');
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('curtain','Curtain Wall','facade_service','sqm',100000),
 product('pushout','Curtain Wall Pushout','addon','item',25000),
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('louver','Louver','opening_product','sqm',100000),
 product('cladding','Cladding','facade_service','sqm',50000),
 product('door','A Swing Door','standalone_product','item',100000),
];
const ARCH_ID='curtain-wall-arch';
const opening={id:'opening',floor:'Ground',room:'Office',width:300,height:200,quantity:2,opening_type:'Curtain Wall',opening_direction:null};
const choice={openingId:opening.id,systemId:'curtain',extras:[]};
const facade={id:'curtain',quantity:1,measurements:[{label:'Front',width:6,height:4,quantity:2}],extras:[]};
const projectAddons=[{id:ARCH_ID,quantity:3},{id:'pushout',quantity:9}];
const quote=(discount=0)=>pricing.priceQuotation([opening],[choice],catalog,'preparer',[facade,...projectAddons],discount);
const byId=items=>Object.fromEntries(items.map(item=>[item.id,item]));
const archCharge=quantity=>({id:ARCH_ID,name:'Curtain Wall Arch',unit:'item',rate:150000,quantity,total:quantity*150000});
const pushoutCharge=quantity=>({id:'pushout',name:'Curtain Wall Pushout',unit:'item',rate:25000,quantity,total:quantity*25000});
// Historical quotes keep their old nested charge layout until explicitly edited.
function legacyQuote(discount=0){
 const result=pricing.priceQuotation([opening],[choice],catalog,'preparer',[facade]);
 result.lines[0].extras=[archCharge(2),pushoutCharge(6)];
 result.lines[0].total+=450000;
 result.additionalItems[0].extras=[archCharge(1),pushoutCharge(3)];
 return pricing.applyQuotationDiscount(result,discount);
}

test('Arch uses the fixed synthetic project price and Pushout retains its catalog price',()=>{
 assert.equal(pricing.CURTAIN_WALL_ARCH_PRICE,150000);
 assert.equal(pricing.CURTAIN_WALL_ARCH_ID,ARCH_ID);
 assert.equal(pricing.isCurtainWallArchCharge({id:ARCH_ID}),true);
 assert.equal(pricing.isCurtainWallArchCharge({id:'other'}),false);
 const legacy={...catalog.find(item=>item.id==='pushout'),category:'service',unit:'sqm',is_active:false};
 const normalized=rules.normalizeCatalogItem(legacy);
 assert.equal(rules.catalogKind(legacy),'standalone');
 assert.equal(normalized.category,'standalone_product');
 assert.equal(normalized.unit,'item');
 assert.equal(normalized.unit_price,25000);
 assert.equal(normalized.is_active,false);
 assert.equal(legacy.unit,'sqm','Normalization must not mutate the catalog record');
 assert.equal(rules.isCurtainWallArch({name:'  CURTAIN   WALL ARCH  '}),true);
 assert.equal(rules.isCurtainWallArch({name:'Arch'}),false,'Window/door measurement arches are separate');
});

test('Arch and Pushout appear once in the project picker and never as opening or facade extras',()=>{
 const withLegacy=[...catalog,product('legacy-arch','Curtain Wall Arch','addon','item',1)];
 assert.equal(rules.catalogKind(withLegacy.at(-1)),'standalone');
 const options=pricing.additionalOptions(withLegacy);
 assert.equal(options.filter(item=>rules.isCurtainWallArch(item)).length,1);
 assert.equal(options.find(item=>rules.isCurtainWallArch(item)).id,ARCH_ID);
 assert.equal(options.find(item=>item.id===ARCH_ID).unit_price,150000);
 assert.ok(options.some(item=>item.id==='pushout'));
 assert.ok(!options.some(item=>item.id==='legacy-arch'));
 assert.deepEqual(pricing.addonOptions(opening,withLegacy,'curtain'),[]);
 assert.deepEqual(pricing.facadeAddonOptions(catalog[0],withLegacy),[]);
 for(const id of ['legacy-arch',ARCH_ID,'pushout']){
  assert.throws(()=>pricing.priceQuotation([opening],[{...choice,extras:[{id,quantity:2}]}],withLegacy,'preparer'),/compatible/);
  assert.throws(()=>pricing.priceQuotation([],[],withLegacy,'preparer',[{...facade,extras:[{id,quantity:2}]}]),/compatible/);
 }
});

test('project add-on counts are independent of wall repetitions and facade areas',()=>{
 for(const quantity of [1,2,7]){
  const measured={...opening,quantity};
  const result=pricing.priceQuotation([measured],[choice],catalog,'preparer',projectAddons);
  const items=byId(result.additionalItems);
  assert.deepEqual(items[ARCH_ID],archCharge(3));
  assert.deepEqual(items.pushout,pushoutCharge(9));
  assert.equal(result.lines[0].system.total,600000*quantity);
  assert.deepEqual(result.lines[0].extras,[]);
  assert.equal(result.total,600000*quantity+675000);
 }
 for(const width of [1,6,20]){
  const service={...facade,measurements:[{label:'Front',width,height:4,quantity:2}]};
  const result=pricing.priceQuotation([],[],catalog,'preparer',[service,...projectAddons]);
  const items=byId(result.additionalItems);
  assert.equal(items.curtain.quantity,width*8);
  assert.deepEqual(items[ARCH_ID],archCharge(3));
  assert.deepEqual(items.pushout,pushoutCharge(9));
  assert.equal(result.total,width*800000+675000);
 }
});

test('project Arch and Pushout use independent quantities like Swing Door, without requiring individual walls',()=>{
 const result=pricing.priceQuotation([],[],catalog,'preparer',[{id:'door',quantity:2},{id:ARCH_ID,quantity:4},{id:'pushout',quantity:7}]);
 assert.deepEqual(result.additionalItems.map(item=>[item.id,item.quantity,item.total]),[['door',2,200000],[ARCH_ID,4,600000],['pushout',7,175000]]);
 assert.equal(result.total,975000);
 const forged=pricing.priceQuotation([],[],[...catalog,product('legacy-arch','Curtain Wall Arch','addon','sqm',999999)],'preparer',[{id:ARCH_ID,quantity:4,rate:1,total:1,unit:'sqm'},{id:'pushout',quantity:7,rate:1,total:1}]);
 assert.deepEqual(forged.additionalItems,result.additionalItems.slice(1),'Server rates and selected counts determine all charges');
 const legacyUnits=catalog.map(item=>item.id==='pushout'?{...item,unit:'sqm'}:item);
 assert.deepEqual(pricing.priceQuotation([],[],legacyUnits,'preparer',projectAddons).additionalItems,pricing.priceQuotation([],[],catalog,'preparer',projectAddons).additionalItems);
});

test('recorded curtain wall arch flags no longer add an automatic per-wall fee',()=>{
 for(const quantity of [1,3,undefined]){
  const measured={...opening,quantity,has_arch:true};
  const before=structuredClone(measured);
  const result=pricing.priceQuotation([measured],[choice],catalog,'preparer');
  assert.deepEqual(result.lines[0].extras,[]);
  assert.equal(result.total,(quantity??1)*600000);
  assert.equal(result.lines[0].opening.has_arch,true,'Recorded measurements remain intact');
  assert.deepEqual(measured,before);
 }
 for(const opening_type of ['Window','Door']){
  const measured={...opening,opening_type,opening_direction:'Sliding',has_arch:true};
  const result=pricing.priceQuotation([measured],[{openingId:opening.id,systemId:'system',extras:[]}],catalog,'preparer');
  assert.deepEqual(result.lines[0].extras,[]);
  assert.equal(result.total,2880000);
 }
});

test('project add-ons reject invalid counts, duplicate selections and unavailable Pushout prices',()=>{
 for(const id of [ARCH_ID,'pushout']){
  for(const quantity of [0,-1,1.5,NaN,Infinity,1000001,'2',null,true,{},[]]){
   assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{id,quantity}]),`${id}: ${String(quantity)}`);
  }
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{id,quantity:1},{id,quantity:2}]),/once/);
 }
 for(const patch of [{is_active:false},{unit_price:0},{unit_price:-1},{unit_price:NaN}]){
  const unavailable=catalog.map(item=>item.id==='pushout'?{...item,...patch}:item);
  assert.throws(()=>pricing.priceQuotation([],[],unavailable,'preparer',[{id:'pushout',quantity:1}]));
 }
 assert.throws(()=>pricing.priceQuotation([],[],catalog.filter(item=>item.id!=='pushout'),'preparer',[{id:'pushout',quantity:1}]));
});

test('saved project counts and discount survive JSON persistence and catalog refresh without changing history',()=>{
 const original=quote(5);
 assert.deepEqual(original.discount,{percent:5,subtotal:6675000,amount:333750});
 assert.equal(original.total,6341250);
 const saved=JSON.parse(JSON.stringify(original)),before=structuredClone(saved);
 const changed=catalog.map(item=>item.id==='pushout'?{...item,unit_price:30000}:item);
 const refreshed=pricing.repriceQuotation(saved,changed,'refresher');
 assert.deepEqual(byId(refreshed.additionalItems)[ARCH_ID],archCharge(3));
 assert.equal(byId(refreshed.additionalItems).pushout.quantity,9);
 assert.equal(byId(refreshed.additionalItems).pushout.total,270000);
 assert.deepEqual(refreshed.discount,{percent:5,subtotal:6720000,amount:336000});
 assert.equal(refreshed.total,6384000);
 assert.deepEqual(saved,before);
});

test('historical nested add-on refresh retains saved counts without multiplying repetitions again',()=>{
 const saved=legacyQuote(5),before=structuredClone(saved);
 const changed=catalog.map(item=>item.id==='pushout'?{...item,unit_price:30000}:item);
 const refreshed=pricing.repriceQuotation(saved,changed,'refresher');
 assert.equal(byId(refreshed.lines[0].extras)[ARCH_ID].quantity,2);
 assert.equal(byId(refreshed.lines[0].extras).pushout.quantity,6);
 assert.equal(byId(refreshed.lines[0].extras).pushout.total,180000);
 assert.equal(byId(refreshed.additionalItems[0].extras)[ARCH_ID].quantity,1);
 assert.equal(byId(refreshed.additionalItems[0].extras).pushout.quantity,3);
 assert.equal(refreshed.total,6384000);
 assert.deepEqual(saved,before);
});

test('legacy edit migration aggregates absolute project counts without changing saved snapshots',()=>{
 const saved=legacyQuote(5),before=structuredClone(saved);
 const migrated=pricing.quotationAdditionalChoices(saved);
 const items=byId(migrated);
 assert.deepEqual(items[ARCH_ID],{id:ARCH_ID,quantity:3});
 assert.deepEqual(items.pushout,{id:'pushout',quantity:9});
 assert.deepEqual(items.curtain.measurements,facade.measurements);
 assert.deepEqual(items.curtain.extras??[],[]);
 const resaved=pricing.priceQuotation([opening],[choice],catalog,'editor',migrated,5);
 assert.equal(resaved.total,saved.total);
 assert.deepEqual(resaved.lines[0].extras,[]);
 assert.deepEqual(saved,before);
 items.curtain.measurements[0].width=999;
 assert.deepEqual(saved,before,'Editable measurements cannot alias immutable history');
});

test('migration merges existing project counts with legacy nested charges and preserves other extras',()=>{
 const saved=legacyQuote();
 saved.additionalItems.push(archCharge(4),pushoutCharge(2));
 saved.additionalItems[0].extras.push({id:'film',name:'Glass Film Shading',unit:'sqm',rate:1000,quantity:48,total:48000});
 const migrated=byId(pricing.quotationAdditionalChoices(saved));
 assert.equal(migrated[ARCH_ID].quantity,7);
 assert.equal(migrated.pushout.quantity,11);
 assert.deepEqual(migrated.curtain.extras,[{id:'film',quantity:48}]);
});

test('price refresh restores the fixed project Arch rate and rejects invalid Arch counts or units',()=>{
 const saved=quote();
 Object.assign(byId(saved.additionalItems)[ARCH_ID],{rate:1,total:3});
 assert.deepEqual(byId(pricing.repriceQuotation(saved,catalog,'refresher').additionalItems)[ARCH_ID],archCharge(3));
 for(const patch of [{quantity:0},{quantity:1.5},{unit:'sqm'},{rateSource:'quotation'},{motorFor:'other'}]){
  const malformed=quote();Object.assign(byId(malformed.additionalItems)[ARCH_ID],patch);
  assert.throws(()=>pricing.repriceQuotation(malformed,catalog,'refresher'));
 }
});

test('price refresh rejects malformed historical Arch charges and requires editing obsolete catalog Arch ids',()=>{
 for(const location of ['opening','facade']){
  const extrasOf=quote=>location==='opening'?quote.lines[0].extras:quote.additionalItems[0].extras;
  for(const patch of [{quantity:99},{quantity:0},{unit:'sqm'}]){
   const malformed=legacyQuote();Object.assign(byId(extrasOf(malformed))[ARCH_ID],patch);
   assert.throws(()=>pricing.repriceQuotation(malformed,catalog,'refresher'));
  }
  const duplicate=legacyQuote(),extras=extrasOf(duplicate);
  extras.push({...byId(extras)[ARCH_ID]});
  assert.throws(()=>pricing.repriceQuotation(duplicate,catalog,'refresher'));
  const legacy=legacyQuote();Object.assign(byId(extrasOf(legacy))[ARCH_ID],{id:'legacy-arch',rate:1});
  assert.throws(()=>pricing.repriceQuotation(legacy,[...catalog,product('legacy-arch','Curtain Wall Arch','addon','item',1)],'refresher'),/Edit quotation/i);
 }
 const measured=legacyQuote();measured.lines[0].opening.opening_type='Window';measured.lines[0].system={...measured.lines[0].system,id:'system',name:'Alumex System'};
 assert.throws(()=>pricing.repriceQuotation(measured,catalog,'refresher'));
 const standalone=legacyQuote();standalone.additionalItems[0].id='cladding';standalone.additionalItems[0].name='Cladding';
 assert.throws(()=>pricing.repriceQuotation(standalone,catalog,'refresher'));
});

test('operations receives project Arch and Pushout quantities without commercial amounts',()=>{
 const result=quote();
 assert.deepEqual(operations.operationalSpecifications(result)[0].extras,[]);
 const items=operations.operationalAdditionalItems(result);
 assert.deepEqual(items.find(item=>item.name==='Curtain Wall Arch'),{name:'Curtain Wall Arch',quantity:3,unit:'item'});
 assert.deepEqual(items.find(item=>item.name==='Curtain Wall Pushout'),{name:'Curtain Wall Pushout',quantity:9,unit:'item'});
 assert.equal(/rate|price|total/.test(JSON.stringify([...operations.operationalSpecifications(result),...items])),false);
});

for(const locale of ['en','ar'])test(`${locale} quotation and contract schedule renders project counts and reconciles totals`,()=>{
 const messages=JSON.parse(readFileSync(new URL(`../messages/${locale}.json`,import.meta.url),'utf8')).terms;
 const term=(value,replacements={})=>(messages[value]??value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match);
 const formatNumber=(value,maximumFractionDigits=4)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits}).format(value);
 const translations={locale,term,formatNumber,formatMoney:value=>`${formatNumber(value,0)} ${locale==='ar'?'د.ع':'IQD'}`};
 const shared={'react/jsx-runtime':jsxRuntime,'@/components/i18n/I18nProvider':{useI18n:()=>translations},'@/lib/workflow/pricing':pricing};
 const indicators=load('../src/components/workflow/OpeningAreaIndicator.tsx',shared);
 const document=load('../src/components/workflow/CommercialDocument.tsx',{...shared,'@/lib/quotations/itemGroups':groups,'./OpeningAreaIndicator':indicators});
 const saved=JSON.parse(JSON.stringify(quote(5))),before=structuredClone(saved);
 const markup=renderToStaticMarkup(React.createElement(document.OpeningSchedule,{quote:saved}));
 assert.equal(messages['Curtain Wall Arch'],locale==='ar'?'قوس الكيرتن':'Curtain Wall Arch');
 for(const name of ['Curtain Wall Arch','Curtain Wall Pushout']){
  assert.equal(markup.split(term(name)).length-1,2,'Each project add-on appears in its heading and one charge row');
 }
 assert.ok(markup.includes(translations.formatMoney(6675000)),'Curtain Wall subtotal includes all project add-ons');
 assert.ok(markup.includes(translations.formatMoney(6341250)),'Grand total applies the saved discount once');
 assert.ok(markup.includes(`3 ${term('item')}`));
 assert.ok(markup.includes(`9 ${term('item')}`));
 const curtainGroup=groups.quotationItemGroups(saved).find(group=>group.key==='curtain wall');
 assert.equal(curtainGroup.subtotal,6675000);
 assert.equal(curtainGroup.openingCount,2,'Project accessories do not create additional openings');
 assert.equal(curtainGroup.area,60,'Item counts do not add to measured facade area');
 assert.deepEqual(saved,before);
});
