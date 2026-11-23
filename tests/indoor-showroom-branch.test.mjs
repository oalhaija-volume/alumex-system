import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const compiled=new Map();

function fixture(role,office,at){
 const writes=[],modules=new Map();
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return Date.parse(at);}}
 const admin={
  from(table){
   assert.ok(['projects','field_sync_receipts','profiles'].includes(table),`Unexpected read ${table}`);
   return {select(){return this;},eq(){return this;},in(){return this;},or(){return this;},
    maybeSingle:async()=>({data:table==='profiles'?{id:actorId,branch:office,role,is_active:true,status:'Active'}:null,error:null}),
    single:async()=>({data:{id:actorId,branch:office},error:null})};
  },
  async rpc(name,input){
   assert.ok(['register_sales_project','sync_field_change'].includes(name));writes.push({name,input:structuredClone(input)});
   return {data:{projectId,id:projectId,projectNumber:'PRJ-SHOWROOM'},error:null};
  },
 };
 const dependencies={
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,profile:{branch:office},user:{id:actorId}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
 };
 function load(path){
  const url=path instanceof URL?path:new URL(path,import.meta.url);
  if(modules.has(url.href))return modules.get(url.href);
  const exports={};modules.set(url.href,exports);
  if(!compiled.has(url.href))compiled.set(url.href,ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  new Function('require','exports','Date',compiled.get(url.href))(name=>{
   if(Object.hasOwn(dependencies,name))return dependencies[name];
   if(name.startsWith('@/'))return load(`../src/${name.slice(2)}.ts`);
   if(name.startsWith('.'))return load(new URL(`${name}.ts`,url));
   throw new Error(`Unexpected dependency ${name}`);
  },exports,FixedDate);
  return exports;
 }
 return {writes,branches:()=>load('../src/lib/intake/outdoorRotation.ts').outdoorProjectBranches({role,branch:office}),
  async post(endpoint,branch){
   const payload={registrationActorId:actorId,client:{clientName:'Showroom branch fixture',mobile:'07000000000',clientType:'individual'},
    project:{branch,assignedOutdoorSalesId:actorId,address:'Showroom fixture location',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'not_ready'}};
   const body=endpoint==='offline'?{id:operationId,userId:actorId,projectId,action:'register',recordedAt:at,payload}:payload;
   return load(`../src/app/api/${endpoint}/route.ts`).POST(new Request(`http://localhost:3003/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  }};
}

for(const role of ['Indoor Sales','Sales Manager'])for(const office of ['Karkh','Rasafa']){
 test(`${office} ${role} keeps its showroom branch across the outdoor month change`,()=>{
  for(const date of ['2026-11-15T20:59:59.999Z','2026-11-15T21:00:00.000Z']){
   assert.deepEqual(fixture(role,office,date).branches(),office==='Karkh'?['Karkh','Governorates']:['Rasafa']);
  }
 });
 for(const endpoint of ['sales-intake','offline'])for(const half of ['first','second'])for(const ownBranch of [true,false]){
  test(`${endpoint}: ${office} ${role} ${ownBranch?'saves its own':'rejects the opposite'} showroom branch in the ${half} half`,async()=>{
   const at=half==='first'?'2026-11-15T09:00:00Z':'2026-11-16T09:00:00Z';
   const branch=ownBranch?office:office==='Karkh'?'Rasafa':'Karkh';
   const x=fixture(role,office,at),response=await x.post(endpoint,branch);
   assert.equal(response.status,ownBranch?(endpoint==='sales-intake'?201:200):400);
   assert.equal(x.writes.length,ownBranch?1:0,'The opposite showroom must never reach the database write.');
   if(ownBranch){assert.equal(x.writes[0].input.p_payload.project.branch,office);assert.equal(x.writes[0].input.p_actor,actorId);}
   else assert.match((await response.json()).error,/project from your branch/);
  });
 }
}
