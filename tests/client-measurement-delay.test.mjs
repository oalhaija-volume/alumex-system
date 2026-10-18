import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',code)(name=>{
  if(name==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(name==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts');
  if(name==='@/lib/auth/permissions')return load('../src/lib/auth/permissions.ts');
  if(name==='@/lib/measurements/registrationOpening')return load('../src/lib/measurements/registrationOpening.ts');
  assert.ok(name in deps,name);return deps[name];
 },exports);return exports;
}
const id='11111111-1111-4111-8111-111111111111';
const context={params:Promise.resolve({projectId:id})};
function route({role='Outdoor Sales',assigned='employee',delayed=false,createdBy='creator'}={}) {
 const calls=[];
 const project={id,created_by:createdBy,assigned_outdoor_sales_id:assigned,structure_readiness:'ready',sales_status:'new_lead',measurement_delayed:delayed,updated_at:'2026-10-18T08:00:00Z'};
 return {calls,api:load('../src/app/api/initial-measurements/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,user:{id:'employee'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:project})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{...project,measurement_delayed:true}};}})},
 })};
}
const request=body=>({json:async()=>body});
test('online delay uses the verified employee, project version, and trimmed note',async()=>{
 const {api,calls}=route();
 const result=await api.PATCH(request({action:'delay-measurements',note:'  Return next week  ',actor:'forged',recordedAt:'2000-01-01'}),context);
 assert.equal(result.status,200);assert.equal(calls.length,1);
 assert.equal(calls[0].args.p_actor,'employee');assert.equal(calls[0].args.p_expected_updated_at,'2026-10-18T08:00:00Z');
 assert.deepEqual(calls[0].args.p_payload,{note:'Return next week'});assert.notEqual(calls[0].args.p_recorded_at,'2000-01-01');
});
for(const [role,assigned,status] of [['Indoor Sales','employee',403],['Admin','employee',403],['Outdoor Sales','someone-else',404]])test(`${role} cannot forge an assigned Outdoor visit`,async()=>{
 const {api,calls}=route({role,assigned});assert.equal((await api.PATCH(request({action:'delay-measurements',note:'Later'}),context)).status,status);assert.equal(calls.length,0);
});
for(const note of [undefined,' ',42,'x'.repeat(2001)])test(`delay rejects invalid note ${typeof note}/${String(note).length}`,async()=>{
 const {api,calls}=route();assert.equal((await api.PATCH(request({action:'delay-measurements',note}),context)).status,400);assert.equal(calls.length,0);
});
for(const action of ['finish','reopen'])test(`online ${action} cannot bypass a delayed visit`,async()=>{
 const {api,calls}=route({delayed:true});assert.equal((await api.PATCH(request({action}),context)).status,409);assert.equal(calls.length,0);
});
for(const role of ['Indoor Sales','Admin'])test(`${role} can resume the visit through the guarded RPC`,async()=>{
 const {api,calls}=route({role,delayed:true});assert.equal((await api.PATCH(request({action:'resume-measurements'}),context)).status,200);assert.equal(calls[0].args.p_action,'resume-measurements');
});

test('Outdoor Sales cannot resume a visit returned to CRM',async()=>{
 const {api,calls}=route({delayed:true});assert.equal((await api.PATCH(request({action:'resume-measurements'}),context)).status,403);assert.equal(calls.length,0);
});
for(const patch of [{note:undefined},{note:' '},{note:44},{note:'x'.repeat(2001)},{confirmed:false}])test(`cancellation needs a reason and confirmation: ${Object.keys(patch)}`,async()=>{
 const {api,calls}=route();assert.equal((await api.PATCH(request({action:'cancel-project',note:'Client no longer needs it',confirmed:true,...patch}),context)).status,400);assert.equal(calls.length,0);
});
test('assigned Outdoor employee can report a confirmed cancellation',async()=>{
 const {api,calls}=route();assert.equal((await api.PATCH(request({action:'cancel-project',note:' Client cancelled ',confirmed:true}),context)).status,200);
 assert.deepEqual(calls[0].args.p_payload,{note:'Client cancelled',confirmed:true});assert.equal(calls[0].args.p_actor,'employee');
});

for(const action of ['delay-measurements','cancel-project'])for(const assigned of [null,'someone-else'])test(`project creator cannot ${action} without their own assignment (${assigned})`,async()=>{
 const {api,calls}=route({createdBy:'employee',assigned});
 assert.equal((await api.PATCH(request({action,note:'Client request',confirmed:true}),context)).status,403);
 assert.equal(calls.length,0);
});
test('outcome visibility requires an explicit Outdoor assignment while preserving CRM cancellation',()=>{
 const rules=load('../src/lib/measurements/measurementDelay.ts');
 const project={created_by:'employee',sales_status:'new_lead'};
 for(const assigned of [undefined,null,'someone-else','employee']){
  const site={...project,assigned_outdoor_sales_id:assigned};
  const outdoor={id:'employee',role:'Outdoor Sales'};
  assert.equal(rules.canDelayMeasurements(site,outdoor),assigned==='employee');
  assert.equal(rules.canCancelProject(site,outdoor),assigned==='employee');
  for(const role of ['Indoor Sales','Admin','Sales Director','CEO','Company Owner']){
   assert.equal(rules.canCancelProject(site,{id:'employee',role}),true);
   assert.equal(rules.canDelayMeasurements(site,{id:'employee',role}),false);
  }
 }
});

test('opening edits use the authenticated actor and a stable operation ID',async()=>{
 const previous={id,floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 const {api,calls}=route();
 const result=await api.PATCH(request({action:'edit-opening',operationId:id,previous,opening:{...previous,width:180,quantity:3}}),context);
 assert.equal(result.status,200);assert.equal(calls[0].args.p_actor,'employee');assert.equal(calls[0].args.p_operation,id);
 assert.equal(calls[0].args.p_action,'edit-opening');assert.equal(calls[0].args.p_payload.previous.width,120);assert.equal(calls[0].args.p_payload.opening.width,180);
});
for(const patch of [{opening:{}},{previous:null},{operationId:'invalid'}])test(`invalid opening edit rejected before database write: ${Object.keys(patch)}`,async()=>{
 const previous={id,floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 const {api,calls}=route();assert.equal((await api.PATCH(request({action:'edit-opening',operationId:id,previous,opening:{...previous,width:180},...patch}),context)).status,400);assert.equal(calls.length,0);
});
