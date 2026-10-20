import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,deps={}){const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',source)(name=>{if(name==='@/lib/auth/projectBranchAccess')return load('src/lib/auth/projectBranchAccess.ts',{});assert.ok(name in deps,name);return deps[name];},exports);return exports;}
const rules=load('src/lib/measurements/completion.ts');
const photo='data:image/jpeg;base64,/9j/AAAA';
test('completion accepts both optional fields separately or together and trims notes',()=>{
 for(const input of [{},{note:'  ملاحظة  '},{photo},{note:'Photo note',photo},{note:null,photo:null}])assert.deepEqual(rules.normalizeMeasurementCompletion(input),{note:input.note?.trim()??'',photo:input.photo??''});
});
test('completion rejects invalid or oversized notes and images',()=>{
 for(const input of [{note:3},{note:'x'.repeat(2001)},{photo:3},{photo:'https://example.invalid/photo.jpg'},{photo:'data:image/svg+xml;base64,AAAA'},{photo:photo+'A'.repeat(700000)}])assert.throws(()=>rules.normalizeMeasurementCompletion(input));
});
test('downloaded report photos survive metadata refresh only for the same report and project',()=>{
 const report={id:'one',project_id:'site',note:'note',has_photo:true};
 assert.equal(rules.retainMeasurementReport(report,[{...report,photo}]).photo,photo);
 for(const patch of [{id:'two'},{project_id:'other'},{has_photo:false}])assert.equal(rules.retainMeasurementReport({...report,...patch},[{...report,photo}]).photo,undefined);
});
for(const mode of ['metadata','photo','forbidden','missing','invalid','error'])test(`measurement report API ${mode}`,async()=>{
 const projectId='11111111-1111-4111-8111-111111111111',reportId='22222222-2222-4222-8222-222222222222';const filters=[];let fields;
 const route=load('src/app/api/measurement-reports/[projectId]/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}},
  '@/lib/workflow/access':{salesProject:async()=>mode==='forbidden'?{response:{status:404}}:{admin:{from(table){assert.equal(table,'measurement_completion_reports');return {select(value){fields=value;return this;},eq(key,value){filters.push([key,value]);return this;},maybeSingle:async()=>({data:mode==='missing'?null:{photo},error:mode==='error'?{}:null}),order:async()=>({data:[],error:null})};}}}},
 });
 const response=await route.GET(new Request('http://localhost:3003/api/measurement-reports/'+projectId+(mode==='metadata'?'':'?report='+(mode==='invalid'?'bad':reportId))),{params:Promise.resolve({projectId})});
 assert.equal(response.status,['forbidden','missing','invalid'].includes(mode)?404:mode==='error'?500:200);
 if(mode==='metadata'){assert.ok(!fields.split(',').includes('photo'));assert.deepEqual(response.body.reports,[]);}
 if(mode==='photo'){assert.deepEqual(filters,[['project_id',projectId],['id',reportId]]);assert.equal(response.body.photo,photo);assert.equal(response.headers['Cache-Control'],'private, no-store');}
});

for(const invalid of [false,true])test(`direct completion API validates and atomically submits report: invalid=${invalid}`,async()=>{
 const projectId='11111111-1111-4111-8111-111111111111';let rpc;
 const api=load('src/app/api/initial-measurements/[projectId]/route.ts',{
  '@/lib/measurements/completion':rules,
  '@/lib/measurements/measurementDelay':{},'@/lib/measurements/registrationOpening':{},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id:'actor'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/supabase/admin':{createAdminClient:()=>({from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:projectId,created_by:'actor',structure_readiness:'ready',sales_status:'new_lead'}})};},rpc:async(name,args)=>{rpc={name,args};return {data:{},error:null};}})},
 });
 const response=await api.PATCH({json:async()=>({action:'finish',note:invalid?3:'Site note',photo})},{params:Promise.resolve({projectId})});
 assert.equal(response.status,invalid?400:200);
 if(invalid)assert.equal(rpc,undefined);else{assert.equal(rpc.name,'sync_field_change');assert.equal(rpc.args.p_actor,'actor');assert.equal(rpc.args.p_action,'finish');assert.deepEqual(rpc.args.p_payload,{note:'Site note',photo});}
});

test('offline API preserves legacy finish payloads for receipts already saved by older clients',async()=>{
 let payload;const api=load('src/app/api/offline/route.ts',{
  '@/lib/measurements/completion':rules,'@/lib/intake/projectBranch':{},'@/lib/intake/buildingType':{},'@/lib/measurements/measurementDelay':{},'@/lib/intake/readinessNote':{},'@/lib/measurements/registrationOpening':{},'@/lib/location/coordinates':{},'@/lib/workflow/followUps':{},'@/lib/workflow/access':{salesRoles:[]},'@/lib/auth/permissions':{},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,user:{id:'actor'},role:'Outdoor Sales'})},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{payload=args.p_payload;return {data:{},error:null};}})},
 });
 const response=await api.POST({json:async()=>({id:'11111111-1111-4111-8111-111111111111',projectId:'22222222-2222-4222-8222-222222222222',userId:'actor',recordedAt:'2026-10-18T08:00:00Z',action:'finish',payload:{action:'finish'}})});
 assert.equal(response.status,200);assert.deepEqual(payload,{});
});
