import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleLoader(dependencies={}){
 const cache=new Map();
 return function load(path){
  if(cache.has(path))return cache.get(path);
  const exports={};cache.set(path,exports);
  const code=ts.transpileModule(readFileSync(new URL(`../${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name=>{
   if(name in dependencies)return dependencies[name];
   if(name.startsWith('@/'))return load(`src/${name.slice(2)}`);
   if(name.startsWith('./'))return load(`${path.slice(0,path.lastIndexOf('/'))}/${name.slice(2)}`);
   throw Error(`Unexpected dependency: ${name}`);
  },exports);
  return exports;
 };
}
const pricing=moduleLoader()('src/lib/workflow/pricing');
const {quotationItemGroups}=moduleLoader()('src/lib/quotations/itemGroups');
const product=(id,name,unit,unit_price,category='addon')=>({id,name,category,unit,unit_price,is_active:true});
const catalog=[
 product('system','Alumex System','sqm',240000,'aluminum_system'),
 product('curtain','Curtain Wall','sqm',100000,'facade_service'),
 product('closer','Hydraulic Door Closer - Small','item',60000),
 product('tilt','Tilt & Turn','item',35000),
 product('bars','Georgian Bars','meter',10000),
 product('film','Glass Film Shading','sqm',12000),
 product('pushout','Curtain Wall Pushout','sqm',750000),
 product('shutter','Roller Shutter - Foam','item',30000),
 product('box','Roller Shutter Box','item',10000),
 product('inactive','Unused accessory','item',1000),
].map(item=>item.id==='inactive'?{...item,is_active:false}:item);
const addons=[{id:'closer',quantity:3},{id:'tilt',quantity:2},{id:'bars',quantity:2.5},{id:'film',quantity:7.25}];
const opening={id:'opening',floor:'Ground',room:'Office',width:400,height:300,quantity:5,opening_type:'Curtain Wall',opening_direction:null};
const choice={openingId:opening.id,systemId:'curtain',extras:[]};
const facade={id:'curtain',quantity:1,measurements:[{label:'North facade',width:6,height:4,quantity:2}]};
const byId=items=>Object.fromEntries(items.map(item=>[item.id,item]));

test('project picker includes active catalog accessories and preserves shutter-only controls',()=>{
 const options=byId(pricing.additionalOptions(catalog));
 for(const id of ['closer','tilt','bars','film','pushout','curtain','curtain-wall-arch'])assert.ok(options[id],id);
 for(const id of ['shutter','box','inactive','system'])assert.equal(options[id],undefined,id);
 assert.equal(options.pushout.unit,'item');
 assert.equal(options.pushout.unit_price,750000);
});

test('project accessory prices use each entered item count, length or area independently of facade work',()=>{
 const result=pricing.priceQuotation([opening],[choice],catalog,'actor',[facade,...addons]);
 const items=byId(result.additionalItems);
 assert.deepEqual(addons.map(item=>[items[item.id].unit,items[item.id].quantity,items[item.id].total]),[
  ['item',3,180000],['item',2,70000],['meter',2.5,25000],['sqm',7.25,87000],
 ]);
 assert.deepEqual(result.lines[0].extras,[]);
 assert.equal(items.curtain.quantity,48);
 assert.ok(addons.every(item=>items[item.id].projectAddon===true));
 assert.equal(items.curtain.projectAddon,undefined);
 const groups=quotationItemGroups(result);
 assert.equal(groups.reduce((sum,group)=>sum+group.area,0),108,'Accessory area is a price basis and cannot increase measured building area');
 assert.equal(groups.reduce((sum,group)=>sum+group.openingCount,0),5);
 assert.equal(groups.find(group=>group.label==='Glass Film Shading').area,0);
 assert.equal(result.total,11162000);
 const onlyAddons=pricing.priceQuotation([],[],catalog,'actor',addons);
 assert.equal(onlyAddons.total,362000,'Catalog accessories can be priced without choosing individual walls');
});

test('Pushout is 750000 IQD per piece and two pieces cost 1500000 independent of measured areas',()=>{
 for(const quantity of [1,5,9]){
  const measured={...opening,quantity};
  const result=pricing.priceQuotation([measured],[choice],catalog,'actor',[facade,{id:'pushout',quantity:2,unit:'sqm',rate:1,total:1}]);
  const item=byId(result.additionalItems).pushout;
  assert.deepEqual(item,{id:'pushout',name:'Curtain Wall Pushout',unit:'item',rate:750000,quantity:2,total:1500000});
  assert.equal(result.total-result.lines[0].total-byId(result.additionalItems).curtain.total,1500000);
 }
 const result=pricing.priceQuotation([],[],catalog,'actor',[{...facade,measurements:[{label:'Front',width:20,height:10,quantity:4}]},{id:'pushout',quantity:2}]);
 assert.equal(byId(result.additionalItems).pushout.total,1500000);
});

test('project accessories ignore forged prices and enforce catalog units and quantity validation',()=>{
 const forged=addons.map(item=>({...item,rate:1,total:1,unit:'project',unit_price:1,name:'Forged'}));
 assert.deepEqual(pricing.priceQuotation([],[],catalog,'actor',forged).additionalItems,pricing.priceQuotation([],[],catalog,'actor',addons).additionalItems);
 for(const [id,quantity] of [['closer',1.5],['tilt',0],['bars',-1],['film',NaN],['film',1000001],['closer','3']]){
  assert.throws(()=>pricing.priceQuotation([],[],catalog,'actor',[{id,quantity}]));
 }
 assert.throws(()=>pricing.priceQuotation([],[],catalog,'actor',[{id:'closer',quantity:1},{id:'closer',quantity:2}]),/once/);
 assert.throws(()=>pricing.priceQuotation([],[],catalog,'actor',[{id:'inactive',quantity:1}]));
 assert.throws(()=>pricing.priceQuotation([],[],catalog.map(item=>item.id==='closer'?{...item,unit_price:0}:item),'actor',[{id:'closer',quantity:1}]));
});

test('project accessory discounts and catalog refresh preserve each quantity and immutable saved amounts',()=>{
 const original=pricing.priceQuotation([],[],catalog,'author',addons,5);
 assert.deepEqual(original.discount,{percent:5,subtotal:362000,amount:18100});
 assert.equal(original.total,343900);
 const saved=JSON.parse(JSON.stringify(original)),before=structuredClone(saved);
 const changed=catalog.map(item=>({...item,unit_price:item.unit_price*2}));
 const refreshed=pricing.repriceQuotation(saved,changed,'refresher');
 assert.deepEqual(saved.additionalItems.map(item=>item.projectAddon),[true,true,true,true],'JSON persistence preserves the accessory marker');
 assert.deepEqual(refreshed.additionalItems.map(item=>item.projectAddon),[true,true,true,true]);
 assert.deepEqual(refreshed.additionalItems.map(item=>item.quantity),[3,2,2.5,7.25]);
 assert.equal(quotationItemGroups(refreshed).reduce((sum,group)=>sum+group.area,0),0);
 assert.deepEqual(refreshed.additionalItems.map(item=>item.total),[360000,140000,50000,174000]);
 assert.deepEqual(refreshed.discount,{percent:5,subtotal:724000,amount:36200});
 assert.equal(refreshed.total,687800);
 assert.deepEqual(saved,before);
});

test('editing rederives project accessory markers while legacy standalone sqm products still contribute measured area',()=>{
 const saved=pricing.priceQuotation([],[],catalog,'actor',addons);
 const choices=pricing.quotationAdditionalChoices(saved);
 const repriced=pricing.priceQuotation([],[],catalog,'editor',choices);
 assert.ok(repriced.additionalItems.every(item=>item.projectAddon===true));
 const legacyCatalog=[product('legacy','Historic area product','sqm',1000,'standalone_product')];
 const legacy=pricing.priceQuotation([],[],legacyCatalog,'actor',[{id:'legacy',quantity:7.25}]);
 assert.equal(legacy.additionalItems[0].projectAddon,undefined);
 assert.equal(quotationItemGroups(legacy)[0].area,7.25);
 assert.equal(quotationItemGroups(legacy)[0].openingCount,0);
});

test('roller shutters and boxes still require per-opening shutter type, motor price and dependency',()=>{
 for(const id of ['shutter','box'])assert.throws(()=>pricing.priceQuotation([],[],catalog,'actor',[{id,quantity:2}]));
 const window={...opening,opening_type:'Window',opening_direction:'Sliding',width:150,height:100,quantity:3};
 const selected={openingId:window.id,systemId:'system',extras:[{id:'shutter',quantity:999,motorPrice:80000},{id:'box',quantity:1}]};
 const result=pricing.priceQuotation([window],[selected],catalog,'actor');
 assert.deepEqual(result.lines[0].extras.map(item=>[item.id,item.quantity,item.total]),[['shutter',3,90000],['roller-shutter-motor:shutter',3,240000],['box',3,30000]]);
 assert.equal(result.total,1440000);
 assert.throws(()=>pricing.priceQuotation([window],[{...selected,extras:[{id:'shutter',quantity:1}]}],catalog,'actor'),/motor price/);
 assert.throws(()=>pricing.priceQuotation([window],[{...selected,extras:[{id:'box',quantity:1}]}],catalog,'actor'),/requires roller shutters/);
});

function apiFixture(){
 const projectId='11111111-1111-4111-8111-111111111111';
 const state={flow:null,catalog:structuredClone(catalog),openings:[structuredClone(opening)]};
 const writes=[];
 const admin={from(table){
  const result=()=>({data:table==='sales_workflows'?state.flow:table==='openings'?state.openings:state.catalog,error:null});
  return {select(){return this;},eq(){return this;},order(){return this;},maybeSingle:async()=>result(),then(resolve){return Promise.resolve(result()).then(resolve);}};
 },rpc:async(name,args)=>{
  writes.push({name,args});
  state.flow={project_id:projectId,revision:args.p_revision+1,stage:'quotation',quotation:args.p_payload,signed_at:null};
  return {data:state.flow,error:null};
 }};
 const load=moduleLoader({
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/workflow/access':{salesProject:async()=>({admin,auth:{user:{id:'actor'},role:'Indoor Sales'},project:{id:projectId,branch:'Karkh',sales_status:'ready_for_quotation'}})},
  '@/lib/contracts/uploadedTerms':{},
 });
 const route=load('src/app/api/sales-flow/[projectId]/route');
 const post=body=>route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({projectId})});
 return {state,writes,post};
}

test('sales-flow save and price refresh persist server-priced project accessories and a Pushout piece count',async()=>{
 const fixture=apiFixture();
 const result=await fixture.post({action:'save',revision:0,choices:[choice],additionalItems:[...addons,{id:'pushout',quantity:2,rate:1,total:1}],discountPercent:5,total:1});
 assert.equal(result.status,200);
 assert.equal(fixture.writes.length,1);
 const saved=fixture.writes[0].args.p_payload,before=structuredClone(saved);
 assert.equal(fixture.writes[0].name,'advance_sales_flow');
 assert.equal(byId(saved.additionalItems).pushout.total,1500000);
 assert.deepEqual(saved.additionalItems.slice(0,4).map(item=>item.quantity),[3,2,2.5,7.25]);
 assert.deepEqual(saved.discount,{percent:5,subtotal:7862000,amount:393100});
 assert.equal(saved.total,7468900);
 fixture.state.catalog=fixture.state.catalog.map(item=>item.id==='closer'?{...item,unit_price:70000}:item);
 const preview=await fixture.post({action:'preview-prices',revision:1});
 assert.equal(preview.status,200);
 assert.equal(fixture.writes.length,1,'A preview cannot write the quotation');
 assert.equal(byId(preview.body.quotation.additionalItems).closer.total,210000);
 assert.equal(byId(preview.body.quotation.additionalItems).pushout.total,1500000);
 const updated=await fixture.post({action:'update-prices',revision:1,confirmed:true,priceKey:preview.body.priceKey});
 assert.equal(updated.status,200);
 assert.equal(fixture.writes.length,2);
 assert.equal(fixture.writes[1].args.p_payload.total,7497400);
 assert.deepEqual(saved,before,'Refresh keeps the previous quotation snapshot intact');
});

test('sales-flow refuses project shutters and boxes before its save transaction',async()=>{
 for(const id of ['shutter','box']){
  const fixture=apiFixture();
  const result=await fixture.post({action:'save',revision:0,choices:[choice],additionalItems:[{id,quantity:2,motorPrice:80000}]});
  assert.equal(result.status,400);
  assert.deepEqual(fixture.writes,[]);
 }
});
