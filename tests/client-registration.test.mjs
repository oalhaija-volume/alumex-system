import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadModule(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

test('protected API authorization allows Outdoor Sales on desktop and phones, selecting the focused phone layout', async () => {
  const mobile = loadModule('../src/lib/auth/mobileAccess.ts', {});
  for (const [role, agent, expected] of [
    ['Outdoor Sales','Mozilla/5.0 (Windows NT 10.0; Win64; x64)',false],
    ['Outdoor Sales','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',true],
    ['Indoor Sales','Mozilla/5.0 (Windows NT 10.0; Win64; x64)',true],
  ]) {
    const server = loadModule('../src/lib/auth/adminServer.ts', {
      'next/headers':{headers:async () => new Headers({'user-agent':agent})},
      '@/lib/auth/mobileAccess':mobile,
      '@/lib/auth/roles':{normalizeAppRole:value => value},
      '@/lib/supabase/config':{hasSupabaseServiceRoleKey:() => false},
      '@/lib/supabase/admin':{},
      '@/lib/supabase/server':{createClient:async () => ({
        auth:{getUser:async () => ({data:{user:{id:'employee',email:'test@example.invalid'}},error:null})},
        from:() => ({select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role,is_active:true,status:'Active'},error:null};}}),
      })},
    });
    const result = await server.requireRole(['Outdoor Sales','Indoor Sales']);
    assert.equal(result.ok,true);
    assert.equal(result.mobileOutdoor, role === "Outdoor Sales" && expected);
  }
});

for (const role of ['Admin', 'Indoor Sales', 'Outdoor Sales']) {
  test(`${role} starts at the main dashboard`, () => {
    const permissions = loadModule('../src/lib/auth/permissions.ts', {
      '@/lib/systemScope': {isActiveSystemRoute: () => true},
    });
    assert.equal(permissions.defaultRouteForRole(role), '/dashboard');
    assert.equal(permissions.canAccessRoute('/intake', role), true);
  });
}

for (const role of ['Admin','Indoor Sales','Outdoor Sales']) for (const readiness of ['ready','not_ready']) {
 test(`${role} registration ${readiness} stops after saving client and project`, async () => {
  const writes=[];
  const route=loadModule('../src/app/api/sales-intake/route.ts', {
   'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
   '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,user:{id:'actor'}})},
   '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
   '@/lib/location/coordinates':{parseProjectLocation:()=>({isValid:true,latitude:33.3,longitude:44.4})},
   '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
   '@/lib/supabase/admin':{createAdminClient:()=>({from(table){
    assert.ok(['clients','projects','profiles'].includes(table));
    return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}}),like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id:table,branch:table==='profiles'?'Karkh':undefined}})};
   }})},
  });
  const response=await route.POST({json:async()=>({client:{clientType:'individual',clientName:'Test',mobile:'07700000000'},project:{structureReadiness:readiness,assignedOutdoorSalesId:role==='Indoor Sales'?'dddddddd-dddd-4ddd-8ddd-dddddddddddd':null},created_by:'forged'})});
  assert.equal(response.status,201);assert.equal(response.body.nextPath,undefined);
  assert.equal(writes.length,2);
  assert.equal(writes[0].value.created_by,'actor');
  assert.equal(writes[1].value.original_creator_id,'actor');
  assert.equal(writes[1].value.assigned_outdoor_sales_id,role==='Indoor Sales'?'dddddddd-dddd-4ddd-8ddd-dddddddddddd':null);
  assert.equal(writes[1].value.status,'Draft');
  assert.equal(writes[1].value.structure_readiness,readiness);
 });
}

for (const scenario of ['corporate','individual','missing-company','missing-site','invalid-type']) {
 test(`registration requires only project site location: ${scenario}`, async () => {
  const writes=[];
  const coordinates=loadModule('../src/lib/location/coordinates.ts',{});
  const route=loadModule('../src/app/api/sales-intake/route.ts',{
   'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
   '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Indoor Sales',user:{id:'sales'}})},
   '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
   '@/lib/location/coordinates':coordinates,
   '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
   '@/lib/supabase/admin':{createAdminClient:()=>({from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}}),like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id:table,branch:table==='profiles'?'Karkh':undefined}})};}})},
  });
  const response=await route.POST({json:async()=>({
   client:{clientType:scenario==='invalid-type'?'unknown':scenario==='individual'?'individual':'company',clientName:'Example',mobile:'07701234567',...(scenario==='missing-company'?{}:{locationLatitude:33.1,locationLongitude:44.1})},
   project:{assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Selected project address',structureReadiness:'ready',locationLatitude:scenario==='missing-site'?null:33.9,locationLongitude:44.9},
  })});
  if(['missing-site','invalid-type'].includes(scenario)) {assert.equal(response.status,400);assert.equal(writes.length,0);return;}
  assert.equal(response.status,201);
  const client=writes.find(w=>w.table==='clients').value,project=writes.find(w=>w.table==='projects').value;
  assert.equal(client.client_type,scenario==='individual'?'individual':'company');
  assert.equal(client.company_name,scenario==='individual'?null:'Example');
  assert.equal(client.location_latitude,scenario==='corporate'?33.1:null);
  assert.equal(client.location_longitude,scenario==='corporate'?44.1:null);
  assert.equal(project.address,'Selected project address');assert.equal(project.location_latitude,33.9);assert.equal(project.location_longitude,44.9);
 });
}

for (const hasSite of [true,false]) test(`corporate offline sync requires only the project site: site=${hasSite}`,async()=>{
 const writes=[];
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const route=loadModule('../src/app/api/offline/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Admin',user:{id}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({name,args});return {data:{id},error:null};}})},
  '@/lib/workflow/followUps':{},'@/lib/auth/permissions':{},'@/lib/workflow/access':{salesRoles:['Admin']},
  '@/lib/measurements/registrationOpening':{},'@/lib/location/coordinates':loadModule('../src/lib/location/coordinates.ts',{}),
 });
 const result=await route.POST({json:async()=>({id,userId:id,projectId:id,recordedAt:new Date().toISOString(),action:'register',payload:{client:{clientType:'company',clientName:'Example company',mobile:'07701234567'},project:{locationLatitude:hasSite?33.9:null,locationLongitude:44.9,structureReadiness:'ready'}}})});
 if(!hasSite){assert.equal(result.status,400);assert.equal(writes.length,0);return;}
 assert.equal(result.body.error,undefined);assert.equal(writes.length,1);
 const payload=writes[0].args.p_payload;
 assert.equal(payload.client.locationLatitude,null);assert.equal(payload.client.locationLongitude,null);
 assert.equal(payload.project.locationLatitude,33.9);assert.equal(payload.project.locationLongitude,44.9);
});
