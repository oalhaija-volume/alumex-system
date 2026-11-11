import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,dependencies={}){
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',source)(name=>{assert.ok(name in dependencies,`Unexpected dependency: ${name}`);return dependencies[name];},exports);
 return exports;
}
const rules=load('../src/lib/workflow/catalogRules.ts');
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules});
const {quotationRateGroups,applyQuotationGroupRate}=load('../src/lib/quotations/groupRates.ts',{'@/lib/workflow/catalogRules':rules,'@/lib/workflow/pricing':pricing});
const {priceQuotation,repriceQuotation,quotationAdditionalChoices,isQuotationCurtainRateEditable,isQuotationSystemRateEditable,isAlumexSqmSystem,quotationSellingSuggestion}=pricing;
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('hinged','Alumex Hinged Window','aluminum_system','sqm',260000),
 product('other','Other System','aluminum_system','sqm',300000),
 product('special','Lift & Slide','opening_product','sqm',400000),
 product('curtain','Curtain Wall','facade_service','sqm',180000),
 product('cladding','Cladding','facade_service','sqm',100000),
 product('pushout','Curtain Wall Pushout','standalone_product','item',90000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('film','Glass film shades','addon','sqm',10000),
 product('handle','Handle','addon','item',5000),
 product('standalone','A Swing Door','standalone_product','item',150000),
 {...product('inactive','Alumex Retired','aluminum_system','sqm',240000),is_active:false},
];
const measured=(id,opening_type='Window',opening_direction='Sliding',quantity=1)=>({id,opening_type,opening_direction,quantity,width:50,height:100,floor:'Ground',room:'Office'});
const selection=(openingId,systemId='system',patch={})=>({openingId,systemId,extras:[],...patch});
const additional=[
 {id:'curtain',quantity:1,measurements:[{label:'North',width:2,height:3,quantity:2}],extras:[{id:'film',quantity:1}]},
 {id:'cladding',quantity:1,measurements:[{label:'South',width:2,height:2,quantity:1}]},
 {id:'pushout',quantity:2},
 {id:'curtain-wall-arch',quantity:1},
];

test('all three bulk groups are always returned with the shared minimum and no empty-group rate',()=>{
 assert.deepEqual(quotationRateGroups([],[],[],catalog),[
  {id:'sliding',openingIds:[],additionalItemIds:[],count:0,minimum:250000},
  {id:'hinged',openingIds:[],additionalItemIds:[],count:0,minimum:250000},
  {id:'curtain-wall',openingIds:[],additionalItemIds:[],count:0,minimum:250000},
 ]);
});

test('groups use exact opening types and directions, eligible selected products, and line counts',()=>{
 const openings=[measured('small','Window','Sliding',3),measured('large'),measured('hinged','Window','Hinged',2),measured('door','Door'),measured('louver','Louver'),measured('special'),measured('foreign'),measured('retired'),measured('lowercase','Window','sliding'),measured('wall','Curtain Wall',null,4),measured('wrong-wall','Curtain Wall'),measured('facade','Facade'),measured('skylight','Skylight')];
 const choices=[selection('small'),selection('large','system',{systemRate:270000}),selection('hinged','hinged'),selection('door'),selection('louver'),selection('special','special'),selection('foreign','other'),selection('retired','inactive'),selection('lowercase'),selection('wall','curtain'),selection('wrong-wall','pushout'),selection('facade','curtain'),selection('skylight','curtain'),selection('excluded')];
 const before=structuredClone({openings,choices,additional,catalog});
 const groups=quotationRateGroups(openings,choices,additional,catalog);
 assert.deepEqual(groups[0],{id:'sliding',openingIds:['small','large'],additionalItemIds:[],count:2,minimum:250000});
 assert.deepEqual(groups[1],{id:'hinged',openingIds:['hinged'],additionalItemIds:[],count:1,minimum:250000,rate:260000});
 assert.deepEqual(groups[2],{id:'curtain-wall',openingIds:['wall'],additionalItemIds:['curtain'],count:2,minimum:250000,rate:180000});
 assert.deepEqual({openings,choices,additional,catalog},before);
 const common=quotationRateGroups(openings,choices.map(choice=>choice.openingId==='large'?{...choice,systemRate:240000}:choice),additional,catalog);
 assert.equal(common[0].rate,240000,'A historical explicit catalog-equal rate and an implicit catalog rate share the same effective rate');
 assert.equal(quotationRateGroups(openings,choices,[{...additional[0],unitRate:250000}],catalog)[2].rate,undefined);
});

test('applying a bulk proposal changes only its current active group and leaves original choices intact for cancellation',()=>{
 const openings=[measured('sliding'),measured('hinged','Window','Hinged'),measured('door','Door'),measured('special'),measured('wall','Curtain Wall')];
 const choices=[selection('sliding','system',{glassId:'glass',extras:[{id:'handle',quantity:2}],hasCurtainWallArch:false}),selection('hinged','hinged'),selection('door'),selection('special','special'),selection('wall','curtain'),selection('excluded')];
 const inputs={openings,choices,additional,catalog},before=structuredClone(inputs);
 const sliding=applyQuotationGroupRate('sliding',270000,openings,choices,additional,catalog);
 assert.equal(sliding.choices[0].systemRate,270000);
 assert.deepEqual(sliding.choices[0].extras,choices[0].extras);
 for(let i=1;i<choices.length;i++)assert.strictEqual(sliding.choices[i],choices[i]);
 assert.deepEqual(sliding.additionalItems,additional);
 const curtain=applyQuotationGroupRate('curtain-wall',265000,openings,choices,additional,catalog);
 assert.equal(curtain.choices[4].systemRate,265000);
 assert.equal(curtain.additionalItems[0].unitRate,265000);
 assert.deepEqual(curtain.additionalItems[0].measurements,additional[0].measurements);
 assert.deepEqual(curtain.additionalItems[0].extras,additional[0].extras);
 for(let i=1;i<additional.length;i++)assert.strictEqual(curtain.additionalItems[i],additional[i]);
 assert.deepEqual(inputs,before,'Discarding a proposed result leaves the live quotation selections unchanged');
 assert.equal(quotationRateGroups(openings,choices,additional,catalog)[0].rate,240000);
 const retired=catalog.map(item=>item.id==='system'?{...item,is_active:false}:item);
 assert.deepEqual(applyQuotationGroupRate('sliding',280000,openings,choices,additional,retired).choices,choices);
});

test('all bulk groups reject below-minimum rates and accept 250000 whole IQD and higher without coercing values',()=>{
 const openings=[measured('window'),measured('hinged','Window','Hinged'),measured('wall','Curtain Wall')],choices=[selection('window'),selection('hinged','hinged'),selection('wall','curtain')];
 for(const group of ['sliding','hinged','curtain-wall'])for(const rate of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'270000',null,true,{},[]])assert.throws(()=>applyQuotationGroupRate(group,rate,openings,choices,additional,catalog),/using whole IQD/);
 for(const [group,openingId] of [['sliding','window'],['hinged','hinged'],['curtain-wall','wall']]){
  const before=structuredClone({openings,choices,additional,catalog});
  for(const rate of [240000,249999])assert.throws(()=>applyQuotationGroupRate(group,rate,openings,choices,additional,catalog),/at least 250,000/);
  for(const rate of [250000,250001,265000]){
   const accepted=applyQuotationGroupRate(group,rate,openings,choices,additional,catalog);
   assert.equal(accepted.choices.find(choice=>choice.openingId===openingId).systemRate,rate);
   if(group==='curtain-wall')assert.equal(accepted.additionalItems[0].unitRate,rate);
  }
  assert.deepEqual({openings,choices,additional,catalog},before);
 }
 assert.throws(()=>applyQuotationGroupRate('other',270000,openings,choices,additional,catalog),/valid quotation rate group/);
});

test('direct quotation pricing enforces the shared minimum on every measured group and standalone Curtain Wall',()=>{
 for(const [opening,choice] of [[measured('sliding'),selection('sliding')],[measured('hinged','Window','Hinged'),selection('hinged','hinged')],[measured('wall','Curtain Wall'),selection('wall','curtain')]]){
  for(const rate of [240000,249999])assert.throws(()=>priceQuotation([opening],[{...choice,systemRate:rate}],catalog,'author'),/at least 250,000/);
  for(const rate of [250000,250001,265000]){
   const quote=priceQuotation([opening],[{...choice,systemRate:rate}],catalog,'author');
   assert.equal(quote.lines[0].system.rate,rate);
   assert.equal(quote.lines[0].system.rateSource,'quotation');
   assert.equal(repriceQuotation(quote,catalog,'refresher').lines[0].system.rate,rate);
  }
 }
 for(const rate of [1,180000,240000,249999]){
  assert.throws(()=>priceQuotation([measured('wall','Curtain Wall')],[selection('wall','curtain',{systemRate:rate})],catalog,'author'),/at least 250,000/);
  assert.throws(()=>priceQuotation([],[],catalog,'author',[{...additional[0],unitRate:rate}]),/at least 250,000/);
 }
 for(const rate of [250000,250001,265000]){
  const standalone=priceQuotation([],[],catalog,'author',[{...additional[0],unitRate:rate}]);
  assert.equal(standalone.additionalItems[0].rate,rate);
  assert.equal(standalone.additionalItems[0].rateSource,'quotation');
  assert.equal(standalone.additionalItems[0].quantity,12);
  assert.equal(repriceQuotation(standalone,catalog,'refresher').additionalItems[0].rate,rate);
 }
});

test('Curtain Wall quote rates have narrow eligibility and leave Alumex system guidance untouched',()=>{
 const curtain=catalog.find(item=>item.id==='curtain');
 assert.equal(isQuotationCurtainRateEditable(curtain),true);
 assert.equal(isQuotationSystemRateEditable(curtain),false);
 assert.equal(isAlumexSqmSystem(curtain),false);
 for(const patch of [{name:'Curtain Wall Arch'},{name:'Curtain Wall Pushout'},{name:'Premium Curtain Wall'},{name:'Alumex Curtain Wall'},{name:'Cladding'},{is_active:false},{unit:'item'},{unit:'meter'},{unit:'project'}])assert.equal(isQuotationCurtainRateEditable({...curtain,...patch}),false,JSON.stringify(patch));
 assert.equal(isQuotationCurtainRateEditable(undefined),false);
 assert.equal(isQuotationCurtainRateEditable(null),false);
 const quote=priceQuotation([measured('wall','Curtain Wall')],[selection('wall','curtain',{systemRate:265000})],catalog,'author');
 assert.equal(quote.lines[0].system.quantity,0.5,'Curtain Wall uses measured area with no window minimum');
 assert.equal(quote.total,132500);
 assert.equal(quote.lines[0].system.rateSource,'quotation');
 assert.equal(quotationSellingSuggestion(quote,catalog),null);
});

function bulkQuotation(){
 const openings=[measured('sliding','Window','Sliding',3),measured('hinged','Window','Hinged',2),measured('wall','Curtain Wall',null,2)];
 let selected={choices:[selection('sliding','system',{glassId:'glass',extras:[{id:'handle',quantity:2}]}),selection('hinged','hinged'),selection('wall','curtain',{glassId:'glass'})],additionalItems:structuredClone(additional)};
 for(const [group,rate] of [['sliding',270000],['hinged',280000],['curtain-wall',265000]])selected=applyQuotationGroupRate(group,rate,openings,selected.choices,selected.additionalItems,catalog);
 return {openings,...selected,quote:priceQuotation(openings,selected.choices,catalog,'author',selected.additionalItems,5)};
}

test('bulk rates retain physical window minimums, measured Curtain Wall areas, quantities, extras and whole-quote discounts',()=>{
 const {quote}=bulkQuotation();
 assert.deepEqual(quote.lines.map(line=>({area:line.area,quantity:line.system.quantity,rate:line.system.rate,total:line.total})),[
  {area:1.5,quantity:3,rate:270000,total:900000},
  {area:1,quantity:2,rate:280000,total:560000},
  {area:1,quantity:1,rate:265000,total:285000},
 ]);
 assert.equal(quote.additionalItems[0].quantity,12);
 assert.equal(quote.additionalItems[0].total,3180000);
 assert.equal(quote.additionalItems[0].extras[0].total,120000);
 assert.deepEqual(quote.additionalItems.slice(1).map(item=>item.rate),[100000,90000,150000]);
 assert.deepEqual(quote.discount,{percent:5,subtotal:5775000,amount:288750});
 assert.equal(quote.total,5486250);
});

test('saved standalone Curtain Wall rates survive edit reconstruction and catalog repricing without changing prior quotations',()=>{
 const {openings,choices,quote}=bulkQuotation(),saved=JSON.parse(JSON.stringify(quote)),before=structuredClone(saved);
 const restored=quotationAdditionalChoices(saved);
 assert.equal(restored.find(item=>item.id==='curtain').unitRate,265000);
 assert.deepEqual(restored.find(item=>item.id==='curtain').measurements,additional[0].measurements);
 assert.deepEqual(priceQuotation(openings,choices,catalog,'editor',restored,5).discount,saved.discount);
 const changed=catalog.map(item=>({...item,unit_price:item.unit_price*2})),catalogBefore=structuredClone(changed);
 const refreshed=repriceQuotation(saved,changed,'refresher');
 assert.deepEqual(refreshed.lines.map(line=>line.system.rate),[270000,280000,265000]);
 assert.equal(refreshed.additionalItems[0].rate,265000);
 assert.equal(refreshed.additionalItems[0].rateSource,'quotation');
 assert.equal(refreshed.additionalItems[0].quantity,12);
 assert.equal(refreshed.additionalItems[0].extras[0].rate,20000);
 assert.deepEqual(refreshed.discount,{percent:5,subtotal:6585000,amount:329250});
 assert.equal(refreshed.total,6255750);
 assert.deepEqual(repriceQuotation(refreshed,changed,'again').lines,refreshed.lines);
 assert.deepEqual(saved,before);
 assert.deepEqual(changed,catalogBefore);
});

test('explicit catalog-equal Curtain Wall rates remain quotation-local while unmarked rates follow the catalog',()=>{
 const products=catalog.map(item=>item.id==='curtain'?{...item,unit_price:265000}:item);
 const selected={...additional[0],unitRate:265000};
 const marked=priceQuotation([],[],products,'author',[selected]);
 const unmarked=priceQuotation([],[],products,'author',[additional[0]]);
 assert.equal(marked.additionalItems[0].rateSource,'quotation');
 assert.equal(Object.hasOwn(unmarked.additionalItems[0],'rateSource'),false);
 assert.equal(quotationAdditionalChoices(unmarked)[0].unitRate,undefined);
 const changed=products.map(item=>item.id==='curtain'?{...item,unit_price:260000}:item);
 assert.equal(repriceQuotation(marked,changed,'editor').additionalItems[0].rate,265000);
 assert.equal(repriceQuotation(unmarked,changed,'editor').additionalItems[0].rate,260000);
});

test('lower catalog defaults and reading historical Curtain Wall overrides keep their saved rates and amounts',()=>{
 const openings=[measured('wall','Curtain Wall')],choices=[selection('wall','curtain')];
 const catalogQuote=priceQuotation(openings,choices,catalog,'author',[additional[0]]);
 assert.equal(catalogQuote.lines[0].system.rate,180000);
 assert.equal(catalogQuote.lines[0].system.total,90000);
 assert.equal(catalogQuote.additionalItems[0].rate,180000);
 assert.equal(catalogQuote.additionalItems[0].total,2160000);
 assert.equal(Object.hasOwn(catalogQuote.lines[0].system,'rateSource'),false);
 assert.equal(Object.hasOwn(catalogQuote.additionalItems[0],'rateSource'),false);
 const historical=structuredClone(catalogQuote);
 Object.assign(historical.lines[0].system,{rate:190000,total:95000,rateSource:'quotation'});
 historical.lines[0].total=95000;
 Object.assign(historical.additionalItems[0],{rate:190000,total:2280000,rateSource:'quotation'});
 historical.total=2495000;
 const serialized=JSON.stringify(historical),saved=JSON.parse(serialized);
 const restored=quotationAdditionalChoices(saved);
 assert.equal(restored[0].unitRate,190000);
 const groups=quotationRateGroups(openings,[selection('wall','curtain',{systemRate:saved.lines[0].system.rate})],restored,catalog);
 assert.equal(groups[2].rate,190000,'Reading a saved below-minimum rate must not silently raise it');
 assert.equal(groups[2].minimum,250000);
 assert.equal(JSON.stringify(saved),serialized,'Saved quotation reads must not rewrite historical rates, totals or override markers');
 assert.throws(()=>repriceQuotation(saved,catalog,'editor'),/at least 250,000/,'A new repricing operation must validate historical explicit rates');
 assert.equal(JSON.stringify(saved),serialized);
});

test('repricing validates the minimum independently for measured and standalone Curtain Wall overrides',()=>{
 const measuredQuote=priceQuotation([measured('wall','Curtain Wall')],[selection('wall','curtain',{systemRate:265000})],catalog,'author');
 const standaloneQuote=priceQuotation([],[],catalog,'author',[{...additional[0],unitRate:265000}]);
 for(const [quote,select] of [[measuredQuote,quote=>quote.lines[0].system],[standaloneQuote,quote=>quote.additionalItems[0]]])for(const rate of [240000,249999]){
  select(quote).rate=rate;
  const before=structuredClone(quote);
  assert.throws(()=>repriceQuotation(quote,catalog,'editor'),/at least 250,000/);
  assert.deepEqual(quote,before,'Rejected repricing must leave the saved quotation unchanged');
 }
});

test('only main Curtain Wall services accept standalone unit-rate overrides and malformed rates are rejected',()=>{
 for(const item of additional.slice(1).concat({id:'standalone',quantity:1}))assert.throws(()=>priceQuotation([],[],catalog,'author',[{...item,unitRate:270000}]),/only for active Curtain Wall/);
 for(const rate of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'190000',null,true,{},[]]){
  assert.throws(()=>priceQuotation([],[],catalog,'author',[{...additional[0],unitRate:rate}]),/Curtain Wall rate.*whole IQD/);
  assert.throws(()=>priceQuotation([measured('wall','Curtain Wall')],[selection('wall','curtain',{systemRate:rate})],catalog,'author'),/Curtain Wall rate.*whole IQD/);
 }
 const {quote}=bulkQuotation();
 for(const select of [q=>q.lines[0].glass,q=>q.lines[0].extras[0],q=>q.additionalItems[1],q=>q.additionalItems[0].extras[0]]){
  const forged=structuredClone(quote);select(forged).rateSource='quotation';
  assert.throws(()=>repriceQuotation(forged,catalog,'editor'),/only be applied/);
 }
 for(const patch of [{name:'Curtain Wall Pushout'},{name:'Cladding'},{is_active:false},{unit_price:0}]){
  const changed=catalog.map(item=>item.id==='curtain'?{...item,...patch}:item);
  assert.throws(()=>repriceQuotation(quote,changed,'editor'));
 }
});
