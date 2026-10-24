import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,dependencies={}) {
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',source)(name=>{
  if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}
const catalogRules=load('../src/lib/workflow/catalogRules.ts');
const {priceQuotation,repriceQuotation,measuredOpeningArea,billableOpeningArea,openingAreaBand}=load('../src/lib/workflow/pricing.ts',{'./catalogRules':catalogRules});
const opening={id:'window',floor:'Ground',room:'Office',width:50,height:100,opening_type:'Window',opening_direction:'Sliding'};
const product=(id,name,category,unit,unit_price)=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','aluminum_system','sqm',100000),
 product('glass','Low-E Glass','glass_option','sqm',20000),
 product('shutter','Roller Shutter - Foam','addon','sqm',30000),
 product('handle','Handle','addon','item',5000),
 product('bars','Georgian bars','addon','meter',2000),
 product('curtain','Curtain Wall','facade_service','sqm',100000),
 product('louver','Louver','opening_product','sqm',100000),
 product('facade','Cladding','facade_service','sqm',100000),
 product('standalone','A Swing Door','standalone_product','item',100000),
];
const choice={openingId:'window',systemId:'system',glassId:'glass',extras:[{id:'shutter',quantity:99,motorPrice:10000}]};

test('a sub-square-metre window charges one square metre for system, glass and area add-ons while retaining measurements',()=>{
 const before=structuredClone(opening);
 const quote=priceQuotation([opening],[choice],catalog,'sales');
 const line=quote.lines[0];
 assert.equal(line.area,0.5);
 assert.deepEqual(line.opening,before);
 assert.deepEqual(opening,before);
 assert.equal(line.system.quantity,1);
 assert.equal(line.glass.quantity,1);
 assert.equal(line.extras[0].quantity,1);
 assert.equal(line.total,160000);
 assert.equal(quote.total,160000);
});

test('the one square metre minimum applies to every repeated window, independently of actual total area',()=>{
 const repeated={...opening,quantity:4};
 const quote=priceQuotation([repeated],[choice],catalog,'sales');
 const line=quote.lines[0];
 assert.equal(line.area,2);
 assert.equal(measuredOpeningArea(repeated),0.5);
 assert.equal(billableOpeningArea(repeated),1);
 assert.equal(line.system.quantity,4);
 assert.equal(line.glass.quantity,4);
 assert.equal(line.extras[0].quantity,4);
 assert.equal(quote.total,640000);
});

for(const [width,height,expectedArea] of [[100,100,1],[150,100,1.5]])test(`windows measuring ${expectedArea} sqm retain their measured chargeable area`,()=>{
 const measured={...opening,width,height,quantity:3};
 const quote=priceQuotation([measured],[choice],catalog,'sales');
 assert.equal(measuredOpeningArea(measured),expectedArea);
 assert.equal(billableOpeningArea(measured),expectedArea);
 assert.equal(quote.lines[0].area,expectedArea*3);
 assert.equal(quote.lines[0].system.quantity,expectedArea*3);
 assert.equal(quote.lines[0].glass.quantity,expectedArea*3);
 assert.equal(quote.lines[0].extras[0].quantity,expectedArea*3);
 assert.equal(quote.total,150000*expectedArea*3+30000);
});

test('item systems and item or metre accessories keep their quantities on a small repeated window',()=>{
 const itemCatalog=catalog.map(item=>item.id==='system'?{...item,unit:'item'}:item);
 const quote=priceQuotation([{...opening,quantity:4}],[{...choice,extras:[{id:'handle',quantity:2},{id:'bars',quantity:1.5}]}],itemCatalog,'sales');
 const line=quote.lines[0];
 assert.equal(line.system.quantity,4);
 assert.equal(line.glass.quantity,4);
 assert.equal(line.extras[0].quantity,8);
 assert.equal(line.extras[0].total,40000);
 assert.equal(line.extras[1].quantity,6);
 assert.equal(line.extras[1].total,12000);
 assert.equal(quote.total,532000);
});

for(const [opening_type,systemId,withGlass] of [['Door','system',true],['Curtain Wall','curtain',true],['Louver','louver',false]])test(`${opening_type} area quantities are not subject to the window minimum`,()=>{
 const measured={...opening,opening_type,quantity:3};
 const quote=priceQuotation([measured],[{openingId:'window',systemId,...(withGlass?{glassId:'glass'}:{}),extras:opening_type==='Door'?[{id:'shutter',quantity:1,motorPrice:10000}]:[]}],catalog,'sales');
 const line=quote.lines[0];
 assert.equal(billableOpeningArea(measured),0.5);
 assert.equal(line.area,1.5);
 assert.equal(line.system.quantity,1.5);
 if(withGlass)assert.equal(line.glass.quantity,1.5);
 if(opening_type==='Door')assert.equal(line.extras[0].quantity,1.5);
});

test('small facade services and standalone items retain their explicit quantities',()=>{
 const quote=priceQuotation([],[],catalog,'sales',[
  {id:'facade',quantity:99,measurements:[{label:'Small facade',width:0.5,height:0.5,quantity:2}]},
  {id:'standalone',quantity:3},
 ]);
 assert.equal(quote.additionalItems[0].quantity,0.5);
 assert.equal(quote.additionalItems[1].quantity,3);
 assert.equal(quote.total,350000);
});

test('a price refresh preserves the saved billable quantities and actual measurements',()=>{
 const saved=priceQuotation([{...opening,quantity:4}],[choice],catalog,'sales');
 const refreshed=repriceQuotation(saved,catalog.map(item=>({...item,unit_price:item.unit_price*2})),'sales');
 assert.equal(refreshed.total,1240000);
 assert.equal(refreshed.lines[0].system.quantity,4);
 assert.equal(refreshed.lines[0].glass.quantity,4);
 assert.equal(refreshed.lines[0].extras[0].quantity,4);
 assert.equal(refreshed.lines[0].area,2);
 assert.equal(saved.total,640000);
});

test('area bands use actual area per physical opening and cover all boundaries',()=>{
 for(const [area,expected] of [[0.5,'red'],[1,'red'],[3,'red'],[3.0001,'orange'],[3.9999,'orange'],[4,'yellow'],[5,'yellow'],[5.9999,'yellow'],[6,'green'],[8,'green']]){
  assert.equal(openingAreaBand(area),expected,`${area} sqm`);
 }
 assert.equal(openingAreaBand(measuredOpeningArea({...opening,width:200,height:200,quantity:10})),'yellow');
});
