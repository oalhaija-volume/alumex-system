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
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':rules});
const {priceQuotation,repriceQuotation,quotationPriceKey,isRollerShutterMotor,applyQuotationDiscount}=pricing;
const {quotationClientPricing}=load('../src/lib/quotations/clientPricing.ts',{'../workflow/pricing':pricing});
const catalog=[
 {id:'system',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:240000,is_active:true},
 {id:'shutter',name:'Roller Shutter - Foam',category:'addon',unit:'sqm',unit_price:30000,is_active:true},
 {id:'extruded',name:'Roller Shutter - Extruded',category:'addon',unit:'sqm',unit_price:50000,is_active:true},
 {id:'box',name:'Roller Shutter Box',category:'addon',unit:'item',unit_price:20000,is_active:true},
 {id:'bars',name:'Georgian bars',category:'addon',unit:'meter',unit_price:5000,is_active:true},
];
const opening={id:'window',floor:'GF',room:'Office',width:50,height:100,quantity:3,opening_type:'Window',opening_direction:'Sliding',has_roller_shutter:true};
const choice={openingId:'window',systemId:'system',extras:[{id:'shutter',quantity:99,motorPrice:35000}]};
const quote=(selection=choice,measured=opening,products=catalog,discount=0)=>priceQuotation([measured],[selection],products,'indoor-sales',[],discount);
const motor=quotation=>quotation.lines[0].extras.find(isRollerShutterMotor);

test('each repeated small shutter has one separately priced motor, independent of square metres',()=>{
 const inputs={opening,choice,catalog},before=structuredClone(inputs);
 const saved=quote();
 assert.deepEqual(motor(saved),{id:'roller-shutter-motor:shutter',name:'Roller shutter motor',unit:'item',rate:35000,quantity:3,total:105000,motorFor:'shutter'});
 assert.equal(saved.lines[0].area,1.5);
 assert.equal(saved.lines[0].extras[0].quantity,3,'The shutter still uses each window’s billable sqm minimum');
 assert.equal(saved.total,915000);
 assert.equal(saved.lines[0].total,915000);
 assert.deepEqual(inputs,before,'Manual pricing must not mutate selections, measurements or catalog prices');
 const large=quote(choice,{...opening,width:200,height:200,quantity:2});
 assert.equal(large.lines[0].extras[0].quantity,8);
 assert.equal(motor(large).quantity,2);
 assert.equal(motor(large).total,70000);
 assert.equal(large.total,2230000);
});

for(const name of ['Roller Shutters','Roller Shutter - Foam','Roller Shutter - Extruded'])test(`${name} requires a manual motor price even without a measurement request flag`,()=>{
 const products=catalog.map(item=>item.id==='shutter'?{...item,name}:item);
 assert.throws(()=>quote({...choice,extras:[{id:'shutter',quantity:1}]},{...opening,has_roller_shutter:false},products),/motor price/);
 assert.equal(motor(quote(choice,{...opening,has_roller_shutter:false},products)).rate,35000);
});

for(const [label,motorPrice] of [['missing',undefined],['zero',0],['negative',-1],['fractional',35000.5],['NaN',NaN],['infinite',Infinity],['unsafe',Number.MAX_SAFE_INTEGER+1],['numeric string','35000'],['null',null],['boolean',true],['object',{}],['array',[35000]]])test(`rejects ${label} motor prices instead of underquoting or coercing`,()=>{
 assert.throws(()=>quote({...choice,extras:[{id:'shutter',quantity:1,motorPrice}]}),/motor price greater than zero in whole IQD/);
});

test('motor multiplication rejects unsafe totals and accepts one whole IQD without adding area charges',()=>{
 assert.throws(()=>quote({...choice,extras:[{id:'shutter',quantity:1,motorPrice:Number.MAX_SAFE_INTEGER}]}),/motor price/);
 const saved=quote({...choice,extras:[{id:'shutter',quantity:1,motorPrice:1}]});
 assert.equal(motor(saved).quantity,3);
 assert.equal(motor(saved).total,3);
});

test('motor prices cannot override ordinary accessories or satisfy a shutter-box selection by themselves',()=>{
 const noRequest={...opening,has_roller_shutter:false};
 assert.throws(()=>quote({...choice,extras:[{id:'bars',quantity:2,motorPrice:10000}]},noRequest),/only be entered for roller shutter add-ons/);
 assert.throws(()=>quote({...choice,extras:[{id:'box',quantity:1,motorPrice:10000}]},noRequest),/shutter box requires roller shutters/);
 const plain=quote({...choice,extras:[{id:'bars',quantity:2}]},noRequest);
 assert.equal(motor(plain),undefined);
 assert.equal(plain.total,750000);
 assert.throws(()=>quote({...choice,extras:[{id:'shutter',quantity:1,motorPrice:35000},{id:'extruded',quantity:1,motorPrice:50000}]}),/one roller shutter type/);
});

test('changing or removing a shutter generates only its current motor charge',()=>{
 const changed=quote({...choice,extras:[{id:'extruded',quantity:1,motorPrice:50000}]});
 assert.equal(changed.lines[0].extras.length,2);
 assert.equal(motor(changed).motorFor,'extruded');
 assert.equal(motor(changed).rate,50000);
 assert.equal(changed.total,1020000);
 const removed=quote({...choice,extras:[]},{...opening,has_roller_shutter:false});
 assert.deepEqual(removed.lines[0].extras,[]);
 assert.equal(removed.total,720000);
});

test('the full quotation discount includes manual motors once and retains their original rate',()=>{
 const discounted=quote(choice,opening,catalog,5);
 assert.deepEqual(discounted.discount,{percent:5,subtotal:915000,amount:45750});
 assert.equal(discounted.total,869250);
 assert.equal(motor(discounted).rate,35000);
 assert.equal(motor(discounted).total,105000);
 assert.equal(applyQuotationDiscount(discounted,5).total,869250);
 assert.equal(applyQuotationDiscount(discounted,0).total,915000);
});

test('client blending treats motors as accessories and preserves their full amount separately',()=>{
 const second={...opening,id:'second',width:200,height:200,quantity:1,has_roller_shutter:false};
 const saved=priceQuotation([opening,second],[{...choice,systemRate:278000},{openingId:'second',systemId:'system',systemRate:240000,extras:[]}],catalog,'indoor-sales');
 const blended=quotationClientPricing(saved);
 assert.equal(blended.systemTotal,1794000);
 assert.equal(blended.billableArea,7);
 assert.equal(blended.openings[0].openingTotal-blended.openings[0].systemAmount,195000);
 assert.equal(blended.openings.reduce((sum,line)=>sum+line.openingTotal,0),saved.total);
 assert.equal(motor(saved).total,105000);
});

test('catalog refresh retains the manual motor rate and quantity while updating the shutter catalog rate',()=>{
 const saved=quote(choice,opening,catalog,5);
 const before=structuredClone(saved);
 const refreshed=repriceQuotation(saved,catalog.map(item=>({...item,unit_price:item.unit_price*2})),'refreshing-sales');
 assert.deepEqual(motor(refreshed),motor(saved));
 assert.equal(refreshed.lines[0].extras[0].rate,60000);
 assert.equal(refreshed.lines[0].extras[0].total,180000);
 assert.equal(refreshed.discount.subtotal,1725000);
 assert.equal(refreshed.total,1638750);
 assert.deepEqual(saved,before);
 const restored=JSON.parse(JSON.stringify(saved));
 assert.deepEqual(motor(restored),motor(saved),'Motor linkage and price survive persisted JSON snapshots');
});

test('legacy saved quotations remain viewable and refresh without inventing an unsupplied motor price',()=>{
 const legacy=quote();
 legacy.lines[0].extras=legacy.lines[0].extras.filter(item=>!isRollerShutterMotor(item));
 legacy.lines[0].total=810000;legacy.total=810000;
 const contract={quotation:structuredClone(legacy)},before=structuredClone({legacy,contract});
 const refreshed=repriceQuotation(legacy,catalog,'refreshing-sales');
 assert.equal(motor(refreshed),undefined);
 assert.equal(refreshed.total,810000);
 assert.deepEqual({legacy,contract},before);
 assert.throws(()=>quote({...choice,extras:[{id:'shutter',quantity:1}]}),/motor price/,'Editing a legacy quote still requires its missing motor price');
});

test('price preview keys include the manual rate, motor quantity and shutter association',()=>{
 const original=quote();
 for(const mutate of [item=>item.rate++,item=>item.quantity++,item=>item.motorFor='extruded']){
  const modified=structuredClone(original);mutate(motor(modified));
  assert.notEqual(quotationPriceKey(modified),quotationPriceKey(original));
 }
});

for(const [name,mutate] of [
 ['orphan motor',item=>item.motorFor='unknown'],
 ['missing association',item=>item.motorFor=''],
 ['incorrect synthetic ID',item=>item.id='forged'],
 ['sqm motor unit',item=>item.unit='sqm'],
 ['multiplied motor quantity',item=>item.quantity=9],
 ['system-rate marker on motor',item=>item.rateSource='quotation'],
])test(`catalog refresh rejects ${name} without altering the snapshot`,()=>{
 const saved=quote();mutate(motor(saved));const before=structuredClone(saved);
 assert.throws(()=>repriceQuotation(saved,catalog,'refreshing-sales'),/Review the roller shutter motor/);
 assert.deepEqual(saved,before);
});

test('duplicate motors cannot survive a catalog refresh',()=>{
 const saved=quote();saved.lines[0].extras.push(structuredClone(motor(saved)));
 assert.throws(()=>repriceQuotation(saved,catalog,'refreshing-sales'),/Review the roller shutter motor/);
});
