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
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':catalogRules});
const {quotationClientPricing}=load('../src/lib/quotations/clientPricing.ts',{'../workflow/pricing':pricing});
const charge=(id,name,unit,rate,quantity,total=Math.round(rate*quantity))=>({id,name,unit,rate,quantity,total});
function openingLine(id,quantity,rate,{name='Alumex System',unit='sqm',opening_type='Window',opening_direction='Sliding',physicalQuantity=1,measuredArea=quantity,systemTotal=Math.round(quantity*rate),glass=null,extras=[]}={}) {
 const system=charge('shared-system',name,unit,rate,quantity,systemTotal);
 return {
  opening:{id,floor:'GF',room:'Office',width:measuredArea/physicalQuantity*100,height:100,quantity:physicalQuantity,opening_type,opening_direction},
  area:measuredArea,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((sum,item)=>sum+item.total,0),
 };
}
function quote(lines,additionalItems=[]) {
 return {version:4,lines,additionalItems,total:lines.reduce((sum,line)=>sum+line.total,0)+additionalItems.reduce((sum,item)=>sum+item.total+(item.extras??[]).reduce((value,extra)=>value+extra.total,0),0),currency:'IQD',createdAt:'2026-10-23T08:00:00Z',preparedBy:'original-author'};
}
function freeze(value) {
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

test('client pricing shows one exact saved weighted rate and reconciles integer opening amounts',()=>{
 const saved=quote([
  openingLine('sliding',3.5,265000),
  openingLine('hinged-window',1,260000,{name:'Alumex Hinged Window',opening_direction:'Hinged'}),
  openingLine('hinged-door',2,305000,{name:'Alumex Hinged Door',opening_type:'Door',opening_direction:'Hinged'}),
 ]);
 const result=quotationClientPricing(saved);
 assert.deepEqual(result,{
  rate:1797500/6.5,billableArea:6.5,systemTotal:1797500,
  openings:[{openingId:'sliding',systemAmount:967885,openingTotal:967885},{openingId:'hinged-window',systemAmount:276538,openingTotal:276538},{openingId:'hinged-door',systemAmount:553077,openingTotal:553077}],
 });
 assert.equal(result.openings.reduce((sum,item)=>sum+item.systemAmount,0),saved.total);
 assert.equal(Number.isInteger(result.rate),false,'The display formatter must choose precision without rounding the helper rate');
});

test('the denominator uses saved billable quantities including repeated small-window minimums',()=>{
 const saved=quote([
  openingLine('small-windows',3,260000,{physicalQuantity:3,measuredArea:1.5,opening_direction:'Hinged'}),
  openingLine('large-windows',6,240000,{physicalQuantity:2,measuredArea:6}),
 ]);
 assert.deepEqual(quotationClientPricing(saved),{
  rate:2220000/9,billableArea:9,systemTotal:2220000,
  openings:[{openingId:'small-windows',systemAmount:740000,openingTotal:740000},{openingId:'large-windows',systemAmount:1480000,openingTotal:1480000}],
 });
});

test('historical fractional billable areas are preserved rather than applying current window minimums',()=>{
 const saved=quote([openingLine('old-small-window',0.5236,240000),openingLine('other-window',1,260000)]);
 const before=structuredClone(saved);
 const result=quotationClientPricing(saved);
 assert.equal(result.billableArea,1.5236);
 assert.equal(result.systemTotal,385664);
 assert.equal(result.rate,385664/1.5236);
 assert.equal(result.openings.reduce((sum,item)=>sum+item.systemAmount,0),385664);
 assert.equal(saved.lines[0].system.quantity,0.5236);
 assert.deepEqual(saved,before);
});

test('allocation uses saved monetary totals and custom quotation rates rather than recalculating size targets',()=>{
 const saved=quote([
  openingLine('custom-one',0.333333,275001,{systemTotal:91667}),
  openingLine('custom-two',0.666667,289999,{systemTotal:193333}),
 ]);
 saved.lines[0].system.rateSource='quotation';
 saved.lines[1].system.rateSource='quotation';
 const result=quotationClientPricing(saved);
 assert.equal(result.systemTotal,285000);
 assert.equal(result.billableArea,1);
 assert.equal(result.rate,285000);
 assert.deepEqual(result.openings,[{openingId:'custom-one',systemAmount:95000,openingTotal:95000},{openingId:'custom-two',systemAmount:190000,openingTotal:190000}]);
 assert.deepEqual(saved.lines.map(line=>line.system.rate),[275001,289999]);
 assert.ok(saved.lines.every(line=>line.system.rateSource==='quotation'));
});

test('equal remainders use original row order and keep separate openings sharing a catalog product ID',()=>{
 const saved=quote([openingLine('first',1,260000),openingLine('second',1,260001),openingLine('third',1,260000)]);
 const expected=[{openingId:'first',systemAmount:260001,openingTotal:260001},{openingId:'second',systemAmount:260000,openingTotal:260000},{openingId:'third',systemAmount:260000,openingTotal:260000}];
 assert.deepEqual(quotationClientPricing(saved).openings,expected);
 assert.deepEqual(quotationClientPricing(saved).openings,expected,'Repeated renders must allocate the remainder identically');
});

test('fractional quantities and many openings retain every IQD after allocation',()=>{
 const saved=quote(Array.from({length:60},(_,index)=>openingLine(`window-${index}`,((index%7)+1)/10,240001+index)));
 const result=quotationClientPricing(saved);
 assert.equal(result.openings.length,60);
 assert.equal(result.systemTotal,saved.lines.reduce((sum,line)=>sum+line.system.total,0));
 assert.equal(result.billableArea,saved.lines.reduce((sum,line)=>sum+line.system.quantity,0));
 assert.equal(result.openings.reduce((sum,item)=>sum+item.systemAmount,0),result.systemTotal);
 for(let index=0;index<result.openings.length;index++){
  const allocated=result.openings[index].systemAmount;
  const ideal=result.systemTotal*saved.lines[index].system.quantity/result.billableArea;
  assert.equal(Number.isSafeInteger(allocated),true);
  assert.ok(Math.abs(allocated-ideal)<1,`${saved.lines[index].opening.id} allocation differs by less than one IQD`);
 }
});

test('glass and accessories retain their saved amounts while displayed opening totals follow the allocated system amount',()=>{
 const saved=quote([
  openingLine('first',3.5,265000,{glass:charge('glass','Low-E Glass','sqm',20000,3.5),extras:[charge('handle','Handle','item',5000,2)]}),
  openingLine('second',1,260000,{extras:[charge('shutter','Roller Shutter','sqm',30000,1)]}),
  openingLine('third',2,305000,{opening_type:'Door',opening_direction:'Hinged'}),
 ],[{...charge('facade','Cladding','sqm',100000,5),extras:[charge('install','Installation','project',50000,1)]},charge('standalone','A Swing Door','item',100000,2)]);
 const before=structuredClone(saved);
 const result=quotationClientPricing(saved);
 assert.deepEqual(result.openings,[{openingId:'first',systemAmount:967885,openingTotal:1047885},{openingId:'second',systemAmount:276538,openingTotal:306538},{openingId:'third',systemAmount:553077,openingTotal:553077}]);
 const additional=saved.additionalItems.reduce((sum,item)=>sum+item.total+(item.extras??[]).reduce((value,extra)=>value+extra.total,0),0);
 assert.equal(result.openings.reduce((sum,item)=>sum+item.openingTotal,0)+additional,saved.total);
 assert.deepEqual(saved,before);
});

test('only saved Alumex sqm Window and Door systems participate in the client blend',()=>{
 const saved=quote([
  openingLine('eligible-window',1,260000,{name:' ALUMEX Hinged Window '}),
  openingLine('eligible-door',2,305000,{name:'Alumex Hinged Door',opening_type:'Door'}),
  openingLine('foreign',1,100000,{name:'Other System'}),
  openingLine('embedded',1,100000,{name:'Premium Alumex System'}),
  openingLine('prefix',1,100000,{name:'Alumextra System'}),
  openingLine('item-system',3,100000,{unit:'item'}),
  openingLine('curtain',2,100000,{opening_type:'Curtain Wall'}),
  openingLine('louver',2,100000,{opening_type:'Louver'}),
  openingLine('facade',2,100000,{opening_type:'Facade'}),
  openingLine('skylight',2,100000,{opening_type:'Skylight'}),
 ]);
 const before=structuredClone(saved);
 const result=quotationClientPricing(saved);
 assert.equal(result.systemTotal,870000);
 assert.equal(result.billableArea,3);
 assert.equal(result.rate,290000);
 assert.deepEqual(result.openings,[{openingId:'eligible-window',systemAmount:290000,openingTotal:290000},{openingId:'eligible-door',systemAmount:580000,openingTotal:580000}]);
 assert.deepEqual(saved,before);
});

test('empty, singleton and already uniform rates need no client-price transformation',()=>{
 assert.equal(quotationClientPricing(quote([])),null);
 assert.equal(quotationClientPricing(quote([openingLine('only',0.5236,240000)])),null);
 assert.equal(quotationClientPricing(quote([openingLine('first',0.333333,260000),openingLine('second',0.666667,260000)])),null,'Equal saved rates keep their original independently rounded charge amounts');
 assert.equal(quotationClientPricing(quote([openingLine('first',1,260000),openingLine('foreign',1,305000,{name:'Other System'})])),null);
});

test('invalid eligible quantities and unsafe monetary amounts fall back without producing a partial blend',()=>{
 const pristine=quote([openingLine('first',1,260000),openingLine('second',2,305000)]);
 for(const quantity of [0,-1,NaN,Infinity,-Infinity]){
  const malformed=structuredClone(pristine);
  malformed.lines[0].system.quantity=quantity;
  assert.equal(quotationClientPricing(malformed),null,`Invalid quantity ${quantity}`);
 }
 for(const total of [0,-1,NaN,Infinity,260000.5,Number.MAX_SAFE_INTEGER+1]){
  const malformed=structuredClone(pristine);
  malformed.lines[0].system.total=total;
  assert.equal(quotationClientPricing(malformed),null,`Invalid system total ${total}`);
 }
 const unsafeTotal=quote([openingLine('first',1,260000,{systemTotal:Number.MAX_SAFE_INTEGER}),openingLine('second',1,305000)]);
 assert.equal(quotationClientPricing(unsafeTotal),null,'The sum of individually safe amounts must also remain safe');
 const overflowingQuantity=quote([openingLine('first',Number.MAX_VALUE,260000,{systemTotal:260000}),openingLine('second',Number.MAX_VALUE,305000,{systemTotal:305000})]);
 assert.equal(quotationClientPricing(overflowingQuantity),null);
 const overflowingRate=quote([openingLine('first',Number.MIN_VALUE,260000,{systemTotal:260000}),openingLine('second',Number.MIN_VALUE,305000,{systemTotal:305000})]);
 assert.equal(quotationClientPricing(overflowingRate),null);
});

test('malformed rates, inconsistent opening totals and duplicate opening IDs cannot produce misleading client rows',()=>{
 const pristine=quote([openingLine('first',1,260000),openingLine('second',2,305000)]);
 for(const rate of [0,-1,NaN,Infinity]){
  const malformed=structuredClone(pristine);
  malformed.lines[0].system.rate=rate;
  assert.equal(quotationClientPricing(malformed),null,`Invalid saved rate ${rate}`);
 }
 for(const total of [259999,260000.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  const malformed=structuredClone(pristine);
  malformed.lines[0].total=total;
  assert.equal(quotationClientPricing(malformed),null,`Invalid opening total ${total}`);
 }
 const duplicate=structuredClone(pristine);
 duplicate.lines[1].opening.id=duplicate.lines[0].opening.id;
 assert.equal(quotationClientPricing(duplicate),null);
 const overflowingOpening=quote([openingLine('first',2,260000),openingLine('second',1,305000)]);
 overflowingOpening.lines[0].total=Number.MAX_SAFE_INTEGER;
 assert.equal(quotationClientPricing(overflowingOpening),null,'Adding the allocated system delta must keep the displayed opening total safe');
});

test('client presentation leaves frozen business snapshots, rates, color results, contracts and history unchanged',()=>{
 const saved=quote([
  openingLine('small',1,278000,{measuredArea:0.5236}),
  openingLine('hinged-door',2,305000,{opening_type:'Door',opening_direction:'Hinged'}),
 ]);
 const contract={quotation:structuredClone(saved)};
 const history=[{version:3,quotation:structuredClone(saved)}];
 const colors=saved.lines.map(line=>pricing.openingSellingBand(pricing.measuredOpeningArea(line.opening),line.system.rate,line.opening));
 const before=structuredClone({saved,contract,history,colors});
 freeze(saved);
 const result=quotationClientPricing(saved);
 assert.equal(result.rate,296000);
 assert.deepEqual({saved,contract,history,colors:saved.lines.map(line=>pricing.openingSellingBand(pricing.measuredOpeningArea(line.opening),line.system.rate,line.opening))},before);
 assert.deepEqual(saved.lines.map(line=>line.system.rate),[278000,305000]);
});
