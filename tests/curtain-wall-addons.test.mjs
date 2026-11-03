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
const choice={openingId:opening.id,systemId:'curtain',hasCurtainWallArch:true,extras:[{id:'pushout',quantity:3}]};
const facade={id:'curtain',quantity:1,hasCurtainWallArch:true,measurements:[{label:'Front',width:6,height:4,quantity:2}],extras:[{id:'pushout',quantity:3}]};
const quote=(discount=0)=>pricing.priceQuotation([opening],[choice],catalog,'preparer',[facade],discount);
const extrasById=extras=>Object.fromEntries(extras.map(item=>[item.id,item]));

test('Arch uses a fixed synthetic charge and Pushout retains its catalog unit price',()=>{
 assert.equal(pricing.CURTAIN_WALL_ARCH_PRICE,150000);
 assert.equal(pricing.CURTAIN_WALL_ARCH_ID,ARCH_ID);
 assert.equal(pricing.isCurtainWallArchCharge({id:ARCH_ID}),true);
 assert.equal(pricing.isCurtainWallArchCharge({id:'other'}),false);
 const legacy={...catalog.find(item=>item.id==='pushout'),category:'service',unit:'sqm',is_active:false};
 const normalized=rules.normalizeCatalogItem(legacy);
 assert.equal(rules.catalogKind(legacy),'addon');
 assert.equal(normalized.category,'addon');
 assert.equal(normalized.unit,'item');
 assert.equal(normalized.unit_price,25000);
 assert.equal(normalized.is_active,false);
 assert.equal(legacy.unit,'sqm','Normalization must not mutate the catalog record');
 assert.equal(rules.isCurtainWallArch({name:'  CURTAIN   WALL ARCH  '}),true);
 assert.equal(rules.isCurtainWallArch({name:'Curtain Wall'}),false);
 assert.equal(rules.isCurtainWallArch({name:'Arch'}),false,'Window/door measurement arches are separate from this catalog add-on');
});

test('Arch catalog entries stay out of the add-on dropdown while Pushout remains curtain-only',()=>{
 const withLegacy=[...catalog,product('legacy-arch','Curtain Wall Arch','addon','item',1)];
 assert.equal(rules.catalogKind(withLegacy.at(-1)),'removed','Legacy Arch prices must not compete with the fixed checkbox charge');
 assert.equal(rules.normalizeCatalogItem(withLegacy.at(-1)).is_active,false);
 assert.deepEqual(pricing.addonOptions(opening,withLegacy,'curtain').map(item=>item.id),['pushout']);
 assert.deepEqual(pricing.facadeAddonOptions(catalog[0],withLegacy).map(item=>item.id),['pushout']);
 for(const id of ['legacy-arch',ARCH_ID]){
  assert.throws(()=>pricing.priceQuotation([opening],[{...choice,extras:[{id,quantity:99,rate:1,total:1}]}],withLegacy,'preparer'),/compatible/);
  assert.throws(()=>pricing.priceQuotation([],[],withLegacy,'preparer',[{...facade,extras:[{id,quantity:99,rate:1,total:1}]}]),/compatible/);
 }
 assert.ok(!pricing.additionalOptions(withLegacy).some(item=>['legacy-arch','pushout'].includes(item.id)),'Add-ons cannot be quoted as standalone products');
});

test('the Arch checkbox and Pushout are rejected on unrelated opening types and facade products',()=>{
 for(const opening_type of ['Window','Door','Louver']){
  const measured={...opening,opening_type,opening_direction:opening_type==='Window'?'Sliding':'Hinged'};
  assert.deepEqual(pricing.addonOptions(measured,catalog,opening_type==='Louver'?'louver':'system'),[]);
  assert.throws(()=>pricing.priceQuotation([measured],[{...choice,systemId:opening_type==='Louver'?'louver':'system',extras:[]}],catalog,'preparer'));
  assert.throws(()=>pricing.priceQuotation([measured],[{...choice,hasCurtainWallArch:false,systemId:opening_type==='Louver'?'louver':'system'}],catalog,'preparer'),/compatible/);
 }
 for(const id of ['cladding','door']){
  assert.deepEqual(pricing.facadeAddonOptions(catalog.find(item=>item.id===id),catalog),[]);
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{...facade,id,extras:[]}]));
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{...facade,id,hasCurtainWallArch:false}]),/compatible/);
 }
});

test('checking Arch charges 150000 IQD once for each measured curtain wall without an Arch catalog row',()=>{
 const result=pricing.priceQuotation([opening],[choice],catalog,'preparer');
 assert.equal(result.lines[0].area,12);
 assert.equal(result.lines[0].system.total,1200000);
 const extras=extrasById(result.lines[0].extras);
 assert.deepEqual(extras[ARCH_ID],{id:ARCH_ID,name:'Curtain Wall Arch',unit:'item',rate:150000,quantity:2,total:300000});
 assert.equal(extras.pushout.quantity,6);
 assert.equal(extras.pushout.total,150000);
 assert.equal(result.total,1650000);
 for(const quantity of [1,undefined]){
  const single=pricing.priceQuotation([{...opening,quantity}],[choice],catalog,'preparer');
  assert.equal(extrasById(single.lines[0].extras)[ARCH_ID].quantity,1);
  assert.equal(extrasById(single.lines[0].extras)[ARCH_ID].total,150000);
  assert.equal(single.total,825000);
 }
 const withForgedRate=pricing.priceQuotation([opening],[{...choice,archRate:1,archQuantity:999,archTotal:1}],catalog,'preparer');
 assert.deepEqual(withForgedRate.lines[0].extras,result.lines[0].extras,'Only the fixed server rate and measured wall count determine Arch charges');
});

test('facade Arch is charged once per curtain wall service, independent of area and repeated surfaces',()=>{
 const result=pricing.priceQuotation([],[],catalog,'preparer',[facade]);
 assert.equal(result.additionalItems[0].quantity,48);
 assert.equal(result.additionalItems[0].total,4800000);
 const extras=extrasById(result.additionalItems[0].extras);
 assert.deepEqual(extras[ARCH_ID],{id:ARCH_ID,name:'Curtain Wall Arch',unit:'item',rate:150000,quantity:1,total:150000});
 assert.equal(extras.pushout.quantity,3);
 assert.equal(extras.pushout.total,75000);
 assert.equal(result.total,5025000);
 const legacyUnits=catalog.map(item=>item.id==='pushout'?{...item,unit:'sqm'}:item);
 assert.deepEqual(pricing.priceQuotation([],[],legacyUnits,'preparer',[facade]).additionalItems,result.additionalItems,'Legacy Pushout sqm units cannot turn counts into facade-area charges');
 const misleadingCatalog=[...catalog,product('legacy-arch','Curtain Wall Arch','addon','sqm',999999)];
 assert.deepEqual(pricing.priceQuotation([],[],misleadingCatalog,'preparer',[facade]).additionalItems,result.additionalItems,'Legacy Arch catalog pricing cannot override the fixed checkbox fee');
 const withForgedRate=pricing.priceQuotation([],[],catalog,'preparer',[{...facade,archRate:1,archQuantity:999,archTotal:1}]);
 assert.deepEqual(withForgedRate.additionalItems,result.additionalItems,'Client fields cannot override the fixed facade Arch charge');
});

test('Arch accepts only an optional boolean and unchecking removes its charge',()=>{
 for(const hasCurtainWallArch of [null,'true','false',0,1,{},[]]){
  assert.throws(()=>pricing.priceQuotation([opening],[{...choice,hasCurtainWallArch}],catalog,'preparer'));
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{...facade,hasCurtainWallArch}]));
 }
 for(const hasCurtainWallArch of [false,undefined]){
  const measured=pricing.priceQuotation([opening],[{...choice,hasCurtainWallArch}],catalog,'preparer');
  assert.equal(measured.total,1350000);
  assert.ok(!measured.lines[0].extras.some(item=>item.id===ARCH_ID));
  const standalone=pricing.priceQuotation([],[],catalog,'preparer',[{...facade,hasCurtainWallArch}]);
  assert.equal(standalone.total,4875000);
  assert.ok(!standalone.additionalItems[0].extras.some(item=>item.id===ARCH_ID));
 }
});

test('a pre-quotation curtain wall Arch tick defaults to a fixed fee once per recorded wall',()=>{
 for(const quantity of [1,3,undefined]){
  const measured={...opening,quantity,has_arch:true};
  const selected={...choice};
  delete selected.hasCurtainWallArch;
  const before=structuredClone({measured,selected});
  const result=pricing.priceQuotation([measured],[selected],catalog,'preparer');
  const arch=extrasById(result.lines[0].extras)[ARCH_ID];
  assert.ok(arch,'The saved curtain wall Arch tick must apply without a separate quotation override');
  assert.equal(arch.quantity,quantity??1);
  assert.equal(arch.rate,150000);
  assert.equal(arch.total,(quantity??1)*150000);
  assert.equal(result.total,(quantity??1)*825000);
  assert.deepEqual({measured,selected},before);
 }
});

test('explicit quotation Arch choices override the measured tick while legacy window and door arches keep their original pricing',()=>{
 const ticked={...opening,has_arch:true};
 const unchecked=pricing.priceQuotation([ticked],[{...choice,hasCurtainWallArch:false}],catalog,'preparer');
 assert.ok(!unchecked.lines[0].extras.some(item=>item.id===ARCH_ID));
 assert.equal(unchecked.total,1350000);
 assert.equal(unchecked.lines[0].opening.has_arch,true,'A quotation override cannot rewrite the recorded measurement');
 for(const has_arch of [false,undefined]){
  const selected={...choice};
  delete selected.hasCurtainWallArch;
  const result=pricing.priceQuotation([{...opening,has_arch}],[selected],catalog,'preparer');
  assert.ok(!result.lines[0].extras.some(item=>item.id===ARCH_ID));
  assert.equal(result.total,1350000);
 }
 const retained=pricing.priceQuotation([{...opening,has_arch:false}],[choice],catalog,'preparer');
 assert.equal(extrasById(retained.lines[0].extras)[ARCH_ID].total,300000,'An explicit saved quotation selection remains authoritative when measured flags differ');
 for(const opening_type of ['Window','Door']){
  const measured={...opening,opening_type,opening_direction:'Sliding',has_arch:true};
  const result=pricing.priceQuotation([measured],[{openingId:opening.id,systemId:'system',extras:[]}],catalog,'preparer');
  assert.deepEqual(result.lines[0].extras,[],'A window/door arch flag must not create the curtain wall fee');
  assert.equal(result.total,2880000);
 }
});

test('Pushout rejects invalid counts, duplicates, inactive entries and missing catalog prices',()=>{
 const id='pushout';
 for(const quantity of [0,-1,1.5,NaN,Infinity,1000001]){
  assert.throws(()=>pricing.priceQuotation([opening],[{...choice,extras:[{id,quantity}]}],catalog,'preparer'));
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{...facade,extras:[{id,quantity}]}]));
 }
 const duplicate=[{id,quantity:1},{id,quantity:2}];
 assert.throws(()=>pricing.priceQuotation([opening],[{...choice,extras:duplicate}],catalog,'preparer'),/once/);
 assert.throws(()=>pricing.priceQuotation([],[],catalog,'preparer',[{...facade,extras:duplicate}]),/once/);
 for(const patch of [{is_active:false},{unit_price:0}]){
  const unavailable=catalog.map(item=>item.id===id?{...item,...patch}:item);
  assert.throws(()=>pricing.priceQuotation([opening],[{...choice,extras:[{id,quantity:1}]}],unavailable,'preparer'));
  assert.throws(()=>pricing.priceQuotation([],[],unavailable,'preparer',[{...facade,extras:[{id,quantity:1}]}]));
 }
});

test('saved add-on counts and discount survive JSON persistence and catalog price refresh without changing the original snapshot',()=>{
 const original=quote(5);
 assert.equal(original.discount.subtotal,6675000);
 assert.equal(original.discount.amount,333750);
 assert.equal(original.total,6341250);
 const saved=JSON.parse(JSON.stringify(original));
 const before=structuredClone(saved);
 const changed=catalog.map(item=>item.id==='pushout'?{...item,unit_price:30000}:item);
 const refreshed=pricing.repriceQuotation(saved,changed,'refresher');
 assert.equal(extrasById(refreshed.lines[0].extras)[ARCH_ID].quantity,2);
 assert.equal(extrasById(refreshed.lines[0].extras)[ARCH_ID].total,300000);
 assert.equal(extrasById(refreshed.lines[0].extras).pushout.total,180000);
 assert.equal(extrasById(refreshed.additionalItems[0].extras)[ARCH_ID].quantity,1);
 assert.equal(extrasById(refreshed.additionalItems[0].extras)[ARCH_ID].total,150000);
 assert.equal(extrasById(refreshed.additionalItems[0].extras).pushout.total,90000);
 assert.equal(refreshed.discount.subtotal,6720000);
 assert.equal(refreshed.discount.amount,336000);
 assert.equal(refreshed.total,6384000);
 assert.deepEqual(saved,before);
 assert.equal(original.total,6341250,'Historical quotation and contract snapshots retain their saved amounts');
});

test('price refresh regenerates the fixed Arch rate and rejects duplicate or malformed Arch charges',()=>{
 const saved=quote();
 extrasById(saved.lines[0].extras)[ARCH_ID].rate=1;
 extrasById(saved.lines[0].extras)[ARCH_ID].total=2;
 const refreshed=pricing.repriceQuotation(saved,catalog,'refresher');
 assert.equal(extrasById(refreshed.lines[0].extras)[ARCH_ID].rate,150000);
 assert.equal(extrasById(refreshed.lines[0].extras)[ARCH_ID].total,300000);
 for(const location of ['opening','facade']){
  for(const patch of [{quantity:99},{quantity:0},{unit:'sqm'}]){
   const malformed=quote();
   Object.assign(extrasById(location==='opening'?malformed.lines[0].extras:malformed.additionalItems[0].extras)[ARCH_ID],patch);
   assert.throws(()=>pricing.repriceQuotation(malformed,catalog,'refresher'));
  }
  const duplicate=quote();
  const extras=location==='opening'?duplicate.lines[0].extras:duplicate.additionalItems[0].extras;
  extras.push({...extrasById(extras)[ARCH_ID]});
  assert.throws(()=>pricing.repriceQuotation(duplicate,catalog,'refresher'));
 }
});

test('price refresh requires editing legacy catalog Arch charges and rejects Arch on unrelated parent products',()=>{
 for(const location of ['opening','facade']){
  const legacy=quote();
  const extras=location==='opening'?legacy.lines[0].extras:legacy.additionalItems[0].extras;
  Object.assign(extrasById(extras)[ARCH_ID],{id:'legacy-arch',rate:1});
  assert.throws(()=>pricing.repriceQuotation(legacy,[...catalog,product('legacy-arch','Curtain Wall Arch','addon','item',1)],'refresher'),/Edit quotation/i);
 }
 const measured=quote();
 measured.lines[0].opening.opening_type='Window';
 measured.lines[0].system={...measured.lines[0].system,id:'system',name:'Alumex System'};
 assert.throws(()=>pricing.repriceQuotation(measured,catalog,'refresher'));
 const standalone=quote();
 standalone.additionalItems[0].id='cladding';
 standalone.additionalItems[0].name='Cladding';
 assert.throws(()=>pricing.repriceQuotation(standalone,catalog,'refresher'));
});

test('operations receives both add-on quantities for opening and facade work without commercial amounts',()=>{
 const result=quote();
 assert.deepEqual(operations.operationalSpecifications(result)[0].extras.sort((a,b)=>a.name.localeCompare(b.name)),[
  {name:'Curtain Wall Arch',quantity:2,unit:'item'},
  {name:'Curtain Wall Pushout',quantity:6,unit:'item'},
 ]);
 assert.deepEqual(operations.operationalAdditionalItems(result)[0].extras.sort((a,b)=>a.name.localeCompare(b.name)),[
  {name:'Curtain Wall Arch',quantity:1,unit:'item'},
  {name:'Curtain Wall Pushout',quantity:3,unit:'item'},
 ]);
 assert.equal(/rate|price|total/.test(JSON.stringify([...operations.operationalSpecifications(result),...operations.operationalAdditionalItems(result)])),false);
});

for(const locale of ['en','ar'])test(`${locale} quotation and contract schedule renders both saved curtain wall add-ons and reconciles totals`,()=>{
 const messages=JSON.parse(readFileSync(new URL(`../messages/${locale}.json`,import.meta.url),'utf8')).terms;
 const term=(value,replacements={})=>(messages[value]??value??'').replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match);
 const formatNumber=(value,maximumFractionDigits=4)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits}).format(value);
 const translations={locale,term,formatNumber,formatMoney:value=>`${formatNumber(value,0)} ${locale==='ar'?'د.ع':'IQD'}`};
 const shared={'react/jsx-runtime':jsxRuntime,'@/components/i18n/I18nProvider':{useI18n:()=>translations},'@/lib/workflow/pricing':pricing};
 const indicators=load('../src/components/workflow/OpeningAreaIndicator.tsx',shared);
 const document=load('../src/components/workflow/CommercialDocument.tsx',{...shared,'@/lib/quotations/itemGroups':groups,'./OpeningAreaIndicator':indicators});
 const saved=JSON.parse(JSON.stringify(quote(5)));
 const before=structuredClone(saved);
 const markup=renderToStaticMarkup(React.createElement(document.OpeningSchedule,{quote:saved}));
 assert.equal(messages['Curtain Wall Arch'],locale==='ar'?'قوس الكيرتن':'Curtain Wall Arch');
 for(const name of ['Curtain Wall Arch','Curtain Wall Pushout'])assert.equal(markup.split(term(name)).length-1,2,'Both opening and facade charge tables show the saved add-on');
 assert.ok(markup.includes(translations.formatMoney(6675000)),'Curtain Wall group subtotal includes both add-ons on both work types');
 assert.ok(markup.includes(translations.formatMoney(6341250)),'Grand total applies the saved 5% discount once');
 assert.ok(markup.includes(`6 ${term('item')}`),'Repeated openings preserve their six pushouts');
 assert.ok(markup.includes(`3 ${term('item')}`),'Facade service preserves its three pushouts');
 assert.deepEqual(saved,before,'Rendering the shared quotation/contract schedule cannot mutate the snapshot');
});
