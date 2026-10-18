import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',code)(name=>{
  if(name==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts');
  if(name==='@/lib/auth/permissions')return load('../src/lib/auth/permissions.ts');
  if(name==='@/lib/measurements/registrationOpening')return load('../src/lib/measurements/registrationOpening.ts');
  assert.ok(name in deps,name);return deps[name];
 },exports);return exports;
}
const id='11111111-1111-4111-8111-111111111111';
const context={params:Promise.resolve({projectId:id})};
function route({role='Outdoor Sales',assigned='employee',delayed=false}={}) {
 const calls=[];
 const project={id,created_by:'creator',assigned_outdoor_sales_id:assigned,structure_readiness:'ready',sales_status:'new_lead',measurement_delayed:delayed,updated_at:'2026-10-18T08:00:00Z'};
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
for(const role of ['Outdoor Sales','Indoor Sales','Admin'])test(`${role} can resume the visit through the guarded RPC`,async()=>{
 const {api,calls}=route({role,delayed:true});assert.equal((await api.PATCH(request({action:'resume-measurements'}),context)).status,200);assert.equal(calls[0].args.p_action,'resume-measurements');
});
