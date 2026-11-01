import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,deps={}) {
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',source)(name=>{
  if(name==='@/lib/measurements/registrationOpening')return load('../src/lib/measurements/registrationOpening.ts');
  if(name==='@/lib/auth/projectBranchAccess')return load('../src/lib/auth/projectBranchAccess.ts');
  assert.ok(name in deps,name);return deps[name];
 },exports);
 return exports;
}

const projectId='11111111-1111-4111-8111-111111111111';
const context={params:Promise.resolve({projectId})};
const facade={id:'22222222-2222-4222-8222-222222222222',floor:'Whole building',room:'Facade 4',width:1650,height:390,quantity:1,has_arch:false,has_roller_shutter:false,opening_type:'Facade',opening_direction:null,work_area:'facade',facade_number:4};
const windowOpening={id:'33333333-3333-4333-8333-333333333333',floor:'GF',room:'Office',width:120,height:150,quantity:3,has_arch:false,has_roller_shutter:false,opening_type:'Window',opening_direction:'Sliding',work_area:'internal',facade_number:null};

function setup({role='Indoor Sales',rows=[facade],status='new_lead',branch='Karkh',delayed=false}={}) {
 const writes=[],reads=[];
 const project={id:projectId,branch,created_by:'creator',building_type:'commercial_building',structure_readiness:'ready',sales_status:status,measurement_delayed:delayed};
 const admin={from(table){
  let fields,update;
  const query={
   select(value){fields=value;return query;},
   update(value){update=value;return query;},
   eq(){return query;},
   maybeSingle:async()=>({data:project,error:null}),
   then(resolve,reject){
    if(update){writes.push({table,value:update});return Promise.resolve({error:null}).then(resolve,reject);}
    assert.equal(table,'openings');reads.push(table);
    // Supabase only returns selected fields, so the regression also covers
    // facade metadata accidentally being omitted from the database read.
    const selected=fields.split(',').map(field=>field.trim());
    const data=rows.map(row=>Object.fromEntries(selected.map(field=>[field,row[field]])));
    return Promise.resolve({data,error:null}).then(resolve,reject);
   },
  };
  return query;
 }};
 const api=load('../src/app/api/initial-measurements/[projectId]/route.ts',{
  '@/lib/measurements/completion':{},'@/lib/measurements/measurementDelay':{},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,profile:{branch:'Karkh'},user:{id:'employee'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
 });
 return {writes,reads,finish:()=>api.PATCH({json:async()=>({action:'finish'})},context)};
}

for(const role of ['Indoor Sales','Admin'])for(const mixed of [false,true])test(`${role} finishes ${mixed?'mixed facade and internal':'facade-only'} measurements without a report`,async()=>{
 const {finish,writes}=setup({role,rows:mixed?[facade,windowOpening]:[facade]});
 const response=await finish();
 assert.equal(response.status,200);
 assert.equal(response.body.salesStatus,'ready_for_quotation');
 assert.deepEqual(writes,[{table:'projects',value:{sales_status:'ready_for_quotation',status:'Quotation'}}]);
});

for(const patch of [
 {work_area:null},{work_area:'internal'},{facade_number:null},{facade_number:1.5},{facade_number:1001},
 {quantity:1.5},{quantity:2},{width:0},{height:-1},{opening_direction:'Sliding'},
])test(`finishing rejects invalid facade data ${JSON.stringify(patch)}`,async()=>{
 const {finish,writes}=setup({rows:[{...facade,...patch}]});
 assert.equal((await finish()).status,400);
 assert.deepEqual(writes,[]);
});

for(const rows of [[],[facade,{...windowOpening,quantity:1.5}]])test(`finishing requires complete saved measurements (${rows.length} rows)`,async()=>{
 const {finish,writes}=setup({rows});
 assert.equal((await finish()).status,400);assert.deepEqual(writes,[]);
});

for(const status of ['quotation_in_progress','quotation_approved','contract_generated','contract_signed','transferred_to_operations','cancelled'])test(`finishing cannot change locked project stage ${status}`,async()=>{
 const {finish,writes,reads}=setup({status});
 assert.equal((await finish()).status,409);assert.deepEqual(writes,[]);assert.deepEqual(reads,[]);
});

test('finishing cannot bypass an Indoor Sales branch boundary',async()=>{
 const {finish,writes,reads}=setup({branch:'Rasafa'});
 assert.equal((await finish()).status,404);assert.deepEqual(writes,[]);assert.deepEqual(reads,[]);
});

test('finishing cannot bypass a delayed measurement visit',async()=>{
 const {finish,writes,reads}=setup({delayed:true});
 assert.equal((await finish()).status,409);assert.deepEqual(writes,[]);assert.deepEqual(reads,[]);
});
