import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleLoader(dependencies={}) {
 const cache=new Map();
 return function load(path) {
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
const {repriceQuotation,quotationPriceKey}=moduleLoader()('src/lib/workflow/pricing');
const projectId='11111111-1111-4111-8111-111111111111';
const otherProjectId='22222222-2222-4222-8222-222222222222';
const actorId='33333333-3333-4333-8333-333333333333';
const charge=(id,unit,rate,quantity)=>({id,name:`Saved ${id} specification`,unit,rate,quantity,total:Math.round(rate*quantity)});
function quotation() {
 return {
  version:2,branch:'Karkh',currency:'IQD',createdAt:'2026-10-20T08:00:00Z',preparedBy:'original-author',total:1254,
  skylightsPricedSeparately:true,
  facadeMeasurements:[{id:'facade-measurement',width:250,height:500,facade_number:1,opening_type:'Facade'}],
  lines:[{opening:{id:'opening',width:150,height:100,quantity:3,floor:'Ground',room:'Office',opening_type:'Window',opening_direction:'Sliding',has_arch:true,has_roller_shutter:false,work_area:'internal'},area:4.5,
   system:charge('system','sqm',100,4.5),glass:charge('glass','sqm',50,4.5),extras:[charge('accessory','item',20,6)],total:795}],
  additionalItems:[{...charge('facade','sqm',10,12.5),measurements:[{label:'North facade',width:2.5,height:5,quantity:1}],extras:[charge('pushout','item',7,2)]},{...charge('door','item',150,2),extras:[charge('accessory','item',20,1)]}],
 };
}
const catalog=[
 {id:'system',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:200,is_active:true},
 {id:'glass',name:'Low-E Glass',category:'glass_option',unit:'sqm',unit_price:100,is_active:true},
 {id:'accessory',name:'Hydraulic door closer',category:'addon',unit:'item',unit_price:40,is_active:true},
 {id:'facade',name:'Cladding',category:'facade_service',unit:'sqm',unit_price:20,is_active:true},
 {id:'pushout',name:'Curtain wall pushout',category:'addon',unit:'item',unit_price:14,is_active:true},
 {id:'door',name:'A Swing Door',category:'standalone_product',unit:'item',unit_price:300,is_active:true},
];

test('refresh changes rates and totals while preserving saved specifications, names, quantities and measurements',()=>{
 const saved=quotation(),before=structuredClone(saved);
 const refreshed=repriceQuotation(saved,catalog,actorId);
 assert.deepEqual(saved,before);
 assert.equal(refreshed.total,2508);
 assert.equal(refreshed.lines[0].total,1590);
 assert.equal(refreshed.lines[0].extras[0].quantity,6,'Repeated accessories must not be multiplied again');
 assert.equal(refreshed.lines[0].extras[0].total,240);
 assert.equal(refreshed.additionalItems[0].total,250);
 assert.equal(refreshed.additionalItems[0].extras[0].total,28);
 assert.equal(refreshed.preparedBy,actorId);
 assert.notEqual(refreshed.createdAt,saved.createdAt);
 assert.equal(refreshed.branch,'Karkh');
 assert.equal(refreshed.version,2,'The database assigns the saved revision number');
 assert.equal(refreshed.skylightsPricedSeparately,true);
 assert.deepEqual(refreshed.facadeMeasurements,saved.facadeMeasurements);
 assert.deepEqual(refreshed.lines[0].opening,saved.lines[0].opening);
 assert.deepEqual(refreshed.additionalItems[0].measurements,saved.additionalItems[0].measurements);
 assert.equal(refreshed.lines[0].system.name,saved.lines[0].system.name);
 assert.equal(refreshed.additionalItems[0].name,saved.additionalItems[0].name);
 refreshed.lines[0].opening.width=999;
 refreshed.additionalItems[0].measurements[0].width=999;
 assert.deepEqual(saved,before,'The preview must not share mutable measurements with the saved snapshot');
});

test('catalog edits and refreshing another quotation leave unrelated quotation and contract snapshots unchanged',()=>{
 const selected=quotation(),other=quotation(),contract={quotation:other};
 const before=JSON.stringify({selected,other,contract});
 const changed=catalog.map(item=>({...item,unit_price:item.unit_price+1}));
 assert.equal(JSON.stringify({selected,other,contract}),before);
 assert.notEqual(repriceQuotation(selected,changed,actorId).total,selected.total);
 assert.equal(JSON.stringify({selected,other,contract}),before);
});

test('price keys exclude dates, authors and labels but include every charge, rate, unit and quantity',()=>{
 const original=quotation();
 const same=structuredClone(original);same.createdAt='later';same.preparedBy='another';same.lines[0].system.name='Label changed';same.total=1;
 assert.equal(quotationPriceKey(original),quotationPriceKey(same));
 for(const mutate of [q=>q.lines[0].system.rate++,q=>q.lines[0].glass.rate++,q=>q.lines[0].extras[0].quantity++,q=>q.additionalItems[0].rate++,q=>q.additionalItems[1].extras[0].rate++,q=>q.lines[0].system.unit='item',q=>q.lines[0].system.id='other']){
  const modified=structuredClone(original);mutate(modified);
  assert.notEqual(quotationPriceKey(original),quotationPriceKey(modified));
 }
 const reordered=structuredClone(original);reordered.lines[0].system=Object.fromEntries(Object.entries(reordered.lines[0].system).reverse());
 assert.equal(quotationPriceKey(original),quotationPriceKey(reordered));
});

for(const price of [0,-1,NaN,Infinity,1e20])test(`invalid catalog price ${price} leaves the quotation intact`,()=>{
 const saved=quotation(),before=JSON.stringify(saved);
 assert.throws(()=>repriceQuotation(saved,catalog.map(item=>({...item,...(item.id==='system'?{unit_price:price}:{})})),actorId));
 assert.equal(JSON.stringify(saved),before);
});
for(const patch of [{is_active:false},{name:'Skylight'},{name:'Fiber cement'}])test(`unavailable product ${JSON.stringify(patch)} cannot be silently removed`,()=>{
 assert.throws(()=>repriceQuotation(quotation(),catalog.map(item=>item.id==='system'?{...item,...patch}:item),actorId));
});
test('missing products fail and changed units explicitly require editing',()=>{
 assert.throws(()=>repriceQuotation(quotation(),catalog.filter(item=>item.id!=='glass'),actorId));
 assert.throws(()=>repriceQuotation(quotation(),catalog.map(item=>item.id==='system'?{...item,unit:'item'}:item),actorId),/catalog unit changed.*Edit quotation/);
});

function fixture({role='Indoor Sales',branch='Karkh',projectBranch='Karkh',stage='quotation',signedAt=null,status='quotation_in_progress',additionalState=null,missingFlow=false}={}) {
 const calls=[],reads=[];
 const project={id:projectId,branch:projectBranch,created_by:'creator',sales_status:status,additional_openings_state:additionalState};
 const stored={project_id:projectId,revision:4,stage,quotation:quotation(),contract:stage==='contract'?{quotation:quotation()}:null,evidence:null,signed_at:signedAt};
 const unrelated={project_id:otherProjectId,revision:6,stage:'approved',quotation:quotation(),contract:null,signed_at:null};
 const tables={projects:[project],sales_workflows:missingFlow?[unrelated]:[stored,unrelated],product_price_settings:structuredClone(catalog)};
 const admin={from(table){
  const predicates=[];
  const result=single=>{const rows=tables[table].filter(row=>predicates.every(predicate=>predicate(row)));reads.push({table,rows});return {data:single?rows[0]??null:rows,error:null};};
  return {select(){return this;},eq(key,value){predicates.push(row=>row[key]===value);return this;},maybeSingle:async()=>result(true),then(resolve){return Promise.resolve(result(false)).then(resolve);}};
 },rpc:async(name,args)=>{calls.push({name,args});return {data:{...stored,revision:5,stage:'quotation',quotation:args.p_payload},error:null};}};
 const load=moduleLoader({
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/auth/adminServer':{requireRole:async roles=>roles.includes(role)?{ok:true,user:{id:actorId},role,profile:{branch}}:{ok:false,error:'Forbidden',status:403}},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/contracts/uploadedTerms':{},
 });
 const route=load('src/app/api/sales-flow/[projectId]/route');
 const post=body=>route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({projectId})});
 return {calls,reads,tables,stored,unrelated,post};
}
const previewBody={action:'preview-prices',revision:4};

for(const role of ['Admin','Indoor Sales','Sales Manager','Sales Director','CEO','Company Owner'])test(`${role} can preview and selectively refresh an authorized current quotation`,async()=>{
 const x=fixture({role});const before=JSON.stringify({stored:x.stored,other:x.unrelated});
 const preview=await x.post(previewBody);
 assert.equal(preview.status,200);
 assert.equal(preview.body.quotation.total,2508);
 assert.equal(preview.body.revision,4);
 assert.equal(x.calls.length,0,'Preview must not write');
 const result=await x.post({action:'update-prices',revision:preview.body.revision,priceKey:preview.body.priceKey,confirmed:true,choices:[],newOpenings:[{id:'forged'}],additionalItems:[],total:1,preparedBy:'forged'});
 assert.equal(result.status,200);
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].name,'advance_sales_flow');
 assert.equal(x.calls[0].args.p_action,'save','Use existing atomic revision history and approval reset');
 assert.equal(x.calls[0].args.p_project,projectId);
 assert.equal(x.calls[0].args.p_revision,4);
 assert.equal(x.calls[0].args.p_actor,actorId);
 assert.equal(x.calls[0].args.p_payload.total,2508);
 assert.equal(x.calls[0].args.p_payload.preparedBy,actorId);
 assert.deepEqual(x.calls[0].args.p_payload.lines[0].opening,x.stored.quotation.lines[0].opening);
 assert.equal(JSON.stringify({stored:x.stored,other:x.unrelated}),before);
 assert.ok(!x.reads.some(read=>read.table==='openings'),'Price-only refresh must not accept new measurements');
});

for(const role of ['Outdoor Sales','HR','Operations Manager'])test(`${role} cannot preview or refresh commercial prices`,async()=>{
 const x=fixture({role});
 for(const action of ['preview-prices','update-prices'])assert.equal((await x.post({action,revision:4,confirmed:true,priceKey:'forged'})).status,403);
 assert.equal(x.calls.length,0);assert.equal(x.reads.length,0);
});
for(const branch of ['Rasafa',null])test(`Indoor branch ${branch} cannot read another branch price preview`,async()=>{
 const x=fixture({branch});assert.equal((await x.post(previewBody)).status,404);
 assert.equal(x.calls.length,0);assert.ok(!x.reads.some(read=>read.table==='sales_workflows'));
});
for(const patch of [{stage:'signed',signedAt:'2026-10-21T08:00:00Z'},{stage:'operations'},{status:'contract_signed'},{status:'transferred_to_operations'},{status:'cancelled'},{status:'lost'},{status:'closed'},{additionalState:'requested'},{additionalState:'submitted'},{missingFlow:true}])test(`price refresh respects locked workflow ${JSON.stringify(patch)}`,async()=>{
 const x=fixture(patch);
 for(const action of ['preview-prices','update-prices'])assert.equal((await x.post({action,revision:patch.missingFlow?0:4,confirmed:true,priceKey:'forged'})).status,409);
 assert.equal(x.calls.length,0);
});
test('stale revisions and changed prices require a fresh preview before saving',async()=>{
 const x=fixture();assert.equal((await x.post({...previewBody,revision:3})).status,409);
 const preview=await x.post(previewBody);
 x.tables.product_price_settings[0].unit_price++;
 const changed=await x.post({action:'update-prices',revision:4,confirmed:true,priceKey:preview.body.priceKey});
 assert.equal(changed.status,409);assert.match(changed.body.error,/Catalog prices changed/);
 assert.equal(x.calls.length,0);
 const refreshed=await x.post(previewBody);
 assert.equal((await x.post({action:'update-prices',revision:4,confirmed:true,priceKey:refreshed.body.priceKey})).status,200);
});
test('confirmation and preview key are required, and an unsigned contract needs its existing replacement confirmation',async()=>{
 const x=fixture({stage:'contract'});
 const preview=await x.post(previewBody);assert.equal(preview.status,200);
 const update={action:'update-prices',revision:4,priceKey:preview.body.priceKey};
 assert.equal((await x.post(update)).status,400);
 assert.equal((await x.post({...update,confirmed:true})).status,400);
 assert.equal((await x.post({...update,confirmed:true,replaceUnsignedContract:true,priceKey:'forged'})).status,409);
 assert.equal(x.calls.length,0);
 assert.equal((await x.post({...update,confirmed:true,replaceUnsignedContract:true})).status,200);
 assert.equal(x.calls[0].args.p_action,'save');
});
