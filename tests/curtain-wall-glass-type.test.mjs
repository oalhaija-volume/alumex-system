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
const alumexModels=load('../src/lib/workflow/alumexModels.ts',{'./catalogRules':rules});
const {priceQuotation,repriceQuotation,quotationAdditionalChoices,quotationPriceKey}=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules, './alumexModels': alumexModels});
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('curtain','Curtain Wall','facade_service','sqm',180000),
 product('system','Alumex System','aluminum_system','sqm',240000),
 product('cladding','Cladding','facade_service','sqm',100000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('film','Glass film shades','addon','sqm',10000),
 product('pushout','Curtain Wall Pushout','standalone_product','item',90000),
];
const opening={id:'wall',floor:'Ground',room:'Office',width:250,height:200,quantity:3,opening_type:'Curtain Wall',opening_direction:null};
const measuredChoice={openingId:'wall',systemId:'curtain',systemRate:275000,glassId:'glass',extras:[{id:'film',quantity:1}]};
const service={id:'curtain',quantity:1,unitRate:265000,measurements:[{label:'North',width:2,height:3,quantity:2}],extras:[{id:'film',quantity:1}]};
const projectExtras=[{id:'pushout',quantity:4},{id:'curtain-wall-arch',quantity:2}];
const measuredQuote=patch=>priceQuotation([opening],[{...measuredChoice,...patch}],catalog,'indoor-sales',projectExtras);
const serviceQuote=patch=>priceQuotation([],[],catalog,'indoor-sales',[{...service,...patch},...projectExtras]);
const withoutGlassType=item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='curtainWallGlassType'));

for(const curtainWallGlassType of ['single','double']){
 test(`${curtainWallGlassType} glass is saved on each measured wall without changing its rates, glass finish or extras`,()=>{
  const legacy=measuredQuote();
  const result=measuredQuote({curtainWallGlassType});
  assert.equal(result.lines[0].curtainWallGlassType,curtainWallGlassType);
  assert.deepEqual(withoutGlassType(result.lines[0]),legacy.lines[0]);
  assert.deepEqual(result.additionalItems,legacy.additionalItems);
  assert.equal(result.lines[0].system.rate,275000);
  assert.equal(result.lines[0].system.quantity,15);
  assert.equal(result.lines[0].glass.id,'glass');
  assert.equal(result.total,legacy.total);
  assert.equal(Object.hasOwn(opening,'curtainWallGlassType'),false,'The measured opening record is unchanged');
 });

 test(`${curtainWallGlassType} glass survives standalone service edit reconstruction and repricing`,()=>{
  const legacy=serviceQuote();
  const result=JSON.parse(JSON.stringify(serviceQuote({curtainWallGlassType})));
  assert.deepEqual(withoutGlassType(result.additionalItems[0]),legacy.additionalItems[0]);
  assert.equal(result.total,legacy.total);
  const before=structuredClone(result);
  const choices=quotationAdditionalChoices(result);
  assert.equal(choices[0].curtainWallGlassType,curtainWallGlassType);
  assert.equal(choices[0].unitRate,265000);
  const edited=priceQuotation([],[],catalog,'editor',choices);
  assert.deepEqual(edited.additionalItems,result.additionalItems);
  assert.equal(edited.total,result.total);
  const refreshed=repriceQuotation(result,catalog,'editor');
  assert.deepEqual(refreshed.additionalItems,result.additionalItems);
  assert.equal(refreshed.total,result.total);
  assert.deepEqual(result,before,'Editing and refresh preserve the prior saved revision');
 });

 test(`${curtainWallGlassType} glass survives measured wall catalog price refresh while only catalog-priced charges update`,()=>{
  const saved=JSON.parse(JSON.stringify(measuredQuote({curtainWallGlassType})));
  const before=structuredClone(saved);
  const changedCatalog=catalog.map(item=>({...item,unit_price:item.unit_price*2}));
  const result=repriceQuotation(saved,changedCatalog,'editor');
  assert.equal(result.lines[0].curtainWallGlassType,curtainWallGlassType);
  assert.equal(result.lines[0].system.rate,275000,'The quotation-specific curtain wall rate is retained');
  assert.equal(result.lines[0].system.quantity,15);
  assert.equal(result.lines[0].glass.rate,40000);
  assert.equal(result.lines[0].extras[0].rate,20000);
  assert.deepEqual(saved,before);
 });
}

test('legacy quotations keep unspecified curtain wall glazing through editing and refresh',()=>{
 const quote=priceQuotation([opening],[measuredChoice],catalog,'indoor-sales',[service]);
 const before=structuredClone(quote);
 assert.equal(Object.hasOwn(quote.lines[0],'curtainWallGlassType'),false);
 assert.equal(Object.hasOwn(quote.additionalItems[0],'curtainWallGlassType'),false);
 assert.equal(Object.hasOwn(quotationAdditionalChoices(quote)[0],'curtainWallGlassType'),false);
 const refreshed=repriceQuotation(quote,catalog,'editor');
 assert.equal(Object.hasOwn(refreshed.lines[0],'curtainWallGlassType'),false);
 assert.equal(Object.hasOwn(refreshed.additionalItems[0],'curtainWallGlassType'),false);
 assert.deepEqual(quote,before);
});

test('server pricing rejects unsupported glass types for measured walls and standalone services',()=>{
 for(const curtainWallGlassType of [null,'','Single Glass','single glass','triple',0,false,[],{}]){
  assert.throws(()=>measuredQuote({curtainWallGlassType}),/Choose Single Glass or Double Glass/);
  assert.throws(()=>serviceQuote({curtainWallGlassType}),/Choose Single Glass or Double Glass/);
 }
});

test('single and double glass metadata cannot be attached to other openings, facade products or project add-ons',()=>{
 for(const curtainWallGlassType of ['single','double']){
  for(const opening_type of ['Window','Door']){
   const measured={...opening,opening_type,opening_direction:'Sliding'};
   assert.throws(()=>priceQuotation([measured],[{...measuredChoice,systemId:'system',curtainWallGlassType}],catalog,'sales'),/available only for curtain walls/);
  }
  for(const item of [{...service,id:'cladding',unitRate:undefined},{id:'pushout',quantity:1},{id:'curtain-wall-arch',quantity:1}]){
   assert.throws(()=>priceQuotation([],[],catalog,'sales',[{...item,curtainWallGlassType}]),/available only for curtain walls/);
  }
 }
});

test('refresh rejects malformed saved glazing metadata and metadata forged onto non-curtain quotation items',()=>{
 for(const value of [null,'triple',false]){
  const measured=measuredQuote();measured.lines[0].curtainWallGlassType=value;
  assert.throws(()=>repriceQuotation(measured,catalog,'sales'),/Choose Single Glass or Double Glass/);
  const standalone=serviceQuote();standalone.additionalItems[0].curtainWallGlassType=value;
  assert.throws(()=>repriceQuotation(standalone,catalog,'sales'),/Choose Single Glass or Double Glass/);
 }
 const nonCurtain=priceQuotation([{...opening,opening_type:'Window',opening_direction:'Sliding'}],[{...measuredChoice,systemId:'system'}],catalog,'sales',projectExtras);
 nonCurtain.lines[0].curtainWallGlassType='single';
 assert.throws(()=>repriceQuotation(nonCurtain,catalog,'sales'),/available only for curtain walls/);
 const addon=serviceQuote();addon.additionalItems[1].curtainWallGlassType='double';
 assert.throws(()=>repriceQuotation(addon,catalog,'sales'),/available only for curtain walls/);
});

test('price previews distinguish glazing specifications even when amounts are identical',()=>{
 assert.notEqual(quotationPriceKey(measuredQuote({curtainWallGlassType:'single'})),quotationPriceKey(measuredQuote({curtainWallGlassType:'double'})));
 assert.notEqual(quotationPriceKey(serviceQuote({curtainWallGlassType:'single'})),quotationPriceKey(serviceQuote({curtainWallGlassType:'double'})));
});
