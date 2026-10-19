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
    if(name==='@/lib/measurements/completion')return loadModule('../src/lib/measurements/completion.ts',{});if(name==='@/lib/measurements/measurementDelay')return loadModule('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':loadModule('../src/lib/auth/permissions.ts',{})});
    if(name==='@/lib/intake/projectBranch')return loadModule('../src/lib/intake/projectBranch.ts',{});if(name==='@/lib/intake/buildingType')return loadModule('../src/lib/intake/buildingType.ts',{});
    if(name==='@/lib/intake/readinessNote')return loadModule('../src/lib/intake/readinessNote.ts',{});
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
   '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload,args});return {data:{projectId:'project',clientId:'client',projectNumber:'PRJ-TEST'}};},from(table){
    assert.ok(['clients','projects','profiles'].includes(table));
    return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}}),like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id:table,branch:table==='profiles'?'Karkh':undefined}})};
   }})},
  });
  const response=await route.POST({json:async()=>({client:{clientType:'individual',clientName:'Test',mobile:'07700000000'},project:{branch:'Rasafa',buildingType:'residential_building',structureReadiness:readiness,readinessNote:role==='Outdoor Sales'&&readiness==='not_ready'?'  Plastering unfinished  ':null,assignedOutdoorSalesId:role==='Indoor Sales'?'dddddddd-dddd-4ddd-8ddd-dddddddddddd':null},created_by:'forged'})});
  assert.equal(response.status,201);assert.equal(response.body.nextPath,undefined);
  assert.equal(writes.length,1);
  assert.equal(writes[0].args.p_actor,'actor');
  assert.deepEqual(response.body,{projectId:'project',clientId:'client',projectNumber:'PRJ-TEST'});
  const project=writes[0].value.project;
  assert.equal(project.assignedOutdoorSalesId,role==='Indoor Sales'?'dddddddd-dddd-4ddd-8ddd-dddddddddddd':null);
  assert.equal(project.structureReadiness,readiness);
  assert.equal(project.readinessNote,role==='Outdoor Sales'&&readiness==='not_ready'?'Plastering unfinished':null);
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
   '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload,args});return {data:{projectId:'project',clientId:'client',projectNumber:'PRJ-TEST'}};},from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}}),like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id:table,branch:table==='profiles'?'Karkh':undefined}})};}})},
  });
  const response=await route.POST({json:async()=>({
   client:{clientType:scenario==='invalid-type'?'unknown':scenario==='individual'?'individual':'company',clientName:'Example',mobile:'07701234567',...(scenario==='missing-company'?{}:{locationLatitude:33.1,locationLongitude:44.1})},
   project:{assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Selected project address',structureReadiness:'ready',locationLatitude:scenario==='missing-site'?null:33.9,locationLongitude:44.9},
  })});
  if(['missing-site','invalid-type'].includes(scenario)) {assert.equal(response.status,400);assert.equal(writes.length,0);return;}
  assert.equal(response.status,201);
  const {client,project}=writes[0].value;
  assert.equal(client.clientType,scenario==='individual'?'individual':'company');
  assert.equal(client.clientName,'Example');
  assert.equal(client.locationLatitude,scenario==='corporate'?33.1:null);
  assert.equal(client.locationLongitude,scenario==='corporate'?44.1:null);
  assert.equal(project.address,'Selected project address');assert.equal(project.locationLatitude,33.9);assert.equal(project.locationLongitude,44.9);
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

for(const target of ['self','outdoor','other-indoor','inactive','missing'])test(`registration measurement assignee: ${target}`,async()=>{
 const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';const writes=[];
 const route=loadModule('../src/app/api/sales-intake/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Indoor Sales',user:{id:actor}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/location/coordinates':{parseProjectLocation:()=>({isValid:true,latitude:33.3,longitude:44.4})},
  '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload,args});return {data:{projectId:'project',clientId:'client',projectNumber:'PRJ-TEST'}};},from(table){return {
   select(){return this;},eq(){return this;},like:async()=>({data:[]}),
   maybeSingle:async()=>({data:target==='outdoor'?{id:other}:null}),
   insert(value){writes.push({table,value});return this;},single:async()=>({data:{id:table,branch:'Karkh'}}),
  };}})},
 });
 const assignee=target==='self'?actor:target==='missing'?null:other;
 const result=await route.POST({json:async()=>({client:{clientType:'individual',clientName:'Client',mobile:'07700000000'},project:{branch:'Rasafa',buildingType:'residential_building',structureReadiness:'ready',assignedOutdoorSalesId:assignee}})});
 if(target==='self'||target==='outdoor'){
  assert.equal(result.status,201);assert.equal(writes[0].value.project.assignedOutdoorSalesId,assignee);
 }else{assert.equal(result.status,400);assert.equal(writes.length,0);}
});

for (const endpoint of ['sales-intake','offline']) for (const note of [undefined,' \n\t ',123,'x'.repeat(2001),'  الجدران غير مكتملة  ']) {
 test(`${endpoint} enforces and preserves the Outdoor Sales readiness note: ${typeof note === 'string' ? note.length : typeof note}`,async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',writes=[];
  const valid=typeof note==='string'&&note.trim()==='الجدران غير مكتملة';
  const route=loadModule(`../src/app/api/${endpoint}/route.ts`,{
   'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
   '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id}})},
   '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
   '@/lib/location/coordinates':loadModule('../src/lib/location/coordinates.ts',{}),
   '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
   '@/lib/auth/permissions':{},'@/lib/workflow/access':{},'@/lib/workflow/followUps':{},'@/lib/measurements/registrationOpening':{},
   '@/lib/supabase/admin':{createAdminClient:()=>({
    rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload.project});return {data:{id}};},
    from(table){return {select(){return this;},like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id}})};},
   })},
  });
  const payload={client:{clientType:'individual',clientName:'Test',mobile:'07700000000'},project:{branch:'Rasafa',buildingType:'residential_building',structureReadiness:'not_ready',readinessNote:note,locationLatitude:33.3,locationLongitude:44.4}};
  const body=endpoint==='offline'?{id,userId:id,projectId:id,action:'register',recordedAt:new Date().toISOString(),payload}:payload;
  const response=await route.POST({json:async()=>body});
  assert.equal(response.status,valid?(endpoint==='offline'?undefined:201):400);
  if(valid){const write=writes.find(w=>w.table==='rpc');assert.equal(write.value.readinessNote,'الجدران غير مكتملة');}
  else {assert.equal(writes.length,0);assert.match(response.body.error,/note/);}
 });
}

for(const scenario of ['address','omitted','blank','too-long','partial','invalid','indoor'])test(`offline address-only registration: ${scenario}`,async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',writes=[];
 const role=scenario==='indoor'?'Indoor Sales':'Outdoor Sales';
 const route=loadModule('../src/app/api/offline/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,user:{id}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push(args);return {data:{id}};}})},
  '@/lib/workflow/followUps':{},'@/lib/auth/permissions':{},'@/lib/workflow/access':{},
  '@/lib/measurements/registrationOpening':{},'@/lib/location/coordinates':loadModule('../src/lib/location/coordinates.ts',{}),
 });
 const project={address:scenario==='blank'?'   ':scenario==='too-long'?'x'.repeat(2001):'  بغداد - المنصور  ',structureReadiness:'ready',...(scenario==='omitted'?{}:{locationLatitude:scenario==='partial'?33.3:scenario==='invalid'?999:null,locationLongitude:scenario==='invalid'?44.4:null})};
 const response=await route.POST({json:async()=>({id,userId:id,projectId:id,action:'register',recordedAt:new Date().toISOString(),payload:{client:{clientType:'individual',clientName:'Offline client',mobile:'07700000000'},project}})});
 if(!['address','omitted'].includes(scenario)){assert.equal(response.status,400);assert.equal(writes.length,0);return;}
 assert.equal(response.status,200);assert.equal(writes.length,1);
 assert.equal(writes[0].p_payload.project.address,'بغداد - المنصور');
 assert.equal(writes[0].p_payload.project.locationLatitude,null);assert.equal(writes[0].p_payload.project.locationLongitude,null);
 assert.equal(writes[0].p_actor,id);
});

for(const endpoint of ['sales-intake','offline'])for(const buildingType of [undefined,null,'','wrong',7,'commercial_building','residential_building','villa_house'])test(`${endpoint} validates building type ${String(buildingType)}`,async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',writes=[];
 const valid=['commercial_building','residential_building','villa_house'].includes(buildingType)||(endpoint==='offline'&&buildingType===undefined);
 const route=loadModule(`../src/app/api/${endpoint}/route.ts`,{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/location/coordinates':loadModule('../src/lib/location/coordinates.ts',{}),
  '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
  '@/lib/auth/permissions':{},'@/lib/workflow/access':{},'@/lib/workflow/followUps':{},'@/lib/measurements/registrationOpening':{},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload.project});return {data:{id}};},from(table){return {select(){return this;},like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id}})};}})},
 });
 const payload={client:{clientType:'individual',clientName:'Test',mobile:'07700000000'},project:{branch:'Rasafa',...(buildingType===undefined?{}:{buildingType}),structureReadiness:'ready',locationLatitude:33.3,locationLongitude:44.4}};
 const body=endpoint==='offline'?{id,userId:id,projectId:id,action:'register',recordedAt:new Date().toISOString(),payload}:payload;
 const response=await route.POST({json:async()=>body});assert.equal(response.status,valid?(endpoint==='offline'?undefined:201):400);
 if(valid){const saved=writes.find(w=>w.table==='rpc').value;assert.equal(saved.buildingType,buildingType);if(buildingType===undefined)assert.equal(Object.hasOwn(saved,'buildingType'),false,'Preserve legacy receipt fingerprints');}
 else{assert.equal(writes.length,0);assert.match(response.body.error,/building type/);}
});

for(const scenario of ['valid','invalid','conflict'])test(`offline opening edit endpoint: ${scenario}`,async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',writes=[];
 const route=loadModule('../src/app/api/offline/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push(args);return scenario==='conflict'?{error:{message:'This opening changed on another device.'}}:{data:{id}};}})},
  '@/lib/workflow/followUps':{},'@/lib/auth/permissions':{},'@/lib/workflow/access':{},'@/lib/location/coordinates':{},
  '@/lib/measurements/registrationOpening':loadModule('../src/lib/measurements/registrationOpening.ts',{}),
 });
 const previous={id,floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 const response=await route.POST({json:async()=>({id,userId:id,projectId:id,action:'edit-opening',recordedAt:new Date().toISOString(),payload:{previous,opening:{...previous,width:scenario==='invalid'?0:180,quantity:4}}})});
 assert.equal(response.status,scenario==='invalid'?400:scenario==='conflict'?409:200);
 if(scenario==='invalid')assert.equal(writes.length,0);
 else{assert.equal(writes.length,1);assert.equal(writes[0].p_action,'edit-opening');assert.equal(writes[0].p_actor,id);assert.equal(writes[0].p_payload.opening.width,180);assert.equal(writes[0].p_payload.previous.width,120);}
});

for(const role of ['Outdoor Sales','Indoor Sales','Sales Manager'])for(const deleted of [true,false])test(`offline deletion recovery checks prior access: ${role}, deleted=${deleted}`,async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',filters=[];
 const route=loadModule('../src/app/api/offline/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role,user:{id}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({
   rpc:async()=>({data:null,error:{message:'Project is not available to this employee'}}),
   from(table){assert.equal(table,'audit_events');return {select(value){assert.equal(value,'id');return this;},eq(key,value){filters.push([key,value]);return this;},or(value){filters.push(['or',value]);return this;},limit(){return this;},maybeSingle:async()=>({data:deleted?{id:'audit'}:null,error:null})};},
  })},
  '@/lib/auth/permissions':loadModule('../src/lib/auth/permissions.ts',{}),
  '@/lib/workflow/followUps':{},'@/lib/workflow/access':{salesRoles:[role]},
  '@/lib/measurements/registrationOpening':{},'@/lib/location/coordinates':{},
 });
 const response=await route.POST({json:async()=>({id,userId:id,projectId:id,recordedAt:new Date().toISOString(),action:'cancel-project',payload:{note:'Client cancelled',confirmed:true}})});
 assert.equal(response.status,deleted?410:409);assert.equal(response.body.code,deleted?'project_deleted':undefined);
 assert.ok(filters.some(([key,value])=>key==='entity_id'&&value===id));
 assert.ok(filters.some(([key,value])=>key==='action'&&value==='project_deleted'));
 assert.equal(filters.some(([key])=>key==='or'),role==='Outdoor Sales');
 if(role==='Outdoor Sales')assert.equal(filters.find(([key])=>key==='or')[1],`previous_value->>created_by.eq.${id},previous_value->>assigned_outdoor_sales_id.eq.${id}`);
});

for(const endpoint of ['sales-intake','offline'])for(const branch of [undefined,null,'','wrong',7,'Karkh','Rasafa'])test(`${endpoint} validates project branch ${String(branch)}`,async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',writes=[];
 const valid=['Karkh','Rasafa'].includes(branch)||(endpoint==='offline'&&branch===undefined);
 const route=loadModule(`../src/app/api/${endpoint}/route.ts`,{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/auth/adminServer':{requireRole:async()=>({ok:true,role:'Outdoor Sales',user:{id}})},
  '@/lib/supabase/config':{hasSupabaseServiceRoleKey:()=>true},
  '@/lib/location/coordinates':loadModule('../src/lib/location/coordinates.ts',{}),
  '@/lib/projects/numbering':{generateNextProjectNumber:()=> 'PRJ-TEST'},
  '@/lib/auth/permissions':{},'@/lib/workflow/access':{},'@/lib/workflow/followUps':{},'@/lib/measurements/registrationOpening':{},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{writes.push({table:'rpc',value:args.p_payload.project});return {data:{id}};},from(table){return {select(){return this;},like:async()=>({data:[]}),insert(value){writes.push({table,value});return this;},single:async()=>({data:{id}})};}})},
 });
 const payload={client:{clientType:'individual',clientName:'Test',mobile:'07700000000'},project:{buildingType:'villa_house',...(branch===undefined?{}:{branch}),structureReadiness:'ready',locationLatitude:33.3,locationLongitude:44.4}};
 const body=endpoint==='offline'?{id,userId:id,projectId:id,action:'register',recordedAt:new Date().toISOString(),payload}:payload;
 const response=await route.POST({json:async()=>body});assert.equal(response.status,valid?(endpoint==='offline'?undefined:201):400);
 if(valid){const saved=writes.find(w=>w.table==='rpc').value;assert.equal(saved.branch,branch);if(branch===undefined)assert.equal(Object.hasOwn(saved,'branch'),false,'Preserve legacy receipt fingerprints');}
 else{assert.equal(writes.length,0);assert.match(response.body.error,/project branch/);}
});
