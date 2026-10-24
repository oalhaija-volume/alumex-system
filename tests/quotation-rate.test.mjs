import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,dependencies={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',code)(name=>{
  if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}
const rules=load('../src/lib/workflow/catalogRules.ts');
const {priceQuotation,repriceQuotation,quotationPriceKey,isQuotationSystemRateEditable,QUOTATION_SYSTEM_RATE_MIN}=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules});
const opening={id:'window',floor:'Ground',room:'Office',width:50,height:100,opening_type:'Window',opening_direction:'Sliding'};
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('shutter','Roller Shutter - Foam','addon','sqm',30000),
 product('handle','Handle','addon','item',5000),
 product('bars','Georgian bars','addon','meter',2000),
 product('facade','Cladding','facade_service','sqm',100000),
 product('standalone','A Swing Door','standalone_product','item',100000),
];
const choice={openingId:'window',systemId:'system',extras:[]};
const quote=(systemRate,products=catalog,measured=opening,selection=choice)=>priceQuotation([measured],[{...selection,systemRate}],products,'indoor-sales');

test('only available square-metre Alumex systems expose quotation-specific rates',()=>{
 assert.equal(QUOTATION_SYSTEM_RATE_MIN,240000);
 for(const name of ['Alumex','Alumex System',' Alumex Sliding Window ','ALUMEX Thermal Break','Alumex-System'])assert.equal(isQuotationSystemRateEditable({...catalog[0],name}),true,name);
 for(const patch of [{name:'Another System'},{name:'Alumextra System'},{name:'Premium Alumex System'},{name:'Alumex_System'},{name:'Skylight'},{category:'opening_product'},{category:'standalone_product'},{unit:'item'},{unit:'meter'},{unit:'project'},{is_active:false}])assert.equal(isQuotationSystemRateEditable({...catalog[0],...patch}),false,JSON.stringify(patch));
 assert.equal(isQuotationSystemRateEditable(undefined),false);
 assert.equal(isQuotationSystemRateEditable(null),false);
});

for(const rate of [240000,240001,270000,299999,300000,300001,305000,305001,470000,1000000,Number.MAX_SAFE_INTEGER])test(`an explicit ${rate} IQD quotation rate is applied and marked without changing the catalog`,()=>{
 const before=structuredClone(catalog);
 const result=quote(rate);
 assert.deepEqual(result.lines[0].system,{id:'system',name:'Alumex System',unit:'sqm',rate,quantity:1,total:rate,rateSource:'quotation'});
 assert.equal(result.total,rate);
 assert.deepEqual(catalog,before);
});

test('omitting a rate preserves catalog pricing and adds no override marker, including legacy catalog rates',()=>{
 const legacyCatalog=catalog.map(item=>item.id==='system'?{...item,unit_price:100000}:item);
 const implicit=priceQuotation([opening],[choice],legacyCatalog,'indoor-sales');
 const explicitUndefined=quote(undefined,legacyCatalog);
 for(const result of [implicit,explicitUndefined]){
  assert.equal(result.total,100000);
  assert.equal(Object.hasOwn(result.lines[0].system,'rateSource'),false);
 }
 const foreign=legacyCatalog.map(item=>item.id==='system'?{...item,name:'Other System'}:item);
 assert.equal(priceQuotation([opening],[choice],foreign,'indoor-sales').total,100000);
});

for(const [label,rate] of [['below minimum',239999],['unsafe integer',Number.MAX_SAFE_INTEGER+1],['extreme finite rate',1e20],['fractional IQD',470000.5],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['zero',0],['negative',-240000],['numeric string','470000'],['null',null],['boolean',true],['object',{}],['array',[470000]]])test(`rejects ${label} quotation rates instead of coercing them`,()=>{
 assert.throws(()=>quote(rate),/at least 240,000 IQD, using whole IQD/);
});

for(const patch of [{name:'Other System'},{name:'Alumextra System'},{category:'opening_product'},{unit:'item'},{unit:'meter'},{unit:'project'},{is_active:false}])test(`a forged rate cannot override an ineligible product ${JSON.stringify(patch)}`,()=>{
 const products=catalog.map(item=>item.id==='system'?{...item,...patch}:item);
 assert.throws(()=>quote(270000,products));
});

test('facade, louver, glass, and standalone products cannot receive a system rate through selections',()=>{
 const cases=[
  {opening_type:'Curtain Wall',product:product('system','Curtain Wall','facade_service','sqm',240000)},
  {opening_type:'Louver',product:product('system','Louver','opening_product','sqm',240000)},
  {opening_type:'Window',product:product('system','Alumex Glass','glass_option','sqm',240000)},
  {opening_type:'Door',product:product('system','Alumex Door','standalone_product','item',240000)},
 ];
 for(const entry of cases){
  const products=catalog.map(item=>item.id==='system'?entry.product:item);
  assert.throws(()=>quote(270000,products,{...opening,opening_type:entry.opening_type}));
 }
});

test('quotation rates retain each repeated window minimum and all accessory units',()=>{
 const result=quote(270000,catalog,{...opening,quantity:4},{...choice,glassId:'glass',extras:[{id:'shutter',quantity:99,motorPrice:10000},{id:'handle',quantity:2},{id:'bars',quantity:1.5}]});
 const line=result.lines[0];
 assert.equal(line.area,2,'Measured area remains separate from billable window minimums');
 assert.equal(line.system.quantity,4);
 assert.equal(line.system.total,1080000);
 assert.equal(line.glass.rate,20000);
 assert.equal(line.glass.total,80000);
 assert.equal(line.extras[0].unit,'item');
 assert.deepEqual(line.extras.map(item=>({id:item.id,rate:item.rate,quantity:item.quantity,total:item.total})),[
  {id:'shutter',rate:30000,quantity:4,total:120000},
  {id:'roller-shutter-motor:shutter',rate:10000,quantity:4,total:40000},
  {id:'handle',rate:5000,quantity:8,total:40000},
  {id:'bars',rate:2000,quantity:6,total:12000},
 ]);
 assert.equal(result.total,1372000);
 assert.equal(Object.hasOwn(line.glass,'rateSource'),false);
 assert.ok(line.extras.every(item=>!Object.hasOwn(item,'rateSource')));
});

test('large windows and doors use their measured area with quotation-specific rates',()=>{
 const large=quote(470000,catalog,{...opening,width:150,quantity:3});
 assert.equal(large.lines[0].system.quantity,4.5);
 assert.equal(large.total,2115000);
 const door=quote(470000,catalog,{...opening,opening_type:'Door',quantity:3});
 assert.equal(door.lines[0].system.quantity,1.5);
 assert.equal(door.total,705000);
});

test('quotation-specific rates remain local to their selected opening and leave other quotations and contracts unchanged',()=>{
 const second={...opening,id:'second',width:150};
 const saved=priceQuotation([opening,second],[choice,{...choice,openingId:'second'}],catalog,'previous-author');
 const contract={quotation:structuredClone(saved)};
 const inputs={openings:[opening,second],choices:[{...choice,systemRate:470000},{...choice,openingId:'second'}],catalog,saved,contract};
 const before=structuredClone(inputs);
 const result=priceQuotation(inputs.openings,inputs.choices,catalog,'indoor-sales',[
  {id:'facade',quantity:1,measurements:[{label:'North facade',width:2,height:3,quantity:1}]},
  {id:'standalone',quantity:2},
 ]);
 assert.equal(result.lines[0].system.rate,470000);
 assert.equal(result.lines[1].system.rate,240000);
 assert.equal(Object.hasOwn(result.lines[1].system,'rateSource'),false);
 assert.equal(result.additionalItems[0].rate,100000);
 assert.equal(result.additionalItems[1].rate,100000);
 assert.deepEqual(inputs,before);
});

test('refresh preserves explicit rates while updating catalog-priced systems, glass, add-ons, and additional items',()=>{
 const second={...opening,id:'second',width:150,quantity:2};
 const selected={...choice,systemRate:470000,glassId:'glass',extras:[{id:'handle',quantity:2}]};
 const saved=priceQuotation([{...opening,quantity:4},second],[selected,{...choice,openingId:'second'}],catalog,'original-author',[
  {id:'facade',quantity:1,measurements:[{label:'North facade',width:2,height:3,quantity:1}]},
  {id:'standalone',quantity:2},
 ]);
 const before=structuredClone(saved);
 const changed=catalog.map(item=>({...item,unit_price:item.unit_price*2}));
 const catalogBefore=structuredClone(changed);
 const refreshed=repriceQuotation(saved,changed,'refresher');
 assert.equal(refreshed.lines[0].system.rate,470000);
 assert.equal(refreshed.lines[0].system.rateSource,'quotation');
 assert.equal(refreshed.lines[0].system.quantity,4);
 assert.equal(refreshed.lines[0].system.total,1880000);
 assert.equal(refreshed.lines[0].glass.total,160000);
 assert.equal(refreshed.lines[0].extras[0].quantity,8);
 assert.equal(refreshed.lines[0].extras[0].total,80000);
 assert.equal(refreshed.lines[1].system.rate,480000);
 assert.equal(refreshed.lines[1].system.total,1440000);
 assert.equal(refreshed.additionalItems[0].total,1200000);
 assert.equal(refreshed.additionalItems[1].total,400000);
 assert.equal(refreshed.total,5160000);
 assert.equal(refreshed.preparedBy,'refresher');
 assert.deepEqual(saved,before);
 assert.deepEqual(changed,catalogBefore);
 assert.deepEqual(repriceQuotation(refreshed,changed,'again').lines,refreshed.lines,'Repeated refresh must not multiply saved quantities');
});

test('an explicit catalog-equal quotation rate stays fixed while an identical unmarked rate refreshes',()=>{
 const marked=quote(240000);
 const unmarked=priceQuotation([opening],[choice],catalog,'indoor-sales');
 assert.notEqual(quotationPriceKey(marked),quotationPriceKey(unmarked));
 const changed=catalog.map(item=>item.id==='system'?{...item,unit_price:280000}:item);
 assert.equal(repriceQuotation(marked,changed,'refresher').total,240000);
 assert.equal(repriceQuotation(unmarked,changed,'refresher').total,280000);
});

test('refresh rejects malformed saved overrides and leaves the saved quotation unchanged',()=>{
 for(const rate of [239999,Number.MAX_SAFE_INTEGER+1,470000.5,NaN,Infinity,'470000',null]){
  const saved=quote(270000);
  saved.lines[0].system.rate=rate;
  const before=structuredClone(saved);
  assert.throws(()=>repriceQuotation(saved,catalog,'refresher'));
  assert.deepEqual(saved,before);
 }
 const unknownSource=quote(270000);
 unknownSource.lines[0].system.rateSource='catalog';
 assert.throws(()=>repriceQuotation(unknownSource,catalog,'refresher'));
});

test('safe manual rates still reject unsafe multiplied opening totals and unsafe quotation sums',()=>{
 const measured={...opening,quantity:2};
 const before=structuredClone({measured,catalog});
 assert.throws(()=>quote(Number.MAX_SAFE_INTEGER,catalog,measured),/Invalid amount/);
 assert.deepEqual({measured,catalog},before);
 const second={...opening,id:'second'};
 const rate=Math.ceil(Number.MAX_SAFE_INTEGER/2);
 const choices=[{...choice,systemRate:rate},{...choice,openingId:'second',systemRate:rate}];
 assert.throws(()=>priceQuotation([opening,second],choices,catalog,'indoor-sales'),/Add a measured opening/);
 const saved=quote(470000,catalog,measured);
 saved.lines[0].system.rate=Number.MAX_SAFE_INTEGER;
 const savedBefore=structuredClone(saved);
 assert.throws(()=>repriceQuotation(saved,catalog,'refresher'),/Invalid amount/);
 assert.deepEqual(saved,savedBefore);
});

test('saved quotation rates cannot bypass current product, price, availability, category, or unit validation',()=>{
 const saved=quote(270000);
 const before=structuredClone(saved);
 for(const patch of [{name:'Other System'},{category:'opening_product'},{is_active:false},{unit:'item'},{unit_price:0},{unit_price:NaN},{unit_price:Infinity}]){
  const changed=catalog.map(item=>item.id==='system'?{...item,...patch}:item);
  assert.throws(()=>repriceQuotation(saved,changed,'refresher'));
 }
 assert.throws(()=>repriceQuotation(saved,catalog.filter(item=>item.id!=='system'),'refresher'));
 assert.deepEqual(saved,before);
});

test('forged quotation rate markers on glass, add-ons, and additional items fail during refresh',()=>{
 const saved=priceQuotation([opening],[{...choice,systemRate:270000,glassId:'glass',extras:[{id:'handle',quantity:1}]}],catalog,'indoor-sales',[{id:'standalone',quantity:1}]);
 for(const select of [q=>q.lines[0].glass,q=>q.lines[0].extras[0],q=>q.additionalItems[0]]){
  const forged=structuredClone(saved);
  const charge=select(forged);charge.rateSource='quotation';charge.rate=270000;
  const before=structuredClone(forged);
  assert.throws(()=>repriceQuotation(forged,catalog,'refresher'),/only be applied to the opening system/);
  assert.deepEqual(forged,before);
 }
});
