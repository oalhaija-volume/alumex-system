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
const catalogRules=load('../src/lib/workflow/catalogRules.ts');
const {openingMinimumSellingRate,openingSellingBand,isAlumexSqmSystem,quotationSellingSuggestion,defaultSystem,systemOptions,priceQuotation,repriceQuotation}=load('../src/lib/workflow/pricing.ts',{'./catalogRules':catalogRules});
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('second-system','Alumex Sliding Window','aluminum_system','sqm',265000),
 product('other-system','Other System','aluminum_system','sqm',100000),
 product('glass','Low-E Glass','glass_option','sqm',100000),
 product('shutter','Roller Shutter - Foam','addon','sqm',500000),
 product('curtain','Curtain Wall','facade_service','sqm',100000),
 product('louver','Louver','opening_product','sqm',100000),
 product('facade','Cladding','facade_service','sqm',100000),
 product('standalone','A Swing Door','standalone_product','item',100000),
];
const opening=(id,area,quantity=1,opening_type='Window',opening_direction='Sliding')=>({id,floor:'Ground',room:'Office',width:area*100,height:100,quantity,opening_type,opening_direction});
const choice=(openingId,systemId='system')=>({openingId,systemId,extras:[]});
const quote=(openings,choices=openings.map(item=>choice(item.id)),products=catalog,additionalItems=[])=>priceQuotation(openings,choices,products,'indoor-sales',additionalItems);

for(const [area,minimum,belowBand] of [
 [0.5,278000,'red'],[3,278000,'red'],
 [3.0001,265000,'orange'],[3.9999,265000,'orange'],
 [4,250000,'yellow'],[5.9999,250000,'yellow'],
 [6,240000,'red'],[12,240000,'red'],
])test(`${area} sqm becomes green at exactly ${minimum} IQD per sqm`,()=>{
 assert.equal(openingMinimumSellingRate(area),minimum);
 assert.equal(openingSellingBand(area,minimum-1),belowBand);
 assert.equal(openingSellingBand(area,minimum),'green');
 assert.equal(openingSellingBand(area,minimum+1),'green');
});

test('invalid measured areas and selling rates never show green',()=>{
 for(const area of [0,-1,NaN,Infinity,-Infinity])assert.equal(openingSellingBand(area,300000),'red',`Invalid area ${area}`);
 for(const rate of [0,-1,NaN,Infinity,-Infinity])assert.equal(openingSellingBand(6,rate),'red',`Invalid selling rate ${rate}`);
});

for(const [opening_type,minimum] of [['Window',260000],['Door',305000]])test(`hinged ${opening_type} uses ${minimum} IQD per sqm regardless of size`,()=>{
 for(const area of [0.5,3,3.0001,4,6,12]){
  const hinged=opening('hinged',area,1,opening_type,'Hinged');
  assert.equal(openingMinimumSellingRate(area,hinged),minimum,`${area} sqm`);
  assert.notEqual(openingSellingBand(area,minimum-1,hinged),'green',`${area} sqm below minimum`);
  assert.equal(openingSellingBand(area,minimum,hinged),'green',`${area} sqm at minimum`);
  assert.equal(openingSellingBand(area,minimum+1,hinged),'green',`${area} sqm above minimum`);
 }
});

test('manual window and door system rates can exceed the old ceilings without changing green targets',()=>{
 for(const opening_type of ['Window','Door'])for(const opening_direction of ['Sliding','Hinged']){
  const measured=opening('custom',4,1,opening_type,opening_direction);
  for(const rate of [300001,305001,321053,470000]){
   const adjusted=quote([measured],[{...choice(measured.id),systemRate:rate}]);
   assert.equal(adjusted.lines[0].system.rate,rate);
   assert.equal(adjusted.total,rate*4);
   assert.equal(quotationSellingSuggestion(adjusted,catalog).allGreen,rate>=openingMinimumSellingRate(4,measured));
  }
 }
});

test('Alumex square-metre identification uses the product name boundary and unit',()=>{
 for(const name of ['Alumex',' Alumex System ','ALUMEX Thermal Break','Alumex-System'])assert.equal(isAlumexSqmSystem({name,unit:'sqm'}),true,name);
 for(const name of ['Other System','Alumextra System','Premium Alumex System','Alumex_System'])assert.equal(isAlumexSqmSystem({name,unit:'sqm'}),false,name);
 for(const unit of ['item','meter','project'])assert.equal(isAlumexSqmSystem({name:'Alumex System',unit}),false,unit);
 assert.equal(isAlumexSqmSystem(null),false);
 assert.equal(isAlumexSqmSystem(undefined),false);
});

test('the initial quotation keeps catalog prices and returns separate, nonmutating selling guidance',()=>{
 const openings=[opening('small',3),opening('medium',3.5),opening('larger',4),opening('large',6)];
 const choices=openings.map(item=>choice(item.id));
 const before=structuredClone({openings,choices,catalog});
 const initial=quote(openings,choices);
 const saved=structuredClone(initial);
 assert.ok(initial.lines.every(line=>line.system.rate===240000));
 assert.ok(initial.lines.every(line=>!Object.hasOwn(line.system,'rateSource')));
 assert.deepEqual(quotationSellingSuggestion(initial,catalog),{rate:4201500/16.5,openingCount:4,allGreen:false,canApply:true,billableArea:16.5,systemTotal:4201500,openingRates:[{openingId:'small',rate:278000},{openingId:'medium',rate:265000},{openingId:'larger',rate:250000},{openingId:'large',rate:240000}]});
 assert.deepEqual(initial,saved);
 assert.deepEqual({openings,choices,catalog},before);
 assert.equal(quote([opening('another-quotation',4)]).lines[0].system.rate,240000);
});

test('guidance uses each physical opening size and quantity rather than accumulated or billable area',()=>{
 const small=quote([opening('small',0.5,10)]);
 assert.equal(small.lines[0].area,5);
 assert.equal(small.lines[0].system.quantity,10,'The one-sqm minimum applies separately to each window');
 assert.deepEqual(quotationSellingSuggestion(small,catalog),{rate:278000,openingCount:10,allGreen:false,canApply:true,billableArea:10,systemTotal:2780000,openingRates:[{openingId:'small',rate:278000}]});
 const large=quote([opening('large',6,7)]);
 assert.equal(large.lines[0].area,42);
 assert.deepEqual(quotationSellingSuggestion(large,catalog),{rate:240000,openingCount:7,allGreen:true,canApply:true,billableArea:42,systemTotal:10080000,openingRates:[{openingId:'large',rate:240000}]});
});

test('two 3-sqm windows and one 6-sqm window produce an overall rate of exactly 259000 IQD',()=>{
 const initial=quote([opening('small-one',3),opening('small-two',3),opening('large',6)]);
 assert.deepEqual(quotationSellingSuggestion(initial,catalog),{rate:259000,openingCount:3,allGreen:false,canApply:true,billableArea:12,systemTotal:3108000,openingRates:[{openingId:'small-one',rate:278000},{openingId:'small-two',rate:278000},{openingId:'large',rate:240000}]});
});

test('the overall sqm recommendation weights each opening target by billed area and repeated quantities',()=>{
 const initial=quote([opening('small',3),opening('many-large',6,100)]);
 assert.deepEqual(quotationSellingSuggestion(initial,catalog),{rate:144834000/603,openingCount:101,allGreen:false,canApply:true,billableArea:603,systemTotal:144834000,openingRates:[{openingId:'small',rate:278000},{openingId:'many-large',rate:240000}]});
 const withoutSmall=quote([opening('medium',3.5),opening('large',8,100)]);
 assert.deepEqual(quotationSellingSuggestion(withoutSmall,catalog),{rate:192927500/803.5,openingCount:101,allGreen:false,canApply:true,billableArea:803.5,systemTotal:192927500,openingRates:[{openingId:'medium',rate:265000},{openingId:'large',rate:240000}]});
});

test('the overall denominator preserves saved billed quantities, including historical window minimums',()=>{
 const historical=quote([opening('small',0.5,2),opening('large',6)]);
 historical.lines[0].system.quantity=1;
 historical.lines[0].system.total=240000;
 assert.deepEqual(quotationSellingSuggestion(historical,catalog),{rate:1718000/7,openingCount:3,allGreen:false,canApply:true,billableArea:7,systemTotal:1718000,openingRates:[{openingId:'small',rate:278000},{openingId:'large',rate:240000}]});
});

test('glass, add-ons and standalone charges cannot make an underpriced opening green',()=>{
 const initial=quote([opening('small',3)],[{...choice('small'),glassId:'glass',extras:[{id:'shutter',quantity:1,motorPrice:10000}]}],catalog,[
  {id:'facade',quantity:1,measurements:[{label:'North facade',width:10,height:10,quantity:1}]},
  {id:'standalone',quantity:20},
 ]);
 assert.ok(initial.lines[0].total/initial.lines[0].area>278000);
 assert.deepEqual(quotationSellingSuggestion(initial,catalog),{rate:278000,openingCount:1,allGreen:false,canApply:true,billableArea:3,systemTotal:834000,openingRates:[{openingId:'small',rate:278000}]});
});

test('each eligible saved rate must meet its own size minimum before all openings are green',()=>{
 const openings=[opening('small',3),opening('medium',3.5),opening('larger',4),opening('large',6)];
 const minima=[278000,265000,250000,240000];
 const selections=openings.map((item,index)=>({...choice(item.id),systemRate:minima[index]}));
 const individuallyGreen=quote(openings,selections);
 assert.deepEqual(quotationSellingSuggestion(individuallyGreen,catalog),{rate:4201500/16.5,openingCount:4,allGreen:true,canApply:true,billableArea:16.5,systemTotal:4201500,openingRates:[{openingId:'small',rate:278000},{openingId:'medium',rate:265000},{openingId:'larger',rate:250000},{openingId:'large',rate:240000}]});
 for(let index=0;index<3;index++){
  const underpriced=quote(openings,selections.map((selection,i)=>i===index?{...selection,systemRate:selection.systemRate-1}:selection));
  assert.equal(quotationSellingSuggestion(underpriced,catalog).allGreen,false,`${openings[index].id} is below its minimum`);
 }
});

test('applying each suggested target through explicit choices survives saving and catalog-price refresh',()=>{
 const openings=[opening('small',0.5,3),opening('medium',3.5),opening('hinged-window',0.5,2,'Window','Hinged'),opening('hinged-door',6,2,'Door','Hinged')];
 const initial=quote(openings);
 const suggestion=quotationSellingSuggestion(initial,catalog);
 const expectedRates=[{openingId:'small',rate:278000},{openingId:'medium',rate:265000},{openingId:'hinged-window',rate:260000},{openingId:'hinged-door',rate:305000}];
 assert.deepEqual(suggestion,{rate:5941500/20.5,openingCount:8,allGreen:false,canApply:true,billableArea:20.5,systemTotal:5941500,openingRates:expectedRates});
 const adjusted=quote(openings,suggestion.openingRates.map(({openingId,rate})=>({...choice(openingId),systemRate:rate})));
 const changedCatalog=catalog.map(item=>({...item,unit_price:item.unit_price+10000}));
 const before=structuredClone({initial,adjusted,catalog,changedCatalog});
 const restored=JSON.parse(JSON.stringify(adjusted));
 const refreshed=repriceQuotation(restored,changedCatalog,'refresher');
 for(const result of [adjusted,restored,refreshed]){
  assert.deepEqual(result.lines.map(line=>line.system.rate),[278000,265000,260000,305000]);
  assert.ok(result.lines.every(line=>line.system.rateSource==='quotation'));
  assert.deepEqual(quotationSellingSuggestion(result,changedCatalog),{rate:5941500/20.5,openingCount:8,allGreen:true,canApply:true,billableArea:20.5,systemTotal:5941500,openingRates:expectedRates});
 }
 assert.deepEqual(refreshed.lines.map(line=>line.system.quantity),[3,3.5,2,12]);
 assert.deepEqual({initial,adjusted,catalog,changedCatalog},before);
});

test('fractional blended averages are display values and do not replace per-opening rates or rounded monetary totals',()=>{
 const openings=[opening('small',3),opening('large',6.123456)];
 const suggestion=quotationSellingSuggestion(quote(openings),catalog);
 assert.equal(suggestion.systemTotal,2303629);
 assert.equal(suggestion.billableArea,3+6.123456);
 assert.equal(suggestion.rate,2303629/(3+6.123456));
 assert.equal(Number.isInteger(suggestion.rate),false);
 const adjusted=quote(openings,suggestion.openingRates.map(({openingId,rate})=>({...choice(openingId),systemRate:rate})));
 assert.deepEqual(adjusted.lines.map(line=>line.system.rate),[278000,240000]);
 assert.deepEqual(adjusted.lines.map(line=>line.system.total),[834000,1469629]);
 assert.equal(adjusted.total,suggestion.systemTotal);
 assert.throws(()=>quote(openings,openings.map(item=>({...choice(item.id),systemRate:suggestion.rate}))));
});

test('high manual rates survive refresh for every eligible window and door type',()=>{
 const hingedDoor=opening('hinged-door',2,1,'Door','Hinged');
 for(const [opening_type,opening_direction] of [['Window','Sliding'],['Window','Hinged'],['Door','Sliding'],['Door','Hinged']]){
  const measured={...hingedDoor,opening_type,opening_direction};
  const adjusted=quote([measured],[{...choice(measured.id),systemRate:470000}]);
  const before=structuredClone(adjusted);
  assert.equal(adjusted.total,940000);
  assert.equal(repriceQuotation(adjusted,catalog,'refresh').lines[0].system.rate,470000);
  assert.deepEqual(adjusted,before);
 }
 assert.throws(()=>quote([hingedDoor],[{...choice(hingedDoor.id),systemRate:470000.5}]));
});

test('discounted hinged-door guidance can apply its exact 321053-IQD target above the former ceiling',()=>{
 const measured=opening('hinged-door',2,1,'Door','Hinged');
 const initial=priceQuotation([measured],[{...choice(measured.id),systemRate:305000}],catalog,'indoor-sales',[],5);
 const before=structuredClone(initial);
 const suggestion=quotationSellingSuggestion(initial,catalog);
 assert.equal(suggestion.canApply,true);
 assert.equal(suggestion.allGreen,false);
 assert.deepEqual(suggestion.openingRates,[{openingId:'hinged-door',rate:321053}]);
 const adjusted=priceQuotation([measured],[{...choice(measured.id),systemRate:suggestion.openingRates[0].rate}],catalog,'indoor-sales',[],5);
 assert.equal(adjusted.discount.subtotal,642106);
 assert.equal(adjusted.total,610001);
 assert.equal(quotationSellingSuggestion(adjusted,catalog).allGreen,true);
 assert.deepEqual(initial,before);
});

test('guidance rejects unsafe suggested totals without imposing a business ceiling on safe rates',()=>{
 const initial=quote([opening('large',6)]);
 initial.lines[0].system.quantity=Number.MAX_SAFE_INTEGER;
 assert.equal(quotationSellingSuggestion(initial,catalog).canApply,false);
});

test('the all-green check compares hinged openings with their type target even when their size tier is already green',()=>{
 for(const [opening_type,rate] of [['Window',260000],['Door',305000]]){
  const measured=opening('hinged',6,1,opening_type,'Hinged');
  const underpriced=quote([measured],[{...choice('hinged'),systemRate:rate-1}]);
  const green=quote([measured],[{...choice('hinged'),systemRate:rate}]);
  assert.equal(quotationSellingSuggestion(underpriced,catalog).allGreen,false,opening_type);
  assert.equal(quotationSellingSuggestion(green,catalog).allGreen,true,opening_type);
 }
});

test('only eligible Alumex Window and Door systems contribute to the recommendation and physical count',()=>{
 const openings=[opening('door',4,2,'Door'),opening('foreign',1,8),opening('standalone-door',1,9,'Door'),opening('curtain',1,10,'Curtain Wall'),opening('louver',1,11,'Louver')];
 const initial=quote(openings,[choice('door'),choice('foreign','other-system'),choice('standalone-door','standalone'),choice('curtain','curtain'),choice('louver','louver')]);
 assert.deepEqual(quotationSellingSuggestion(initial,catalog),{rate:250000,openingCount:2,allGreen:false,canApply:true,billableArea:8,systemTotal:2000000,openingRates:[{openingId:'door',rate:250000}]});
 const renamed=structuredClone(initial);
 renamed.lines[1].system.name='Alumex System';
 assert.deepEqual(quotationSellingSuggestion(renamed,catalog),{rate:250000,openingCount:2,allGreen:false,canApply:true,billableArea:8,systemTotal:2000000,openingRates:[{openingId:'door',rate:250000}]},'A saved display name cannot bypass the corresponding catalog product');
});

test('inactive, missing, renamed and non-system catalog products are excluded from saved-quotation guidance',()=>{
 const initial=quote([opening('window',3)]);
 for(const patch of [{is_active:false},{name:'Other System'},{category:'opening_product'},{category:'standalone_product'},{unit:'item'}]){
  const products=catalog.map(item=>item.id==='system'?{...item,...patch}:item);
  assert.equal(quotationSellingSuggestion(initial,products),null,JSON.stringify(patch));
 }
 assert.equal(quotationSellingSuggestion(initial,catalog.filter(item=>item.id!=='system')),null);
});

test('non-Window and non-Door snapshots cannot contribute even when their saved system is Alumex',()=>{
 const initial=quote([opening('window',3)]);
 for(const opening_type of ['Curtain Wall','Louver','Facade','Skylight',null]){
  const excluded=structuredClone(initial);
  excluded.lines[0].opening.opening_type=opening_type;
  assert.equal(quotationSellingSuggestion(excluded,catalog),null,`${opening_type}`);
 }
});

test('an empty quotation or one containing only additional products has no opening suggestion',()=>{
 const onlyAdditional=quote([],[],catalog,[{id:'standalone',quantity:2}]);
 assert.equal(quotationSellingSuggestion(onlyAdditional,catalog),null);
 assert.equal(quotationSellingSuggestion({...onlyAdditional,additionalItems:[],total:0},catalog),null);
});

const hingedCatalog=[
 product('base-system','Alumex System','aluminum_system','sqm',240000),
 product('hinged-window-system','Alumex Hinged Window','aluminum_system','sqm',260000),
 product('hinged-door-system','Alumex Hinged Door','aluminum_system','sqm',305000),
];

test('canonical hinged catalog products are selected by opening type while sliding openings retain the base system',()=>{
 const before=structuredClone(hingedCatalog);
 const cases=[
  [opening('hinged-window',0.5,1,'Window','Hinged'),'hinged-window-system'],
  [opening('hinged-door',2,1,'Door','Hinged'),'hinged-door-system'],
  [opening('sliding-window',3),'base-system'],
  [opening('sliding-door',6,1,'Door'),'base-system'],
 ];
 for(const [measured,expectedId] of cases){
  const selected=defaultSystem(measured,hingedCatalog);
  assert.equal(selected.id,expectedId,measured.id);
  assert.ok(systemOptions(measured,hingedCatalog).some(item=>item.id===selected.id));
 }
 assert.deepEqual(hingedCatalog,before);
});

test('initial quotations use distinct hinged catalog prices without overrides and retain sliding size targets in the weighted suggestion',()=>{
 const openings=[opening('hinged-window',0.5,2,'Window','Hinged'),opening('hinged-door',2,3,'Door','Hinged'),opening('sliding-window',3,2),opening('sliding-door',6,1,'Door')];
 const selections=openings.map(measured=>choice(measured.id,defaultSystem(measured,hingedCatalog).id));
 const before=structuredClone({openings,selections,catalog:hingedCatalog});
 const initial=quote(openings,selections,hingedCatalog);
 assert.deepEqual(initial.lines.map(line=>({id:line.system.id,rate:line.system.rate,quantity:line.system.quantity,total:line.system.total})),[
  {id:'hinged-window-system',rate:260000,quantity:2,total:520000},
  {id:'hinged-door-system',rate:305000,quantity:6,total:1830000},
  {id:'base-system',rate:240000,quantity:6,total:1440000},
  {id:'base-system',rate:240000,quantity:6,total:1440000},
 ]);
 assert.ok(initial.lines.every(line=>!Object.hasOwn(line.system,'rateSource')));
 assert.equal(initial.total,5230000);
 assert.deepEqual(quotationSellingSuggestion(initial,hingedCatalog),{
  rate:272900,openingCount:8,allGreen:false,canApply:true,billableArea:20,systemTotal:5458000,
  openingRates:[{openingId:'hinged-window',rate:260000},{openingId:'hinged-door',rate:305000},{openingId:'sliding-window',rate:278000},{openingId:'sliding-door',rate:240000}],
 });
 assert.deepEqual({openings,selections,catalog:hingedCatalog},before);
 const refreshed=repriceQuotation(initial,hingedCatalog,'refresher');
 assert.deepEqual(refreshed.lines,initial.lines);
 assert.equal(refreshed.total,initial.total);
});

test('adding hinged catalog products preserves existing quotation snapshots and refreshes their saved product IDs',()=>{
 const openings=[opening('existing-window',2,1,'Window','Hinged'),opening('existing-door',2,1,'Door','Hinged')];
 const selections=openings.map(measured=>choice(measured.id,'base-system'));
 const previous=quote(openings,selections,[hingedCatalog[0]]);
 const contract={quotation:structuredClone(previous)};
 const before=structuredClone({previous,contract,catalog:hingedCatalog});
 const refreshed=repriceQuotation(previous,hingedCatalog,'refresher');
 assert.deepEqual(refreshed.lines,previous.lines);
 assert.equal(refreshed.total,960000);
 assert.ok(refreshed.lines.every(line=>line.system.id==='base-system'&&line.system.rate===240000));
 assert.deepEqual({previous,contract,catalog:hingedCatalog},before);
 const newlySelected=openings.map(measured=>choice(measured.id,defaultSystem(measured,hingedCatalog).id));
 assert.deepEqual(quote(openings,newlySelected,hingedCatalog).lines.map(line=>line.system.rate),[260000,305000]);
});
