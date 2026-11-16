import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const beforeRollover='2026-11-15T20:59:59.999Z';
const afterRollover='2026-11-15T21:00:00.000Z';
const forbidden=/assigned branch or Governorates|project from your branch/;
const compiled=new Map();

// Execute the real authentication, route and validation modules. Database reads
// return only selected columns so forgetting the saved seed in requireRole is
// observable here, even when the underlying profile contains the correct seed.
function fixture(options={}){
 const at=options.at??afterRollover;
 class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[at]));}
  static now(){return Date.parse(at);}
 }
 const profile={id:actorId,full_name:'Ehab',username:'ehab',role:'Outdoor Sales',is_active:true,status:'Active',branch:'Rasafa',outdoor_team_key:null,outdoor_rotation_start_branch:'Rasafa',...options.profile};
 const reads=[],calls=[];
 let failures=options.rpcFailures??0;
 const admin={
  from(table){
   const filters=[];let columns=[];
   return {
    select(value){columns=value.split(',').map(column=>column.trim());return this;},
    eq(key,value){filters.push([key,value]);return this;},
    async maybeSingle(){
     reads.push({table,columns:[...columns],filters:structuredClone(filters)});
     if(table==='profiles'){
      assert.deepEqual(filters,[['id',actorId]]);
      return {data:Object.fromEntries(columns.map(column=>[column,profile[column]])),error:null};
     }
     if(table==='projects')return {data:null,error:null};
     if(table==='field_sync_receipts')return {data:options.receipt&&filters.every(([key,value])=>options.receipt[key]===value)?options.receipt:null,error:null};
     throw new Error(`Unexpected table: ${table}`);
    },
   };
  },
  async rpc(name,input){
   assert.ok(['register_sales_project','sync_field_change'].includes(name));
   calls.push({name,input:structuredClone(input)});
   if(failures-->0)return {data:null,error:{message:'Connection interrupted. Retry the saved operation.'}};
   return {data:name==='register_sales_project'?{projectId,clientId:'client',projectNumber:'PRJ-TEST'}:{id:projectId,branch:input.p_payload.project.branch,project_number:'PRJ-TEST'},error:null};
  },
 };
 const dependencies={
  'next/headers':{headers:async()=>new Headers({'user-agent':'iPhone Mobile'})},
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>options.serviceRole!==false},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/supabase/server':{createClient:async()=>({...admin,auth:{getUser:async()=>({data:{user:{id:actorId,email:'ehab@example.invalid'}},error:null})}})},
 };
 const modules=new Map();
 function load(path){
  const url=new URL(path,import.meta.url);
  if(modules.has(url.href))return modules.get(url.href);
  const exports={};modules.set(url.href,exports);
  if(!compiled.has(url.href))compiled.set(url.href,ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  new Function('require','exports','Date',compiled.get(url.href))(name=>{
   if(Object.hasOwn(dependencies,name))return dependencies[name];
   if(name.startsWith('@/'))return load(`../src/${name.slice(2)}.ts`);
   if(name.startsWith('.'))return load(new URL(`${name}.ts`,url));
   throw new Error(`Unexpected module: ${name}`);
  },exports,FixedDate);
  return exports;
 }
 return {reads,calls,profile,
  auth:()=>load('../src/lib/auth/adminServer.ts').requireRole(['Outdoor Sales']),
  async post(endpoint,payload){
   const request=new Request(`http://localhost:3003/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const response=await load(`../src/app/api/${endpoint}/route.ts`).POST(request);
   return {status:response.status,body:await response.json()};
  },
 };
}

function registration(branch,patch={}){
 return {
  client:{clientName:'Ehab client',mobile:'07701234567',clientType:'individual'},
  project:{branch,...(branch==='Governorates'?{governorate:'البصرة'}:{}),buildingType:'villa_house',address:'Karkh site address',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'not_ready',readinessNote:'Awaiting plastering',...patch},
 };
}
function queued(payload,patch={}){
 return {id:operationId,userId:actorId,projectId,action:'register',recordedAt:'2026-11-16T06:30:00.000Z',payload,...patch};
}
const requestFor=(endpoint,payload)=>endpoint==='offline'?queued(payload):payload;

for(const serviceRole of [true,false])test(`requireRole retains the saved rotation seed using ${serviceRole?'service':'session'} profile reads`,async()=>{
 const x=fixture({serviceRole});
 const result=await x.auth();
 assert.equal(result.ok,true);
 assert.equal(result.profile.outdoor_rotation_start_branch,'Rasafa');
 assert.equal(result.profile.branch,'Rasafa');
 assert.equal(result.mobileOutdoor,true);
 assert.deepEqual(result.outdoorTeamMemberIds,[actorId]);
 assert.ok(x.reads[0].columns.includes('outdoor_rotation_start_branch'));
});

for(const endpoint of ['sales-intake','offline']){
 for(const [at,expected]of [[beforeRollover,'Rasafa'],[afterRollover,'Karkh'],['2026-11-30T20:59:59.999Z','Karkh'],['2026-11-30T21:00:00.000Z','Rasafa']]){
  test(`${endpoint}: Ehab uses ${expected} at ${at} and can register Governorates`,async()=>{
   const x=fixture({at});
   for(const branch of [expected,'Governorates']){
    const response=await x.post(endpoint,requestFor(endpoint,registration(branch)));
    assert.equal(response.status,endpoint==='offline'?200:201,JSON.stringify(response.body));
    assert.equal(x.calls.at(-1).input.p_actor,actorId);
    assert.equal(x.calls.at(-1).input.p_payload.project.branch,branch);
    if(branch==='Governorates')assert.equal(x.calls.at(-1).input.p_payload.project.governorate,'البصرة');
   }
   const denied=expected==='Karkh'?'Rasafa':'Karkh';
   const response=await x.post(endpoint,requestFor(endpoint,registration(denied)));
   assert.equal(response.status,400);
   assert.match(response.body.error,forbidden);
   assert.equal(x.calls.length,2,'Wrong-half registrations cannot reach the write RPC');
  });
 }

 test(`${endpoint}: rotation seed is independent of the employee's Baghdad home office`,async()=>{
  const x=fixture({profile:{branch:'Karkh',outdoor_rotation_start_branch:'Rasafa'}});
  const response=await x.post(endpoint,requestFor(endpoint,registration('Karkh')));
  assert.equal(response.status,endpoint==='offline'?200:201);
  assert.equal(x.calls[0].input.p_payload.project.branch,'Karkh');
 });

 for(const seed of ['Karkh',null,undefined])for(const [at,expected]of [[beforeRollover,'Karkh'],[afterRollover,'Rasafa']]){
  test(`${endpoint}: ${String(seed)} saved seed uses ${expected} at ${at}`,async()=>{
   const x=fixture({at,profile:{outdoor_rotation_start_branch:seed}});
   const response=await x.post(endpoint,requestFor(endpoint,registration(expected)));
   assert.equal(response.status,endpoint==='offline'?200:201);
   assert.equal(x.calls[0].input.p_payload.project.branch,expected);
   const denied=await x.post(endpoint,requestFor(endpoint,registration(expected==='Karkh'?'Rasafa':'Karkh')));
   assert.equal(denied.status,400);
   assert.equal(x.calls.length,1);
  });
 }

 test(`${endpoint}: Najaf employees remain in Najaf across Baghdad's rotation boundary`,async()=>{
  for(const at of [beforeRollover,afterRollover]){
   const x=fixture({at,profile:{branch:'Najaf',outdoor_rotation_start_branch:'Rasafa'}});
   assert.equal((await x.post(endpoint,requestFor(endpoint,registration('Najaf')))).status,endpoint==='offline'?200:201);
   for(const branch of ['Karkh','Rasafa','Governorates']){
    const response=await x.post(endpoint,requestFor(endpoint,registration(branch)));
    assert.equal(response.status,400);
   }
   assert.equal(x.calls.length,1);
  }
 });

 test(`${endpoint}: forged client rotation seeds cannot replace the authenticated profile seed`,async()=>{
  const x=fixture();
  const forged=branch=>({...registration(branch,{outdoorRotationStartBranch:'Karkh',outdoor_rotation_start_branch:'Karkh'}),outdoorRotationStartBranch:'Karkh',outdoor_rotation_start_branch:'Karkh',actor:{branch:'Karkh',outdoorRotationStartBranch:'Karkh'}});
  const allowed=await x.post(endpoint,requestFor(endpoint,forged('Karkh')));
  assert.equal(allowed.status,endpoint==='offline'?200:201);
  const denied=await x.post(endpoint,requestFor(endpoint,forged('Rasafa')));
  assert.equal(denied.status,400);
  assert.match(denied.body.error,forbidden);
  assert.equal(x.calls.length,1);
  assert.equal(Object.hasOwn(x.calls[0].input.p_payload.project,'outdoorRotationStartBranch'),false);
  assert.equal(Object.hasOwn(x.calls[0].input.p_payload.project,'outdoor_rotation_start_branch'),false);
 });
}

test('failed queued Karkh registration retries the same operation and preserves every client and project detail',async()=>{
 const x=fixture({rpcFailures:1});
 const body=queued(registration('Karkh'));
 const before=structuredClone(body);
 const first=await x.post('offline',body);
 assert.equal(first.status,409);
 const retry=await x.post('offline',body);
 assert.equal(retry.status,200);
 assert.deepEqual(x.calls[0],x.calls[1]);
 const input=x.calls[1].input;
 assert.equal(input.p_operation,operationId);
 assert.equal(input.p_project,projectId);
 assert.equal(input.p_recorded_at,before.recordedAt);
 assert.deepEqual(input.p_payload.client,{...body.payload.client,locationLatitude:null,locationLongitude:null});
 assert.deepEqual(input.p_payload.project,body.payload.project);
 assert.deepEqual(body,before);
});

test('offline authorization uses the current Baghdad date and preserves the original recorded timestamp',async()=>{
 const x=fixture();
 const body=queued(registration('Karkh'),{recordedAt:beforeRollover});
 assert.equal((await x.post('offline',body)).status,200);
 assert.equal(x.calls[0].input.p_recorded_at,beforeRollover);
 const forgedOldDate=queued(registration('Rasafa'),{recordedAt:beforeRollover});
 assert.equal((await x.post('offline',forgedOldDate)).status,400);
 assert.equal(x.calls.length,1,'A client timestamp cannot authorize the previous half-month branch');
});

test('offline legacy branch omission keeps the original receipt payload while using the saved seed for validation',async()=>{
 const x=fixture();
 const payload=registration(undefined);
 assert.equal((await x.post('offline',queued(payload))).status,200);
 assert.equal(Object.hasOwn(x.calls[0].input.p_payload.project,'branch'),false);
 const online=await x.post('sales-intake',payload);
 assert.equal(online.status,201);
 assert.equal(x.calls[1].input.p_payload.project.branch,'Karkh');
});

test('a completed previous-half registration receipt can still be acknowledged without changing its operation',async()=>{
 const receipt={operation_id:operationId,actor_id:actorId,project_id:projectId,action:'register'};
 const x=fixture({receipt});
 const body=queued(registration('Rasafa'),{recordedAt:beforeRollover});
 assert.equal((await x.post('offline',body)).status,200);
 assert.equal(x.calls[0].input.p_operation,operationId);
 assert.equal(x.calls[0].input.p_payload.project.branch,'Rasafa');
 const lookup=x.reads.find(read=>read.table==='field_sync_receipts');
 assert.deepEqual(lookup.filters,[['operation_id',operationId],['actor_id',actorId],['project_id',projectId],['action','register']]);
});
