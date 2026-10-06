import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path,dependencies={}){
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];},exports);return exports;
}
const termsData=JSON.parse(readFileSync(new URL('../src/lib/contracts/uploadedTerms.json',import.meta.url),'utf8'));
const uploadedTerms=load('../src/lib/contracts/uploadedTerms.ts',{'./uploadedTerms.json':{default:termsData}});
const pricing=load('../src/lib/workflow/pricing.ts');
const opening={id:'opening',floor:'Ground',room:'Kitchen',width:120,height:150,opening_type:'Window',opening_direction:'Sliding'};
const catalog=[{id:'alumex',name:'Alumex System',category:'aluminum_system',unit:'sqm',unit_price:270000,is_active:true},{id:'glass',name:'Low-E Glass',category:'addon',unit:'sqm',unit_price:25000,is_active:true},{id:'closer',name:'Closer',category:'addon',unit:'item',unit_price:10000,is_active:true},{id:'unpriced',name:'Other System',category:'aluminum_system',unit:'sqm',unit_price:0,is_active:true}];
const choice={openingId:'opening',systemId:'alumex',glassId:'glass',extras:[{id:'closer',quantity:2}]};
test('catalog rates and measured area determine each opening, glass and add-on total',()=>{
 const q=pricing.priceQuotation([opening],[{...choice,unit_price:1,total:1}],catalog,'actor');
 assert.equal(q.total,551000);assert.equal(q.lines[0].system.rate,270000);assert.equal(q.lines[0].area,1.8);assert.equal(q.preparedBy,'actor');
});
test('quote snapshot retains rate after catalog changes',()=>{
 const prices=structuredClone(catalog);const q=pricing.priceQuotation([opening],[choice],prices,'actor');prices[0].unit_price=1;assert.equal(q.lines[0].system.rate,270000);
});
test('zero, inactive, missing and incompatible system choices cannot be quoted',()=>{
 for(const systemId of ['unpriced','missing','glass'])assert.throws(()=>pricing.priceQuotation([opening],[{...choice,systemId}],catalog,'actor'));
 assert.throws(()=>pricing.priceQuotation([opening],[choice],catalog.map(x=>({...x,is_active:false})),'actor'));
 assert.throws(()=>pricing.priceQuotation([{...opening,opening_type:'Skylight'}],[choice],catalog,'actor'));
});
test('duplicate or missing openings/add-ons and invalid dimensions or quantities are rejected',()=>{
 for(const choices of [[],[choice,choice],[{...choice,extras:[choice.extras[0],choice.extras[0]]}],[{...choice,extras:[{id:'closer',quantity:-1}]}]])assert.throws(()=>pricing.priceQuotation([opening],choices,catalog,'actor'));
 for(const width of [0,-1,NaN,Infinity])assert.throws(()=>pricing.priceQuotation([{...opening,width}],[choice],catalog,'actor'));
});
test('default matches movement-specific Alumex when configured; structural products stay separate',()=>{
 assert.equal(pricing.defaultSystem(opening,catalog).id,'alumex');
 assert.equal(pricing.defaultSystem(opening,[...catalog,{...catalog[0],id:'specific',name:'Alumex Sliding Window'}]).id,'specific');
 assert.equal(pricing.defaultSystem({...opening,opening_type:'Louver'},catalog),undefined);
});
const permissions=load('../src/lib/auth/permissions.ts');
for(const role of ['Operations Manager','Project Manager'])test(`${role} cannot access HR, quotations, contracts or catalog`,()=>{
 assert.equal(permissions.defaultRouteForRole(role),'/operations');
 for(const path of ['/hr','/catalog','/projects','/quotation/11111111-1111-4111-8111-111111111111','/contract/11111111-1111-4111-8111-111111111111'])assert.equal(permissions.canAccessRoute(path,role),false);
 assert.equal(permissions.canAccessRoute('/operations',role),true);
});
test('HR has employee workspace only and legacy routes remain inaccessible',()=>{
 assert.equal(permissions.defaultRouteForRole('HR'),'/hr');assert.equal(permissions.canAccessRoute('/hr','HR'),true);
 for(const path of ['/finance','/factory','/dashboard','/contracts','/quotations'])assert.equal(permissions.canAccessRoute(path,'Admin'),false);
});
const json={NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
for(const role of ['Operations Manager','Project Manager'])test(`${role} is rejected by commercial API before database access`,async()=>{
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({response:{status:403}})},'@/lib/workflow/pricing':pricing,'@/lib/contracts/uploadedTerms':uploadedTerms});
 const context={params:Promise.resolve({projectId:'project'})};assert.equal((await route.GET(new Request('https://example.test'),context)).status,403);assert.equal((await route.POST(new Request('https://example.test',{method:'POST'}),context)).status,403);
});
test('operations acceptance never returns the commercial RPC record',async()=>{
 const route=load('../src/app/api/operations/route.ts',{'next/server':json,'@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Operations Manager',user:{id:'actor'}})},'@/lib/workflow/operations':load('../src/lib/workflow/operations.ts'),'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:{quotation:{total:9000},contract:{},evidence:{signature:'secret'}},error:null})})}});
 const result=await route.POST({json:async()=>({projectId:'project',revision:3})});assert.deepEqual(result.body,{ok:true});
});
test('stale quotation revision never reaches the transition RPC',async()=>{
 let calls=0;
 const admin={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{revision:4,stage:'quotation'},error:null})};},rpc:()=>{calls++;}};
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({admin,auth:{user:{id:'actor'}},project:{id:'project'}})},'@/lib/workflow/pricing':pricing,'@/lib/contracts/uploadedTerms':uploadedTerms});
 const result=await route.POST(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',revision:3,confirmed:true})}),{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.status,409);assert.equal(calls,0);
});
for(const body of [{method:'digital',signature:''},{method:'upload'},{method:'digital',signature:'data:image/png;base64,forged'}])test(`unsigned/invalid ${body.method} evidence cannot trigger handoff`,async()=>{
 let calls=0;
 const admin={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{revision:4,stage:'contract'},error:null})};},rpc:()=>{calls++;}};
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({admin,auth:{user:{id:'actor'}},project:{id:'project'}})},'@/lib/workflow/pricing':pricing,'@/lib/contracts/uploadedTerms':uploadedTerms});
 const result=await route.POST(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sign',revision:4,signer:'Client',consent:true,...body})}),{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.status,400);assert.equal(calls,0);
});
const username=load('../src/lib/auth/username.ts');
const roles=load('../src/lib/auth/roles.ts');
function employeeRoute(admin,actorRole='Admin'){
 return load('../src/app/api/admin/users/route.ts',{'next/server':json,'@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:actorRole})},'@/lib/auth/roles':roles,'@/lib/auth/username':username,'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true}});
}
test('HR requires manually entered credentials and cannot grant Admin',async()=>{
 const route=employeeRoute({},'HR');
 assert.equal((await route.POST({json:async()=>({fullName:'Employee',role:'Indoor Sales'})})).status,400);
 assert.equal((await route.POST({json:async()=>({fullName:'Employee',role:'Admin',username:'employee',password:'secure-example'})})).status,403);
});
test('manager provisioning fails closed when database privacy rules are absent',async()=>{
 let created=false;const route=employeeRoute({rpc:async()=>({error:{code:'missing'}}),auth:{admin:{createUser:()=>{created=true;}}}});
 for(const role of ['Operations Manager','Project Manager'])assert.equal((await route.POST({json:async()=>({fullName:'Employee',role,username:'employee',password:'secure-example'})})).status,503);
 assert.equal(created,false);
});
test('employee creation passes password only to Auth, never profile or response',async()=>{
 let authInput,profileInput;const route=employeeRoute({from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null}),upsert:async(value)=>{profileInput=value;return {error:null};}};},auth:{admin:{createUser:async(value)=>{authInput=value;return {data:{user:{id:'new-user'}},error:null};}}}});
 const result=await route.POST({json:async()=>({fullName:'New Employee',role:'Indoor Sales',username:'New.User',password:' pass with spaces '})});
 assert.equal(result.status,201);assert.equal(authInput.password,' pass with spaces ');assert.equal(profileInput.username,'new.user');assert.equal(profileInput.full_name,'New Employee');assert.equal('password' in profileInput,false);assert.equal(JSON.stringify(result).includes('pass with spaces'),false);
});

test('operations specification projection excludes all monetary and contractual fields',()=>{
 const operations=load('../src/lib/workflow/operations.ts');
 const quote=pricing.priceQuotation([opening],[choice],catalog,'actor');
 const safe=operations.operationalSpecifications(quote);
 assert.deepEqual(safe,[{openingId:'opening',system:'Alumex System',glass:'Low-E Glass',extras:[{name:'Closer',quantity:2,unit:'item'}]}]);
 assert.equal(/rate|price|total|signature|contract/i.test(JSON.stringify(safe)),false);
});

for(const template of ['residential','commercial'])test(`${template} contract generation saves its uploaded terms and selected template`,async()=>{
 let input;
 const admin={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{revision:2,stage:'approved'},error:null}),single:async()=>({data:{name:'Client',mobile:'07000',client_type:'individual'},error:null})};},rpc:async(name,args)=>{input=args;return {data:{},error:null};}};
 const route=load('../src/app/api/sales-flow/[projectId]/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({admin,auth:{user:{id:'actor'}},project:{id:'project',client_id:'client',project_name:'Site',project_number:'PRJ-1',address:'Baghdad'}})},'@/lib/workflow/pricing':pricing,'@/lib/contracts/uploadedTerms':uploadedTerms});
 const result=await route.POST(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contract',revision:2,template})}),{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.status,200);assert.equal(input.p_payload.template,template);assert.deepEqual(input.p_payload.terms,termsData[template]);
 const payments=input.p_payload.terms.find(x=>x.title==='payment terms').text;
 assert.match(payments,template==='commercial'?/25%/:/50/);
 assert.ok(input.p_payload.terms.some(x=>x.text.includes('عشرة سنوات')));
});
test('project deletion rejects unauthorized roles and missing confirmation before mutation',async()=>{
 const access={'@/lib/workflow/access':{salesRoles:['Admin','Indoor Sales','Outdoor Sales']}};
 let calls=0;const admin={rpc:()=>{calls++;}};
 function route(ok){return load('../src/app/api/workspace/route.ts',{'next/server':json,...access,'@/lib/auth/adminServer':{requireRole:async roles=>{assert.deepEqual(roles,['Admin']);return ok?{ok:true,user:{id:'actor'}}:{ok:false,status:403,error:'Denied'};}},'@/lib/supabase/admin':{createAdminClient:()=>admin}});}
 assert.equal((await route(false).DELETE({json:async()=>({})})).status,403);
 assert.equal((await route(true).DELETE({json:async()=>({projectId:'11111111-1111-4111-8111-111111111111'})})).status,400);
 assert.equal(calls,0);
});
test('follow-up history checks project access before reading receipts',async()=>{
 const route=load('../src/app/api/projects/[projectId]/follow-ups/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({response:{status:404}})}});
 assert.equal((await route.GET({}, {params:Promise.resolve({projectId:'other-project'})})).status,404);
});
test('follow-up history uses each saved note rather than the current overwritten project note',async()=>{
 const project={id:'project',project_name:'Client',project_number:'PRJ-1',structure_readiness:'not_ready',project_notes:'Latest note',next_follow_up_at:null};
 const rows=[{operation_id:'new',actor_id:'actor',action:'follow-up',recorded_at:'2026-10-07T10:00:00Z',result:{project_notes:'Latest note',next_follow_up_at:'2026-10-10T10:00:00Z'}},{operation_id:'old',actor_id:'actor',action:'follow-up',recorded_at:'2026-10-06T10:00:00Z',result:{project_notes:'First call',next_follow_up_at:'2026-10-07T10:00:00Z'}}];
 const admin={from(table){return {select(){return this;},eq(column,id){assert.equal(id,'project');return this;},in(){return table==='profiles'?Promise.resolve({data:[{id:'actor',full_name:'Sales employee'}]}):this;},order(){return this;},range:async()=>({data:rows,error:null})};}};
 const route=load('../src/app/api/projects/[projectId]/follow-ups/route.ts',{'next/server':json,'@/lib/workflow/access':{salesProject:async()=>({project,admin})}});
 const result=await route.GET({}, {params:Promise.resolve({projectId:'project'})});assert.equal(result.status,200);assert.deepEqual(result.body.entries.map(e=>e.note),['Latest note','First call']);assert.equal(result.body.entries[1].recordedBy,'Sales employee');
});
