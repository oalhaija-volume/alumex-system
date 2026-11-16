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
const models=load('../src/lib/workflow/alumexModels.ts',{'./catalogRules':rules});
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules,'./alumexModels':models});
const {quotationRateGroups,applyQuotationGroupRate}=load('../src/lib/quotations/groupRates.ts',{'@/lib/workflow/catalogRules':rules,'@/lib/workflow/pricing':pricing});
const {alumexSystemModelOptions,validateAlumexSystemModel,alumexSystemLabel}=models;
const {priceQuotation,repriceQuotation,quotationPriceKey,defaultSystem}=pricing;
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',280000),
 product('hinged-window','Alumex Hinged Window','aluminum_system','sqm',280000),
 product('hinged-door','Alumex Hinged Door','aluminum_system','sqm',280000),
 product('other','Other System','aluminum_system','sqm',300000),
 product('custom','Custom Thermal Section','aluminum_section','sqm',300000),
 product('curtain','Curtain Wall','facade_service','sqm',280000),
 product('louver','Louver','opening_product','sqm',100000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('handle','Handle','addon','item',5000),
 product('shutter','Roller shutter - Foam','addon','item',35000),
];
const opening=(id='opening',type='Window',direction='Sliding')=>({id,floor:'Ground',room:'Office',width:50,height:50,quantity:3,opening_type:type,opening_direction:direction});
const choice=(measured,patch={})=>({openingId:measured.id,systemId:defaultSystem(measured,catalog)?.id??'system',systemRate:275000,glassId:'glass',extras:[{id:'handle',quantity:2},{id:'shutter',quantity:1,motorPrice:120000}],...patch});
const withoutModel=line=>Object.fromEntries(Object.entries(line).filter(([key])=>key!=='systemModel'));

test('sliding and hinged windows and doors expose exactly their requested Alumex model family',()=>{
 for(const type of ['Window','Door']){
  assert.deepEqual(alumexSystemModelOptions(opening('opening',type,'Sliding'),catalog[0]),['A16','A16 Pro','A16 Pro+']);
  assert.deepEqual(alumexSystemModelOptions(opening('opening',type,'Hinged'),catalog[0]),['4500','4500 Pro']);
 }
 assert.equal(Object.isFrozen(alumexSystemModelOptions(opening(),catalog[0])),true);
});

for(const [direction,systemModel]of [['Sliding','A16'],['Sliding','A16 Pro'],['Sliding','A16 Pro+'],['Hinged','4500'],['Hinged','4500 Pro']])for(const type of ['Window','Door']){
 test(`${type} ${systemModel}: choosing a model preserves all prices, charges, quantities and catalog references`,()=>{
  const measured=opening('opening',type,direction),selection=choice(measured);
  const inputs=structuredClone({measured,selection,catalog});
  const legacy=priceQuotation([measured],[selection],catalog,'indoor-sales');
  const result=priceQuotation([measured],[{...selection,systemModel}],catalog,'indoor-sales');
  assert.equal(result.lines[0].systemModel,systemModel);
  assert.deepEqual(withoutModel(result.lines[0]),legacy.lines[0]);
  assert.equal(result.total,legacy.total);
  assert.equal(result.lines[0].system.name,catalog.find(product=>product.id===selection.systemId).name,'The original catalog charge stays intact');
  assert.equal(result.lines[0].system.rate,275000);
  assert.equal(result.lines[0].system.quantity,type==='Window'?3:0.75,'Apply the existing per-window minimum before repeated quantities');
  assert.equal(result.lines[0].glass.quantity,type==='Window'?3:0.75);
  assert.equal(result.lines[0].extras.find(extra=>extra.id==='shutter').quantity,3);
  assert.equal(result.lines[0].extras.find(extra=>extra.motorFor==='shutter').quantity,3);
  assert.deepEqual({measured,selection,catalog},inputs);
 });

 test(`${type} ${systemModel}: JSON persistence, quotation revision and catalog refresh retain the model without mutating history`,()=>{
  const measured=opening('opening',type,direction),selection=choice(measured,{systemModel});
  const saved=JSON.parse(JSON.stringify(priceQuotation([measured],[selection],catalog,'indoor-sales')));
  const before=structuredClone(saved);
  const revised=priceQuotation([measured],[{...selection,systemModel:saved.lines[0].systemModel,systemRate:290000}],catalog,'editor');
  assert.equal(revised.lines[0].systemModel,systemModel);
  assert.equal(revised.lines[0].system.id,saved.lines[0].system.id);
  assert.deepEqual(revised.lines[0].glass,saved.lines[0].glass);
  assert.deepEqual(revised.lines[0].extras,saved.lines[0].extras);
  const refreshed=repriceQuotation(saved,catalog.map(product=>({...product,unit_price:product.unit_price*2})),'editor');
  assert.equal(refreshed.lines[0].systemModel,systemModel);
  assert.deepEqual(refreshed.lines[0].system,saved.lines[0].system,'A quotation-specific rate survives catalog refresh');
  assert.equal(refreshed.lines[0].glass.rate,40000);
  assert.deepEqual(saved,before);
 });
}

test('legacy quotations receive no inferred model or changed system default, including named historical products',()=>{
 for(const direction of ['Sliding','Hinged'])for(const type of ['Window','Door']){
  const measured=opening('opening',type,direction),selection=choice(measured);
  const quote=priceQuotation([measured],[selection],catalog,'sales');
  assert.equal(Object.hasOwn(quote.lines[0],'systemModel'),false);
  assert.equal(Object.hasOwn(repriceQuotation(quote,catalog,'editor').lines[0],'systemModel'),false);
  assert.equal(defaultSystem(measured,catalog).id,selection.systemId);
 }
 const named=product('named','ALUMEX 16','aluminum_system','sqm',280000),measured=opening();
 const quote=priceQuotation([measured],[choice(measured,{systemId:'named'})],[...catalog,named],'sales');
 assert.equal(Object.hasOwn(quote.lines[0],'systemModel'),false,'A product name cannot silently assign a model to an old quotation');
 assert.equal(alumexSystemLabel('ALUMEX 16'), 'ALUMEX 16');
});

test('a model selection preserves catalog-priced systems without manufacturing a quotation rate override',()=>{
 const measured=opening(),selection=choice(measured,{systemRate:undefined,systemModel:'A16 Pro+'});
 const saved=priceQuotation([measured],[selection],catalog,'sales');
 assert.equal(saved.lines[0].system.rate,280000);
 assert.equal(Object.hasOwn(saved.lines[0].system,'rateSource'),false);
 const refreshed=repriceQuotation(saved,catalog.map(product=>product.id==='system'?{...product,unit_price:300000}:product),'editor');
 assert.equal(refreshed.lines[0].system.rate,300000);
 assert.equal(refreshed.lines[0].systemModel,'A16 Pro+');
});

test('server pricing rejects unknown and misspelled models without coercing them',()=>{
 const measured=opening();
 for(const systemModel of [null,'','a16','A16Pro','A16 Plus','A16 Pro++','ALUMEX 16',false,1,[],{}]){
  assert.throws(()=>priceQuotation([measured],[choice(measured,{systemModel})],catalog,'sales'),/Alumex model compatible/);
 }
});

test('models cannot cross sliding and hinged families or attach to unknown opening operations',()=>{
 for(const type of ['Window','Door']){
  for(const systemModel of ['4500','4500 Pro']){
   const measured=opening('opening',type,'Sliding');
   assert.throws(()=>priceQuotation([measured],[choice(measured,{systemModel})],catalog,'sales'),/Alumex model compatible/);
  }
  for(const direction of ['Hinged',null,'sliding','Other'])for(const systemModel of ['A16','A16 Pro','A16 Pro+']){
   const measured=opening('opening',type,direction);
   assert.throws(()=>priceQuotation([measured],[choice(measured,{systemModel})],catalog,'sales'),/Alumex model compatible/);
  }
 }
});

test('an explicitly sliding or hinged catalog product must agree with the measured operation before accepting a model',()=>{
 const sliding=product('sliding-product','Alumex Sliding Window','aluminum_system','sqm',280000);
 const products=[...catalog,sliding];
 for(const [direction,systemId,systemModel]of [['Sliding','hinged-door','A16'],['Hinged','sliding-product','4500']]){
  const measured=opening('opening','Window',direction),selected=products.find(product=>product.id===systemId);
  assert.deepEqual(alumexSystemModelOptions(measured,selected),[]);
  assert.throws(()=>priceQuotation([measured],[choice(measured,{systemId,systemModel})],products,'sales'),/Alumex model compatible/);
 }
 const measured=opening('opening','Window','Hinged');
 const saved=priceQuotation([measured],[choice(measured,{systemModel:'4500 Pro'})],products,'sales');
 saved.lines[0].opening.opening_direction='Sliding';saved.lines[0].systemModel='A16 Pro';
 assert.throws(()=>repriceQuotation(saved,products,'editor'),/Alumex model compatible/);
});

test('models are restricted to eligible active Alumex square-metre window and door systems',()=>{
 const measured=opening();
 for(const product of [undefined,null,catalog.find(item=>item.id==='other'),catalog.find(item=>item.id==='custom'),
  {...catalog[0],is_active:false},{...catalog[0],name:'Alumextra System'},{...catalog[0],name:'ALUMEX16'},
  {...catalog[0],unit:'item'},{...catalog[0],unit:'meter'},{...catalog[0],unit:'project'},
  {...catalog[0],category:'standalone_product'},{...catalog[0],category:'glass_option'},
 ]){
  assert.deepEqual(alumexSystemModelOptions(measured,product),[]);
  assert.throws(()=>validateAlumexSystemModel('A16',measured,product),/Alumex model compatible/);
 }
 for(const systemId of ['other','custom']){
  assert.throws(()=>priceQuotation([measured],[choice(measured,{systemId,systemRate:undefined,systemModel:'A16'})],catalog,'sales'),/Alumex model compatible/);
 }
 for(const [type,systemId,direction]of [['Curtain Wall','curtain',null],['Louver','louver','Hinged']]){
  const measured=opening('opening',type,direction);
  assert.deepEqual(alumexSystemModelOptions(measured,catalog[0]),[]);
  assert.throws(()=>priceQuotation([measured],[{openingId:measured.id,systemId,systemModel:'A16',extras:[]}],catalog,'sales'),/Alumex model compatible/);
 }
});

test('refresh rejects forged models and checks the current catalog product rather than a saved display name',()=>{
 const measured=opening(),saved=priceQuotation([measured],[choice(measured,{systemModel:'A16'})],catalog,'sales');
 const before=structuredClone(saved);
 for(const systemModel of ['4500',null,'Unknown',false]){
  const forged=structuredClone(saved);forged.lines[0].systemModel=systemModel;
  assert.throws(()=>repriceQuotation(forged,catalog,'editor'),/Alumex model compatible/);
 }
 for(const patch of [{name:'Other System'},{is_active:false},{category:'opening_product'},{unit:'item'}]){
  const changed=catalog.map(product=>product.id==='system'?{...product,...patch}:product);
  assert.throws(()=>repriceQuotation(saved,changed,'editor'),/Alumex model compatible/);
 }
 const forged=priceQuotation([opening('wall','Curtain Wall',null)],[{openingId:'wall',systemId:'curtain',extras:[]}],catalog,'sales');
 forged.lines[0].systemModel='A16';forged.lines[0].system.name='Alumex System';
 assert.throws(()=>repriceQuotation(forged,catalog,'editor'),/Alumex model compatible/);
 assert.deepEqual(saved,before);
});

test('sliding and hinged bulk rates preserve each selected model, glass, extras and opening quantities',()=>{
 const measured=[opening('sliding-window'),opening('sliding-door','Door'),opening('hinged-window','Window','Hinged'),opening('hinged-door','Door','Hinged')];
 const choices=measured.map((item,index)=>choice(item,{systemModel:['A16 Pro+','A16','4500 Pro','4500'][index]}));
 const before=structuredClone(choices);
 const sliding=applyQuotationGroupRate('sliding',260000,measured,choices,[],catalog);
 const both=applyQuotationGroupRate('hinged',300000,measured,sliding.choices,[],catalog);
 assert.deepEqual(both.choices.map(choice=>choice.systemModel),choices.map(choice=>choice.systemModel));
 assert.deepEqual(both.choices.map(choice=>choice.systemRate),[260000,260000,300000,300000]);
 const quote=priceQuotation(measured,both.choices,catalog,'sales');
 assert.deepEqual(quote.lines.map(line=>line.systemModel),choices.map(choice=>choice.systemModel));
 assert.deepEqual(quotationRateGroups(measured,both.choices,[],catalog).slice(0,2).map(group=>[group.count,group.rate]),[[2,260000],[2,300000]]);
 assert.deepEqual(quote.lines.map(line=>line.system.quantity),[3,0.75,3,0.75]);
 const baseline=priceQuotation(measured,choices,catalog,'sales');
 assert.deepEqual(quote.lines.map(line=>line.glass),baseline.lines.map(line=>line.glass));
 assert.deepEqual(quote.lines.map(line=>line.extras),baseline.lines.map(line=>line.extras));
 assert.deepEqual(choices,before);
});

test('price previews distinguish model choices even when every financial charge remains identical',()=>{
 const measured=opening();
 const a16=priceQuotation([measured],[choice(measured,{systemModel:'A16'})],catalog,'sales');
 const pro=priceQuotation([measured],[choice(measured,{systemModel:'A16 Pro'})],catalog,'sales');
 assert.equal(a16.total,pro.total);
 assert.deepEqual(a16.lines[0].system,pro.lines[0].system);
 assert.notEqual(quotationPriceKey(a16),quotationPriceKey(pro));
});

test('display labels expose the explicit choice while leaving unspecified legacy names unchanged',()=>{
 for(const model of ['A16','A16 Pro','A16 Pro+','4500','4500 Pro'])assert.equal(alumexSystemLabel('Alumex System',model),`ALUMEX ${model}`);
 assert.equal(alumexSystemLabel('Alumex Hinged Door'),'Alumex Hinged Door');
 assert.equal(pricing.alumexSystemLabel,alumexSystemLabel);
});
