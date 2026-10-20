import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,deps={}){
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(name==='@/lib/auth/projectBranchAccess')return load('../src/lib/auth/projectBranchAccess.ts',{});if(name==='@/lib/auth/permissions')return load('../src/lib/auth/permissions.ts');assert.ok(name in deps,name);return deps[name];},exports);return exports;
}
const permissions=load('../src/lib/auth/permissions.ts');
const stages=load('../src/lib/workflow/stages.ts');
const json={NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
const id='11111111-1111-4111-8111-111111111111';
for(const role of ['Outdoor Sales','Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner','HR',null])test(`${role}: quotation access follows job role, not measurement ownership`,async()=>{
 const allowed=['Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner'].includes(role);
 assert.equal(permissions.canPrepareQuotation(role),allowed);
 for(const route of [`/quotation/${id}`,`/contract/${id}`])assert.equal(permissions.canAccessRouteWithOverrides(route,role,[{route_path:route,can_access:true}]),allowed);
});
for(const owner of ['creator','assigned'])test(`Outdoor Sales ${owner} cannot call commercial GET or POST, even for a completed project`,async()=>{
 let reads=0;
 const access=load('../src/lib/workflow/access.ts',{
  'next/server':json,'@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id:owner}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},'@/lib/supabase/admin':{createAdminClient:()=>{reads++;throw Error('Forbidden database access');}},
 });
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{'next/server':json,'@/lib/workflow/access':access,'@/lib/contracts/uploadedTerms':{},'@/lib/workflow/pricing':{},'@/lib/workflow/quotationOpenings':{}});
 const context={params:Promise.resolve({projectId:id})};
 assert.equal((await route.GET(new Request('https://example.test'),context)).status,403);
 for(const action of ['save','approve','contract','sign']){
  const response=await route.POST(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:0,role:'Indoor Sales',created_by:owner,confirmed:true})}),context);
  assert.equal(response.status,403);
 }
 assert.equal(reads,0);
});
for(const role of ['Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner'])test(`${role} can prepare a quotation for an Outdoor Sales project`,async()=>{
 const project={id,branch:'Karkh',created_by:'outdoor',assigned_outdoor_sales_id:'outdoor',sales_status:'ready_for_quotation'};
 const access=load('../src/lib/workflow/access.ts',{
  'next/server':json,'@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,profile:{branch:'Karkh'},user:{id:'indoor'}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:project})})})},
 });
 assert.equal((await access.salesProject(id,'commercial')).response,undefined);
});
test('Outdoor project links stay on measurements after handoff',()=>{
 for(const sales_status of ['ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated','transferred_to_operations'])assert.equal(stages.projectLink({id,sales_status,structure_readiness:'ready'},false),`/initial-measurements/${id}`);
 assert.equal(stages.projectLink({id,sales_status:'ready_for_quotation',structure_readiness:'ready'},true),`/quotation/${id}`);
});
