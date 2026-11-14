import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',js)(n=>{if(n==='@/lib/measurements/openingOwnership')return load('../src/lib/measurements/openingOwnership.ts',{});if(n==='@/lib/auth/outdoorTeams')return load('../src/lib/auth/outdoorTeams.ts',{});if(n==='@/lib/workflow/projectName')return load('../src/lib/workflow/projectName.ts');if(n==='@/lib/auth/projectBranchAccess')return load('../src/lib/auth/projectBranchAccess.ts');if(n==='./projectAccess')return load('../src/lib/offline/projectAccess.ts');if(n==='@/lib/location/coordinates')return load('../src/lib/location/coordinates.ts');if(n==='./device')return deps[n]??{isOfflineDevice:()=>true};if(n==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(n==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':load('../src/lib/auth/permissions.ts')});if(n==='@/lib/intake/projectBranch'||n==='./projectBranch')return load('../src/lib/intake/projectBranch.ts',{});if(n==='@/lib/intake/outdoorRotation')return load('../src/lib/intake/outdoorRotation.ts');if(n==='@/lib/intake/buildingType')return load('../src/lib/intake/buildingType.ts');if(n==='@/lib/intake/legacyOutdoorSales')return load('../src/lib/intake/legacyOutdoorSales.ts');if(n==='@/lib/intake/readinessNote')return load('../src/lib/intake/readinessNote.ts');if(n==='@/lib/auth/permissions')return load('../src/lib/auth/permissions.ts');if(!(n in deps))throw Error(n);return deps[n];},exports);return exports;}
const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Employee',role:'Indoor Sales',branch:'Karkh'};
// Registration fixtures use the employee office; legacy rotation seeds do not change access.
function outdoorActorForCurrentBranch(branch) {
 return {...actor,role:'Outdoor Sales',branch,outdoorRotationStartBranch:branch==='Najaf'?null:branch};
}
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload={client:{clientType:'individual',clientName:'Client',mobile:'07000000000'},project:{branch:'Karkh',buildingType:'villa_house',assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Site',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'ready'}};
function setup(overrides={}){globalThis.window={dispatchEvent:()=>{}};let active=actor.id;let state={actor,indoorSales:[{id:actor.id,name:actor.name,role:actor.role,branch:actor.branch}],outdoorSales:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Outdoor employee',branch:overrides.actor?.branch??actor.branch}],projects:[],openings:[],queue:[],syncedAt:null,...overrides};Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readStoredFieldState:async()=>structuredClone(state),readFieldState:async()=>load('../src/lib/offline/projectAccess.ts').visibleFieldState(structuredClone(state)),updateFieldState:async(id,fn)=>{assert.equal(id,actor.id);state=fn(structuredClone(state));return load('../src/lib/offline/projectAccess.ts').visibleFieldState(structuredClone(state));}};const client=load('../src/lib/offline/client.ts',{'./store':store,'@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),'@/lib/workflow/stages':load('../src/lib/workflow/stages.ts'),'@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts')});return {client,get state(){return state;},get active(){return active;}};}
test('desktop field requests go directly to the server without queueing',async()=>{
 const requests=[];
 const client=load('../src/lib/offline/client.ts',{
  './device':{isOfflineDevice:()=>false},
  './store':{readFieldState:async()=>{throw Error('Desktop should not read the offline queue');}},
  '@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),
  '@/lib/workflow/stages':load('../src/lib/workflow/stages.ts'),
  '@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts'),
 });
 globalThis.fetch=async(url,init)=>{requests.push({url,init});return Response.json({ok:true});};
 for(const method of ['GET','PATCH','POST'])await client.fieldFetch('/api/workspace',{method});
 assert.deepEqual(requests.map(request=>request.init.method),['GET','PATCH','POST']);
});
test('offline registration, individual opening and completion are stored in order',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);await x.client.saveFieldChange('opening',projectId,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'});await x.client.saveFieldChange('finish',projectId,{});
 assert.deepEqual(x.state.queue.map(c=>c.action),['register','opening','finish']);assert.equal(x.state.projects[0].sales_status,'ready_for_quotation');assert.equal(x.state.openings.length,1);assert.equal(new Set(x.state.queue.map(c=>c.id)).size,3);
 const response=await x.client.fieldFetch('/api/initial-measurements/'+projectId);assert.equal((await response.json()).openings.length,1);
});
test('a lost response retains the same operation ID for retry',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);const id=x.state.queue[0].id;let failed=true;const persisted=new Set();navigator.onLine=true;
 globalThis.fetch=async(url,init)=>{if(!init?.method)return Response.json({actor});const body=JSON.parse(init.body);persisted.add(body.id);if(failed){failed=false;throw Error('connection lost after commit');}return Response.json({project:{id:projectId,project_number:'PRJ-1',updated_at:'2026-10-06T00:00:00Z',sales_status:'new_lead'}});};
 await x.client.syncFieldChanges();assert.equal(x.state.queue[0].id,id);await x.client.syncFieldChanges();assert.equal(x.state.queue.length,0);assert.equal(persisted.size,1);
});
test('account changes stop syncing and preserve the original employee queue',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);navigator.onLine=true;let posts=0;globalThis.fetch=async(url,init)=>{if(init?.method)posts++;return Response.json({actor:{id:'other-account'}});};await x.client.syncFieldChanges();assert.equal(posts,0);assert.equal(x.state.queue.length,1);assert.equal(x.active,null);
});
test('server conflicts remain visible and never discard local work',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);navigator.onLine=true;globalThis.fetch=async(url,init)=>!init?.method?Response.json({actor}):Response.json({error:'Project changed on another device'},{status:409});await x.client.syncFieldChanges();assert.equal(x.state.queue.length,1);assert.match(x.state.queue[0].error,/another device/);
});
test('uncompleted and locked measurements cannot be queued as finished or extended',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);await assert.rejects(x.client.saveFieldChange('finish',projectId,{}),/at least one/);assert.equal(x.state.queue.length,1);
});
test('deletion requires online access and never discards unsynced project work',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 await assert.rejects(x.client.deleteOnlineProject(projectId),/Connect/);
 navigator.onLine=true;
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true});};
 await assert.rejects(x.client.deleteOnlineProject(projectId),/Sync/);
 assert.equal(calls,0);assert.equal(x.state.queue.length,1);
});

test('Indoor Sales cannot queue registration without an assignment; creator remains the signed-in actor',async()=>{
 const x=setup();await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:null}}),/Choose yourself or an Outdoor/);assert.equal(x.state.queue.length,0);
 await x.client.saveFieldChange('register',projectId,{...payload,created_by:'forged'});assert.equal(x.state.projects[0].created_by,actor.id);assert.equal(x.state.projects[0].assignedOutdoorSales,'Outdoor employee');
});

test('offline follow-ups retain type, description, owner and due date across device reads',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 const details={nextFollowUp:'2026-10-08T07:00:00Z',note:'Client requested a video call',followUpType:'other',followUpDetail:'Video call',followUpOwnerId:actor.id};
 await x.client.saveFieldChange('follow-up',projectId,details);
 const response=await x.client.fieldFetch('/api/workspace');const data=await response.json();
 assert.equal(data.actor.id,actor.id);assert.equal(data.indoorSales.length,1);assert.equal(data.projects[0].follow_up_type,'other');assert.equal(data.projects[0].follow_up_detail,'Video call');assert.equal(data.projects[0].follow_up_owner_id,actor.id);assert.equal(x.state.queue.at(-1).payload.followUpType,'other');
 await assert.rejects(x.client.saveFieldChange('follow-up',projectId,{...details,followUpType:''}),/type/);
 await assert.rejects(x.client.saveFieldChange('follow-up',projectId,{...details,followUpOwnerId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}),/Indoor Sales employee/);
 assert.equal(x.state.queue.length,2);
});
test('correcting a queued follow-up preserves other pending notes and uses a fresh operation ID',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 const values={nextFollowUp:'2026-10-08T07:00:00Z',note:'First note',followUpType:'call',followUpDetail:'',followUpOwnerId:actor.id};
 await x.client.saveFieldChange('follow-up',projectId,values);await x.client.saveFieldChange('follow-up',projectId,{...values,note:'Second note'});
 const first=x.state.queue[1],last=x.state.queue[2];
 await x.client.retryReviewedProject(projectId,'server-version',{changeId:first.id,values:{...values,followUpType:'whatsapp'}});
 assert.notEqual(x.state.queue[1].id,first.id);assert.equal(x.state.queue[1].payload.followUpType,'whatsapp');assert.deepEqual(x.state.queue[2].payload,last.payload);assert.equal(x.state.queue[2].id,last.id);assert.equal(x.state.projects[0].project_notes,'Second note');
});

function governorateFollowUpFixture(){
 const manager={id:'22222222-2222-4222-8222-222222222222',name:'Sales manager',role:'Sales Manager',branch:'Karkh'};
 const rasafa={id:'33333333-3333-4333-8333-333333333333',name:'Rasafa employee',role:'Indoor Sales',branch:'Rasafa'};
 const legacy={id:'44444444-4444-4444-8444-444444444444',name:'Legacy employee'};
 const project={id:projectId,branch:'Governorates',governorate:'البصرة',project_log_only:false,created_by:actor.id,structure_readiness:'ready',sales_status:'new_lead',updated_at:'2026-11-11T08:00:00Z',project_notes:'Original note'};
 const values={nextFollowUp:'2026-11-12T07:00:00Z',note:'Governorates contact',followUpType:'call',followUpDetail:'',followUpOwnerId:actor.id};
 const pending={id:'55555555-5555-4555-8555-555555555555',userId:actor.id,projectId,action:'follow-up',payload:values,recordedAt:'2026-11-11T08:00:00Z',error:'Review server version'};
 const unrelated={id:'66666666-6666-4666-8666-666666666666',userId:actor.id,projectId:'another-project',action:'follow-up',payload:{...values,note:'Other saved note'},recordedAt:'2026-11-11T08:00:00Z',error:'Unrelated conflict'};
 return {manager,rasafa,legacy,project,values,pending,unrelated,indoorSales:[{...actor},manager,rasafa,legacy]};
}

test('Governorates local follow-ups accept Karkh or Sales Manager owners and retain existing work',async()=>{
 const fixture=governorateFollowUpFixture();
 for(const owner of [actor,fixture.manager]){
  const x=setup({projects:[fixture.project],indoorSales:fixture.indoorSales,queue:[fixture.unrelated],openings:[{id:'saved-opening',projectId,width:120}]});
  const before=structuredClone(x.state);
  await x.client.saveFieldChange('follow-up',projectId,{...fixture.values,followUpOwnerId:owner.id});
  assert.deepEqual(x.state.queue[0],before.queue[0]);
  assert.equal(x.state.queue.length,2);
  assert.equal(x.state.queue[1].payload.followUpOwnerId,owner.id);
  assert.equal(x.state.projects[0].follow_up_owner_id,owner.id);
  assert.deepEqual(x.state.openings,before.openings);
 }
});

test('Governorates local saves reject Rasafa and metadata-free owners without changing the queue or project',async()=>{
 const fixture=governorateFollowUpFixture();
 for(const owner of [fixture.rasafa,fixture.legacy]){
  const x=setup({projects:[fixture.project],indoorSales:fixture.indoorSales,queue:[fixture.pending,fixture.unrelated]});
  const before=structuredClone(x.state);
  await assert.rejects(x.client.saveFieldChange('follow-up',projectId,{...fixture.values,followUpOwnerId:owner.id}),/branch|Indoor Sales|follow-up/i);
  assert.deepEqual(x.state,before);
 }
});

test('reviewed Governorates follow-ups validate owner corrections before changing operation IDs or conflict notes',async()=>{
 const fixture=governorateFollowUpFixture();
 const x=setup({projects:[fixture.project],indoorSales:fixture.indoorSales,queue:[fixture.pending,fixture.unrelated]});
 const before=structuredClone(x.state);
 for(const owner of [fixture.rasafa,fixture.legacy]){
  await assert.rejects(x.client.retryReviewedProject(projectId,'fresh-server-version',{changeId:fixture.pending.id,values:{...fixture.values,followUpOwnerId:owner.id}}),/branch|Indoor Sales|follow-up/i);
  assert.deepEqual(x.state,before);
 }
 await x.client.retryReviewedProject(projectId,'fresh-server-version',{changeId:fixture.pending.id,values:{...fixture.values,followUpOwnerId:fixture.manager.id}});
 assert.equal(x.state.queue.length,2);
 assert.notEqual(x.state.queue[0].id,fixture.pending.id);
 assert.equal(x.state.queue[0].payload.followUpOwnerId,fixture.manager.id);
 assert.deepEqual(x.state.queue[1],before.queue[1]);
 assert.equal(x.state.projects[0].serverUpdatedAt,'fresh-server-version');
 assert.equal(x.state.projects[0].follow_up_owner_id,fixture.manager.id);
});

test('online workspace reads upgrade a legacy owner directory before a Governorates follow-up is saved',async()=>{
 const fixture=governorateFollowUpFixture();
 const legacyDirectory=fixture.indoorSales.map(({id,name})=>({id,name}));
 const x=setup({projects:[fixture.project],indoorSales:legacyDirectory});
 await assert.rejects(x.client.saveFieldChange('follow-up',projectId,fixture.values),/branch|Indoor Sales employee/);
 assert.equal(x.state.queue.length,0);
 const before=structuredClone(x.state);
 window.location={pathname:'/projects'};
 navigator.onLine=true;
 let requests=0;
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,'/api/workspace');
  assert.equal(init?.method,undefined);
  requests++;
  return Response.json({actor:{...actor},projects:[fixture.project],indoorSales:fixture.indoorSales});
 };
 const response=await x.client.fieldFetch('/api/workspace');
 assert.equal(response.status,200);
 const workspace=await response.json();
 assert.deepEqual(x.state.indoorSales,fixture.indoorSales);
 assert.deepEqual(x.state.projects,before.projects);
 assert.deepEqual(x.state.queue,before.queue);
 const selected=workspace.indoorSales.find(employee=>employee.role==='Indoor Sales'&&employee.branch==='Karkh');
 assert.equal(selected.id,actor.id);
 navigator.onLine=false;
 await x.client.saveFieldChange('follow-up',projectId,{...fixture.values,followUpOwnerId:selected.id});
 assert.equal(x.state.queue.length,1);
 assert.equal(x.state.queue[0].payload.followUpOwnerId,selected.id);
 assert.equal(x.state.projects[0].follow_up_owner_id,selected.id);
 assert.equal(requests,1,'The refreshed cached directory supports the local save without another network request');
});


test('restricted employees cannot queue CRM updates or readiness changes on a cached device',async()=>{
 const originalRole=actor.role;
 try {
  for(const role of ['Outdoor Sales','HR']) {
   actor.role=role;
   const x=setup({actor:role==='Outdoor Sales'?outdoorActorForCurrentBranch('Karkh'):actor});
   await x.client.saveFieldChange('register',projectId,payload);
   const before=x.state.queue.length;
   for(const action of ['follow-up','ready','assign-measurements'])await assert.rejects(x.client.saveFieldChange(action,projectId,{}),/CRM access is limited/);
   assert.equal(x.state.queue.length,before);
  }
 }finally{actor.role=originalRole;}
});

test('CRM assignment preserves creator and saved measurements, and hands a ready site to the selected employee',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,structureReadiness:'not_ready'}});
 x.state.outdoorSales.push({id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Second outdoor employee',branch:'Karkh'});
 await x.client.saveFieldChange('ready',projectId,{assignedOutdoorSalesId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'});
 const p=x.state.projects[0];assert.equal(p.structure_readiness,'ready');assert.equal(p.assignedOutdoorSales,'Second outdoor employee');assert.equal(p.created_by,actor.id);assert.equal(p.measurement_assignment_id,x.state.queue.at(-1).id);
 await x.client.saveFieldChange('opening',projectId,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'});
 await x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:payload.project.assignedOutdoorSalesId});
 assert.equal(x.state.projects[0].assignedOutdoorSales,'Outdoor employee');assert.equal(x.state.openings.length,1);assert.equal(x.state.queue.at(-1).payload.assignedOutdoorSalesId,payload.project.assignedOutdoorSalesId);
 await x.client.saveFieldChange('finish',projectId,{});
 await assert.rejects(x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:payload.project.assignedOutdoorSalesId}),/before measurements are completed/);
});
test('CRM assignment rejects missing employees without changing local project or queue',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);const before=structuredClone(x.state);
 await assert.rejects(x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),/project branch/);
 assert.deepEqual(x.state,before);
});

test('offline registration retains the assigned branch and rejects an unassigned employee',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 assert.equal(x.state.projects[0].branch,'Karkh');
 assert.equal(x.state.projects[0].location_latitude,33.3);assert.equal(x.state.projects[0].location_longitude,44.4);
 const unassigned=setup({actor:{...actor,branch:null}});
 await assert.rejects(unassigned.client.saveFieldChange('register',projectId,payload),/branch/);
 assert.equal(unassigned.state.queue.length,0);
});

test('Indoor Sales can register for their own measurements and save openings offline',async()=>{
 const x=setup({outdoorSales:[]});
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:actor.id}});
 assert.equal(x.state.projects[0].assigned_outdoor_sales_id,actor.id);
 assert.equal(x.state.projects[0].assignedOutdoorSales,actor.name);
 assert.equal(x.state.projects[0].assignedToYou,true);
 assert.equal(x.state.projects[0].branch,'Karkh');
 await x.client.saveFieldChange('opening',projectId,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'});
 await x.client.saveFieldChange('finish',projectId,{});
 assert.deepEqual(x.state.queue.map(c=>c.action),['register','opening','finish']);
 assert.equal(x.state.projects[0].sales_status,'ready_for_quotation');
});
test('not-ready self-assigned projects keep the Indoor Sales creator when marked ready',async()=>{
 const x=setup({outdoorSales:[]});
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,structureReadiness:'not_ready',assignedOutdoorSalesId:actor.id}});
 await x.client.saveFieldChange('ready',projectId,{});
 assert.equal(x.state.projects[0].structure_readiness,'ready');
 assert.equal(x.state.projects[0].assigned_outdoor_sales_id,actor.id);
});
test('offline registration cannot assign another Indoor Sales employee',async()=>{
 const other={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Other indoor'};
 const x=setup({indoorSales:[actor,other]});
 await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:other.id}}),/project branch/);
 assert.equal(x.state.queue.length,0);
});


test('an empty synchronization queue makes no session or write requests',async()=>{
 const x=setup();navigator.onLine=true;
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network request');};
 await x.client.syncFieldChanges();
 assert.equal(calls,0);assert.equal(x.active,actor.id);
});

test('Outdoor Sales cannot save a not-ready project locally without a note; the saved reason survives follow-up changes',async()=>{
 const x=setup({actor:outdoorActorForCurrentBranch('Karkh')});
 const notReady={...payload,project:{...payload.project,structureReadiness:'not_ready'}};
 for(const readinessNote of [undefined,' \n\t ',23,'x'.repeat(2001)]){
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...notReady,project:{...notReady.project,readinessNote}}),/note/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 await x.client.saveFieldChange('register',projectId,{...notReady,project:{...notReady.project,readinessNote:'  Plastering unfinished  '}});
 assert.equal(x.state.projects[0].readiness_note,'Plastering unfinished');
 assert.equal((await (await x.client.fieldFetch('/api/workspace')).json()).projects[0].readiness_note,'Plastering unfinished');
 // Later CRM contact notes must not replace the original site-readiness reason.
 x.state.actor.role='Indoor Sales';x.state.actor.branch='Karkh';
 await x.client.saveFieldChange('follow-up',projectId,{nextFollowUp:'2026-11-08T07:00:00Z',note:'Called client',followUpType:'call',followUpOwnerId:actor.id});
 assert.equal(x.state.projects[0].readiness_note,'Plastering unfinished');
 assert.equal(x.state.projects[0].project_notes,'Called client');
});

test('the device workspace reads its snapshot immediately without a second network request',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 x.state.queue=[];navigator.onLine=true;window.location={pathname:'/offline'};
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Network must not block saved reads');};
 const result=await (await x.client.fieldFetch('/api/workspace')).json();
 assert.equal(result.projects[0].id,projectId);
 const measurement=await (await x.client.fieldFetch('/api/initial-measurements/'+projectId)).json();
 assert.equal(measurement.project.id,projectId);assert.equal(calls,0);
});

test('normal online pages still verify their data through the authenticated API',async()=>{
 const x=setup();navigator.onLine=true;window.location={pathname:'/dashboard'};
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Sign in required'},{status:401});};
 assert.equal((await x.client.fieldFetch('/api/workspace')).status,401);assert.equal(calls,1);
});

test('temporary server failures preserve the device workspace but revoked accounts stop access',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);navigator.onLine=true;
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 assert.equal((await x.client.prepareOffline()).queue.length,1);assert.equal(x.active,actor.id);
 globalThis.fetch=async()=>new Response('Unauthorized',{status:401});
 await assert.rejects(x.client.prepareOffline(),/active sales account/);assert.equal(x.active,null);assert.equal(x.state.queue.length,1);
});

test('a device registration returns after durable save while synchronization is still waiting',async()=>{
 const x=setup();navigator.onLine=true;window.location={pathname:'/offline'};
 let release;globalThis.fetch=()=>new Promise(resolve=>{release=()=>resolve(Response.json({actor:{id:'other-account'}}));});
 const response=await x.client.fieldFetch('/api/sales-intake',{method:'POST',body:JSON.stringify(payload)});
 assert.equal(response.status,201);assert.equal((await response.json()).pending,true);assert.equal(x.state.queue.length,1);
 release();await x.client.syncFieldChanges();assert.equal(x.state.queue.length,1);
});

test('cancelling an online read does not mark the device disconnected or return stale data',async()=>{
 const x=setup();navigator.onLine=true;window.location={pathname:'/dashboard'};
 const controller=new AbortController();controller.abort();
 globalThis.fetch=async(url,init)=>{assert.equal(init.signal.aborted,true);throw new DOMException('Aborted','AbortError');};
 await assert.rejects(x.client.fieldFetch('/api/workspace',{signal:controller.signal}),{name:'AbortError'});
 assert.equal(x.client.isFieldOnline(),true);
});

const delayProject={id:projectId,branch:'Karkh',project_number:'PRJ-DELAY',project_name:'Delayed visit',created_by:'creator',assigned_outdoor_sales_id:actor.id,structure_readiness:'ready',sales_status:'new_lead',updated_at:'2026-10-18T00:00:00Z'};
const delayOpening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',projectId,createdBy:actor.id,floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
test('offline client delay returns to CRM and preserves measurements',async()=>{
 const outdoor={...actor,role:'Outdoor Sales'};
 const x=setup({actor:outdoor,projects:[delayProject],openings:[delayOpening]});
 for(const note of [undefined,'  ',5,'x'.repeat(2001)])await assert.rejects(x.client.saveFieldChange('delay-measurements',projectId,{note}));
 assert.equal(x.state.queue.length,0);
 await x.client.saveFieldChange('delay-measurements',projectId,{note:'  Client asked for next week  '});
 assert.equal(x.state.projects[0].measurement_delayed,true);assert.equal(x.state.projects[0].measurement_delay_note,'Client asked for next week');
 assert.equal(x.state.projects[0].measurement_delayed_by,actor.id);assert.equal(x.state.projects[0].assigned_outdoor_sales_id,actor.id);
 for(const action of ['opening','finish','reopen'])await assert.rejects(x.client.saveFieldChange(action,projectId,delayOpening),/Resume measurements/);
 const view=await (await x.client.fieldFetch('/api/initial-measurements/'+projectId)).json();
 assert.equal(view.canDelayMeasurements,true);assert.equal(view.canResumeMeasurements,false);assert.equal(view.openings.length,1);
 await assert.rejects(x.client.saveFieldChange('resume-measurements',projectId,{}));
 assert.deepEqual(x.state.queue.map(c=>c.action),['delay-measurements']);
 assert.equal(x.state.openings.length,1);
});
test('client delay is restricted to the assigned Outdoor employee and the measurement stage',async()=>{
 for(const options of [{actor},{actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,assigned_outdoor_sales_id:'another'}]},{actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,sales_status:'ready_for_quotation'}]}]){
  const x=setup({projects:[delayProject],...options});
  await assert.rejects(x.client.saveFieldChange('delay-measurements',projectId,{note:'Visit later'}));assert.equal(x.state.queue.length,0);
 }
});
test('delayed visits leave Outdoor tasks and link back to CRM',()=>{
 const stages=load('../src/lib/workflow/stages.ts');
 const tasks=load('../src/lib/workflow/salesTasks.ts',{'./stages':stages});
 const project={...delayProject,measurement_delayed:true};
 assert.equal(stages.projectStage(project),'measurement-delayed');assert.equal(stages.needsSalesFollowUp(project),true);
 assert.equal(tasks.measurementTasks([project],{...actor,role:'Outdoor Sales'}).length,0);
 assert.equal(stages.projectLink(project,true),'/mini-crm#project-'+projectId);
});

test('CRM reassignment releases the delayed visit and retains the delay report',async()=>{
 const x=setup({projects:[{...delayProject,measurement_delayed:true,measurement_delay_note:'Client unavailable'}]});
 await x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:payload.project.assignedOutdoorSalesId});
 assert.equal(x.state.projects[0].measurement_delayed,false);assert.equal(x.state.projects[0].measurement_delay_note,'Client unavailable');
 assert.equal(x.state.projects[0].measurement_assignment_id,x.state.queue[0].id);
});
test('offline unsuccessful visits keep each outcome through CRM rescheduling',async()=>{
 const outdoor={...actor,role:'Outdoor Sales'};
 const x=setup({actor:outdoor,projects:[delayProject],openings:[delayOpening],outdoorSales:[{id:actor.id,name:actor.name,branch:actor.branch}]});
 await x.client.saveFieldChange('delay-measurements',projectId,{reason:'client_no_answer',note:'Site closed; client did not answer.'});
 const first=x.state.projects[0].measurement_attempts[0];
 assert.equal(first.reason,'client_no_answer');assert.equal(first.recordedById,actor.id);assert.equal(first.pending,true);
 x.state.actor={...actor};
 await x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:actor.id});
 x.state.actor=outdoor;
 await x.client.saveFieldChange('delay-measurements',projectId,{reason:'site_closed',note:'Site still closed at the agreed time.'});
 const data=await (await x.client.fieldFetch('/api/workspace')).json();
 assert.deepEqual(data.projects[0].measurement_attempts.map(entry=>entry.action),['delay-measurements','assign-measurements','delay-measurements']);
 assert.equal(data.projects[0].measurement_attempts[0].id,first.id);
 assert.equal(data.projects[0].measurement_delay_reason,'site_closed');
 assert.equal(data.projects[0].measurement_delayed,true);assert.equal(data.openings,undefined);assert.equal(x.state.openings.length,1);
});
test('past visitor project log remains readable but cannot expose or change measurements',async()=>{
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,assigned_outdoor_sales_id:'another',project_log_only:true}],openings:[delayOpening]});
 const workspace=await (await x.client.fieldFetch('/api/workspace')).json();
 assert.equal(workspace.projects.length,1);
 assert.equal((await x.client.fieldFetch('/api/initial-measurements/'+projectId)).status,403);
 for(const action of ['opening','edit-opening','finish','delay-measurements','cancel-project'])await assert.rejects(x.client.saveFieldChange(action,projectId,{}),/reference only/);
 assert.equal(x.state.queue.length,0);assert.equal(x.state.openings.length,1);
});
test('offline cancellation closes active work without removing project or measurements',async()=>{
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[delayProject],openings:[delayOpening]});
 await assert.rejects(x.client.saveFieldChange('cancel-project',projectId,{note:'Client cancelled'}));
 await x.client.saveFieldChange('cancel-project',projectId,{note:'Client no longer needs this project',confirmed:true});
 assert.equal(x.state.projects.length,1);assert.equal(x.state.projects[0].sales_status,'cancelled');assert.equal(x.state.openings.length,1);
 assert.equal(x.state.projects[0].client_cancelled_by,actor.id);assert.equal(x.state.projects[0].next_follow_up_at,null);
 for(const action of ['opening','finish','reopen','delay-measurements','resume-measurements'])await assert.rejects(x.client.saveFieldChange(action,projectId,delayOpening));
 const stages=load('../src/lib/workflow/stages.ts');assert.equal(stages.projectStage(x.state.projects[0]),'client-cancelled');assert.equal(stages.needsSalesFollowUp(x.state.projects[0]),false);
});

test('skylight captures survive metadata refreshes and remain isolated to the matching project',async()=>{
 const skylight={photo:'data:image/jpeg;base64,/9j/AAAA',drawing:'data:image/png;base64,iVBORw0KGgoAAAA=',sections:[{label:'A',width:200,length:600}]};
 const opening={...delayOpening,structuralType:'Skylight',openingType:null,skylight};
 const x=setup({projects:[delayProject],openings:[opening]});
 const remote={...opening,skylight:undefined,hasSkylightCapture:true};
 navigator.onLine=true;globalThis.fetch=async()=>Response.json({...x.state,openings:[remote]});
 await x.client.prepareOffline();assert.deepEqual(x.state.openings[0].skylight,skylight);
 globalThis.fetch=async()=>Response.json({project:delayProject,openings:[remote]});
 await x.client.fieldFetch('/api/initial-measurements/'+projectId);assert.deepEqual(x.state.openings[0].skylight,skylight);
 assert.equal(x.client.retainSkylightCapture({...remote,projectId:'other'},[opening]).skylight,undefined);
 assert.equal(x.client.retainSkylightCapture({...remote,hasSkylightCapture:false},[opening]).skylight,undefined);
 globalThis.fetch=async()=>Response.json({...x.state,projects:[],openings:[]});
 await x.client.prepareOffline();assert.equal(x.state.openings.length,0);
});

test('known internet outage uses cached reads until automatic reconnection succeeds',async()=>{
 const x=setup({projects:[delayProject],openings:[delayOpening]});navigator.onLine=true;
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Internet unavailable despite Wi-Fi');};
 const first=await (await x.client.fieldFetch('/api/initial-measurements/'+projectId)).json();assert.equal(first.openings.length,1);assert.equal(x.client.isFieldOnline(),false);
 await x.client.fieldFetch('/api/initial-measurements/'+projectId);assert.equal(calls,1,'Known outages must not stall each read');
 globalThis.fetch=async()=>{calls++;return Response.json(x.state);};
 await x.client.prepareOffline();assert.equal(x.client.isFieldOnline(),true);
 await x.client.fieldFetch('/api/workspace');assert.equal(calls,3,'Server reads resume after reconnection');
});

test('Outdoor Sales must choose a building type before queueing a new project',async()=>{
 for(const buildingType of [undefined,null,'','wrong',3]){
  const x=setup({actor:outdoorActorForCurrentBranch('Karkh')});
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,buildingType}}),/building type/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 for(const buildingType of ['commercial_building','residential_building','villa_house']){
  const x=setup({actor:outdoorActorForCurrentBranch('Karkh')});
  await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,buildingType}});
  assert.equal(x.state.projects[0].building_type,buildingType);assert.equal(x.state.queue[0].payload.project.buildingType,buildingType);
  assert.equal((await (await x.client.fieldFetch('/api/workspace')).json()).projects[0].building_type,buildingType);
 }
});

for(const assigned of [undefined,null,'another'])test(`offline creator cannot report visit outcomes without their assignment (${assigned})`,async()=>{
 const project={...delayProject,created_by:actor.id,assigned_outdoor_sales_id:assigned};
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[project],openings:[delayOpening]});
 const before=structuredClone(x.state);
 const view=await (await x.client.fieldFetch('/api/initial-measurements/'+projectId)).json();
 assert.equal(view.canDelayMeasurements,false);assert.equal(view.canCancelProject,false);
 for(const action of ['delay-measurements','cancel-project']){
  await assert.rejects(x.client.saveFieldChange(action,projectId,{note:'Client request',confirmed:true}));
 }
 assert.deepEqual(x.state,before);
});

test('Outdoor edits preserve opening identity and media, queue in order, and reject stale drafts',async()=>{
 const skylight={drawing:'data:image/png;base64,iVBORw0KGgoAAAA=',sections:[{label:'A',width:100,length:200}]};
 const previous={...delayOpening,structuralType:'Skylight',openingType:null,quantity:2,skylight,hasSkylightCapture:true};
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[delayProject],openings:[previous]});
 const opening={...previous,width:180,height:250,quantity:4,floor:'First'};
 await x.client.saveFieldChange('edit-opening',projectId,{opening,previous});
 assert.equal(x.state.openings.length,1);assert.equal(x.state.openings[0].id,previous.id);
 assert.equal(x.state.openings[0].width,180);assert.equal(x.state.openings[0].quantity,4);assert.deepEqual(x.state.openings[0].skylight,skylight);
 assert.equal(x.state.queue[0].payload.opening.skylight,undefined);
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{opening:{...opening,width:199},previous}),/changed on another device/);
 await x.client.saveFieldChange('edit-opening',projectId,{opening:{...opening,width:190},previous:opening});
 assert.deepEqual(x.state.queue.map(c=>c.action),['edit-opening','edit-opening']);
 assert.equal(x.state.queue[1].payload.previous.width,180);
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{opening:{...opening,structuralType:'Window',openingType:'Sliding'},previous:{...opening,width:190}}),/skylight/);
});
test('offline editing requires a current editable project and an opening belonging to it',async()=>{
 for(const patch of [{sales_status:'ready_for_quotation'},{sales_status:'quotation_in_progress'},{sales_status:'cancelled'},{measurement_delayed:true},{structure_readiness:'not_ready'},{created_by:'other',assigned_outdoor_sales_id:'other'}]){
  const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,...patch}],openings:[delayOpening]});
  await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{opening:{...delayOpening,width:200},previous:delayOpening}));
  assert.equal(x.state.queue.length,0);assert.equal(x.state.openings[0].width,120);
 }
 const x=setup({projects:[delayProject],openings:[{...delayOpening,projectId:'another-project'}]});
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{opening:{...delayOpening,width:200},previous:delayOpening}),/not found/);
});
test('a newly saved offline opening can be edited before its first synchronization',async()=>{
 const x=setup({projects:[delayProject]});
 await x.client.saveFieldChange('opening',projectId,delayOpening);
 await x.client.saveFieldChange('edit-opening',projectId,{previous:delayOpening,opening:{...delayOpening,width:199,quantity:3}});
 assert.deepEqual(x.state.queue.map(c=>c.action),['opening','edit-opening']);assert.equal(x.state.openings.length,1);assert.equal(x.state.openings[0].width,199);
 navigator.onLine=true;const posted=[];
 globalThis.fetch=async(url,init)=>{if(!init?.method)return Response.json({actor});const change=JSON.parse(init.body);posted.push(change);return Response.json({project:delayProject});};
 await x.client.syncFieldChanges();assert.deepEqual(posted.map(c=>c.action),['opening','edit-opening']);assert.equal(x.state.queue.length,0);
});

test('CRM can queue additional openings while retaining original measurements and requiring a new opening',async()=>{
 const original={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',projectId,floor:'GF',room:'Kitchen',width:120,height:150,quantity:2,structuralType:'Window',openingType:'Sliding'};
 const project={...delayProject,created_by:actor.id,sales_status:'quotation_in_progress',measurement_delayed:false};
 const x=setup({projects:[project],openings:[original],outdoorSales:[{id:actor.id,name:actor.name,branch:actor.branch}]});
 await x.client.saveFieldChange('request-openings',projectId,{assignedOutdoorSalesId:actor.id});
 assert.equal(x.state.projects[0].sales_status,'new_lead');
 assert.equal(x.state.projects[0].additional_openings_state,'requested');
 assert.deepEqual(x.state.projects[0].additional_openings_original_ids,[original.id]);
 assert.deepEqual(x.state.openings,[original]);
 await assert.rejects(x.client.saveFieldChange('finish',projectId,{}),/at least one new opening/);
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{opening:{...original,width:999},previous:original}),/Existing measurements are preserved/);
 const added={...original,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',width:200};
 await x.client.saveFieldChange('opening',projectId,added);
 await x.client.saveFieldChange('edit-opening',projectId,{opening:{...added,width:210},previous:added});
 await x.client.saveFieldChange('finish',projectId,{});
 assert.equal(x.state.projects[0].additional_openings_state,'submitted');
 assert.equal(x.state.projects[0].sales_status,'ready_for_quotation');
 assert.deepEqual(x.state.openings[0],original);
 await assert.rejects(x.client.saveFieldChange('reopen',projectId,{}),/Ask Indoor Sales/);
});
test('additional opening tasks reject Outdoor requests, unassigned creators and closed stages',async()=>{
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,created_by:actor.id,assigned_outdoor_sales_id:'another',additional_openings_state:'requested',additional_openings_original_ids:[]}]});
 await assert.rejects(x.client.saveFieldChange('request-openings',projectId,{assignedOutdoorSalesId:actor.id}),/CRM access is limited/);
 await assert.rejects(x.client.saveFieldChange('opening',projectId,{}),/Only the assigned employee/);
 for(const sales_status of ['new_lead','contract_signed','transferred_to_operations','cancelled']){
  const y=setup({projects:[{...delayProject,sales_status}]});
  await assert.rejects(y.client.saveFieldChange('request-openings',projectId,{assignedOutdoorSalesId:actor.id}),/before signing/);
 }
});

test('completion notes and photos save with the offline finish and survive metadata synchronization',async()=>{
 const x=setup({projects:[delayProject],openings:[delayOpening]});
 const photo='data:image/jpeg;base64,/9j/AAAA';
 await assert.rejects(x.client.saveFieldChange('finish',projectId,{photo:'invalid'}),/photo/);
 assert.equal(x.state.queue.length,0);assert.equal(x.state.projects[0].sales_status,'new_lead');
 await x.client.saveFieldChange('finish',projectId,{note:'  Site note  ',photo});
 assert.equal(x.state.projects[0].sales_status,'ready_for_quotation');
 assert.deepEqual(x.state.queue[0].payload,{note:'Site note',photo});
 const report=x.state.measurementReports[0];assert.equal(report.id,x.state.queue[0].id);assert.equal(report.note,'Site note');assert.equal(report.photo,photo);
 navigator.onLine=true;
 globalThis.fetch=async()=>Response.json({...x.state,projects:[],measurementReports:[]});
 await x.client.prepareOffline();assert.equal(x.state.measurementReports[0].photo,photo,'Pending report must survive refresh');
 x.state.queue=[];
 globalThis.fetch=async()=>Response.json({...x.state,measurementReports:[{...report,photo:undefined}]});
 await x.client.prepareOffline();assert.equal(x.state.measurementReports[0].photo,photo,'Synced metadata must retain downloaded photo');
 globalThis.fetch=async()=>Response.json({...x.state,projects:[],measurementReports:[]});
 await x.client.prepareOffline();assert.equal(x.state.measurementReports.length,0,'Deleted or inaccessible projects must not retain reports');
});

test('keeping the reviewed server version drops a discarded completion report with its queued finish',async()=>{
 const x=setup({projects:[delayProject],openings:[delayOpening]});
 await x.client.saveFieldChange('finish',projectId,{note:'Unsent note'});
 assert.equal(x.state.measurementReports.length,1);
 await x.client.keepReviewedServerVersion({project:delayProject,openings:[delayOpening],measurementReports:[]});
 assert.equal(x.state.queue.length,0);assert.equal(x.state.measurementReports.length,0);assert.equal(x.state.projects[0].sales_status,'new_lead');
});

test('curtainWall captures survive metadata refreshes and remain isolated to the matching project',async()=>{
 const curtainWall={photo:'data:image/jpeg;base64,/9j/AAAA',note:'Review anchors'};
 const opening={...delayOpening,structuralType:'Curtain Wall',openingType:null,curtainWall};
 const x=setup({projects:[delayProject],openings:[opening]});
 const remote={...opening,curtainWall:undefined,hasCurtainWallCapture:true};
 navigator.onLine=true;globalThis.fetch=async()=>Response.json({...x.state,openings:[remote]});
 await x.client.prepareOffline();assert.deepEqual(x.state.openings[0].curtainWall,curtainWall);
 globalThis.fetch=async()=>Response.json({project:delayProject,openings:[remote]});
 await x.client.fieldFetch('/api/initial-measurements/'+projectId);assert.deepEqual(x.state.openings[0].curtainWall,curtainWall);
 assert.equal(x.client.retainSkylightCapture({...remote,projectId:'other'},[opening]).curtainWall,undefined);
 assert.equal(x.client.retainSkylightCapture({...remote,hasCurtainWallCapture:false},[opening]).curtainWall,undefined);
 globalThis.fetch=async()=>Response.json({...x.state,projects:[],openings:[]});
 await x.client.prepareOffline();assert.equal(x.state.openings.length,0);
});

test('offline Curtain Wall edits preserve capture and reject changing its type',async()=>{
 const curtainWall={note:'Review anchors',photo:'data:image/jpeg;base64,/9j/AAAA'};
 const previous={...delayOpening,structuralType:'Curtain Wall',openingType:null,curtainWall};
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[delayProject],openings:[previous]});
 await x.client.saveFieldChange('edit-opening',projectId,{previous,opening:{...previous,width:700}});
 assert.equal(x.state.openings[0].width,700);assert.deepEqual(x.state.openings[0].curtainWall,curtainWall);
 assert.equal(x.state.queue[0].payload.opening.curtainWall,undefined);
 const current=x.state.openings[0];
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{previous:current,opening:{...current,structuralType:'Window',openingType:'Sliding'}}),/must remain attached/);
});

test('commercial facade can become internal work offline without retaining its facade number',async()=>{
 const previous={...delayOpening,workArea:'facade',facadeNumber:1,room:'Other',otherRoom:'Facade 1'};
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,building_type:'commercial_building'}],openings:[previous]});
 await x.client.saveFieldChange('edit-opening',projectId,{previous,opening:{...previous,workArea:'internal',facadeNumber:undefined,room:'Office',otherRoom:''}});
 assert.equal(x.state.openings[0].workArea,'internal');assert.equal(x.state.openings[0].facadeNumber,undefined);assert.equal(x.state.openings[0].room,'Office');
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{previous,opening:{...previous,width:300}}),/changed on another device/);
 const current=x.state.openings[0];
 await x.client.saveFieldChange('edit-opening',projectId,{previous:current,opening:{...current,workArea:'facade',facadeNumber:3}});
 assert.equal(x.state.openings[0].otherRoom,'Facade 3');assert.equal(x.state.queue.at(-1).payload.opening.facadeNumber,3);
});
test('residential projects reject commercial work-area metadata offline',async()=>{
 for(const building_type of ['residential_building','villa_house',null]){
  const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[{...delayProject,building_type}],openings:[delayOpening]});
  const opening={...delayOpening,workArea:'facade',facadeNumber:1};
  await assert.rejects(x.client.saveFieldChange('opening',projectId,opening),/only available for commercial buildings/);
  await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{previous:delayOpening,opening}),/only available for commercial buildings/);
  assert.equal(x.state.queue.length,0);
 }
});

test('roller shutter checkboxes can be changed offline and stale edits cannot remove a new request',async()=>{
 const previous={...delayOpening,structuralType:'Window',openingType:'Sliding',hasRollerShutter:true};
 const x=setup({actor:{...actor,role:'Outdoor Sales'},projects:[delayProject],openings:[previous]});
 await x.client.saveFieldChange('edit-opening',projectId,{previous,opening:{...previous,hasRollerShutter:false}});
 assert.equal(x.state.openings[0].hasRollerShutter,false);assert.equal(x.state.queue[0].payload.opening.hasRollerShutter,false);
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{previous,opening:{...previous,width:200}}),/changed on another device/);
 const latest=x.state.openings[0];
 await x.client.saveFieldChange('edit-opening',projectId,{previous:latest,opening:{...latest,hasRollerShutter:true}});
 assert.equal(x.state.openings[0].hasRollerShutter,true);
 await assert.rejects(x.client.saveFieldChange('edit-opening',projectId,{previous:x.state.openings[0],opening:{...latest,structuralType:'Door',hasRollerShutter:true}}),/Complete the opening/);
});

test('online phone registration returns after durable save while synchronization is slow',async()=>{
 const x=setup();navigator.onLine=true;window.location={pathname:'/intake'};
 let release;
 const session=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async(url,init)=>!init?.method?session:Response.json({project:{id:x.state.projects[0].id,project_number:'PRJ-SYNCED',updated_at:new Date().toISOString()}});
 try{
  const response=await Promise.race([
   x.client.fieldFetch('/api/sales-intake',{method:'POST',body:JSON.stringify({...payload,registrationActorId:actor.id})}),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Registration waited for network sync')),500)),
  ]);
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.pending,true);assert.equal(x.state.queue.length,1);
  assert.equal(x.state.projects[0].id,result.projectId);
  release(Response.json({actor}));await x.client.syncFieldChanges();
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects[0].project_number,'PRJ-SYNCED');
 }finally{release(Response.json({actor}));await x.client.syncFieldChanges();}
});

test('registration never writes into a different employee snapshot',async()=>{
 const x=setup();
 const response=await x.client.fieldFetch('/api/sales-intake',{method:'POST',body:JSON.stringify({...payload,registrationActorId:'another-account'})});
 assert.equal(response.status,400);assert.match((await response.json()).error,/employee who opened/);
 assert.equal(x.state.projects.length,0);assert.equal(x.state.queue.length,0);
});

test('confirmed server deletion archives all saved project work and stops retries without affecting other projects',async()=>{
 const other='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const opening={id:'capture',projectId,skylight:{photo:'saved-photo'}};
 const report={id:'report',project_id:projectId,note:'Saved report',photo:'saved-photo'};
 const x=setup({projects:[{id:projectId,branch:'Karkh',project_name:'Deleted project',sales_status:'cancelled'},{id:other,branch:'Karkh',project_name:'Active project'}],openings:[opening],measurementReports:[report],queue:[
  {id:'cancel',projectId,action:'cancel-project',payload:{note:'Client cancelled',confirmed:true},userId:actor.id},
  {id:'later',projectId,action:'opening',payload:{note:'Saved opening'},userId:actor.id},
  {id:'unrelated',projectId:other,action:'follow-up',payload:{note:'Unrelated saved note'},userId:actor.id},
 ]});
 navigator.onLine=true;const posts=[];
 globalThis.fetch=async(url,init)=>{
  if(!init?.method)return Response.json({actor});
  const change=JSON.parse(init.body);posts.push(change.id);
  return change.projectId===projectId?Response.json({code:'project_deleted',error:'Deleted by Admin'},{status:410}):Response.json({error:'Other conflict'},{status:409});
 };
 await x.client.syncFieldChanges();
 assert.deepEqual(posts,['cancel','unrelated']);
 assert.deepEqual(x.state.queue.map(c=>c.id),['unrelated']);
 assert.deepEqual(x.state.projects.map(p=>p.id),[other]);
 const archive=x.state.archivedProjects[0];
 assert.equal(archive.project.project_name,'Deleted project');
 assert.deepEqual(archive.changes.map(c=>c.payload.note),['Client cancelled','Saved opening']);
 assert.deepEqual(archive.openings,[opening]);assert.deepEqual(archive.measurementReports,[report]);
 await x.client.syncFieldChanges();assert.deepEqual(posts,['cancel','unrelated','unrelated']);
 // Normal snapshot refresh must retain the archived device-only work.
 globalThis.fetch=async()=>Response.json({actor,projects:[],openings:[],queue:[]});
 await x.client.prepareOffline();assert.deepEqual(x.state.archivedProjects,[archive]);
});

test('unconfirmed missing-project errors never archive or discard saved work',async()=>{
 for(const response of [{status:410,error:'Not found'},{status:409,code:'project_deleted',error:'Conflict'},{status:409,error:'Project is not available to this employee'}]){
  const x=setup();await x.client.saveFieldChange('register',projectId,payload);
  navigator.onLine=true;
  globalThis.fetch=async(url,init)=>!init?.method?Response.json({actor}):Response.json(response,{status:response.status});
  await x.client.syncFieldChanges();assert.equal(x.state.queue.length,1);assert.equal(x.state.projects.length,1);assert.equal(x.state.archivedProjects,undefined);
 }
});

test('Outdoor Sales must choose a project branch and it survives local reads and synchronization',async()=>{
 for(const branch of [undefined,null,'','wrong',3]){
  const x=setup({actor:{...actor,role:'Outdoor Sales',branch:null}});
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch}}),/project branch/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 for(const branch of ['Karkh','Rasafa','Najaf']){
  const outdoor=outdoorActorForCurrentBranch(branch);const x=setup({actor:outdoor});
  await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch}});
  assert.equal(x.state.projects[0].branch,branch);assert.equal(x.state.queue[0].payload.project.branch,branch);
  assert.equal((await (await x.client.fieldFetch('/api/workspace')).json()).projects[0].branch,branch);
  navigator.onLine=true;
  globalThis.fetch=async(url,init)=>{
   if(!init?.method)return Response.json({actor:outdoor});
   assert.equal(JSON.parse(init.body).payload.project.branch,branch);
   return Response.json({project:{...x.state.projects[0],branch,project_number:'PRJ-1',updated_at:new Date().toISOString()}});
  };
  await x.client.syncFieldChanges();assert.equal(x.state.queue.length,0);assert.equal(x.state.projects[0].branch,branch);assert.equal(x.state.actor.branch,branch);
 }
});

test('shared governorate registrations validate before saving and survive offline reads and synchronization',async()=>{
 const outdoor={...actor,role:'Outdoor Sales',branch:'Karkh'};
 for(const governorate of [undefined,null,'','النجف','بغداد',{},['البصرة']]){
  const x=setup({actor:outdoor});
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch:'Governorates',governorate}}),/governorate/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 const x=setup({actor:outdoor});
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch:'Governorates',governorate:'البصرة'}});
 assert.equal(x.state.projects[0].branch,'Governorates');assert.equal(x.state.projects[0].governorate,'البصرة');
 assert.equal(x.state.queue[0].payload.project.governorate,'البصرة');
 const local=(await (await x.client.fieldFetch('/api/workspace')).json()).projects[0];assert.equal(local.governorate,'البصرة');
 navigator.onLine=true;
 globalThis.fetch=async(url,init)=>{
  if(!init?.method)return Response.json({actor:outdoor});
  assert.equal(JSON.parse(init.body).payload.project.governorate,'البصرة');
  return Response.json({project:{...x.state.projects[0],project_number:'PRJ-GOV',updated_at:new Date().toISOString()}});
 };
 await x.client.syncFieldChanges();assert.equal(x.state.queue.length,0);assert.equal(x.state.projects[0].governorate,'البصرة');assert.equal(x.state.actor.branch,'Karkh');
});

test('Outdoor Sales cannot queue another office and denied registrations leave saved work intact',async()=>{
 for(const allowed of ['Karkh','Rasafa','Najaf']){
  const x=setup({actor:outdoorActorForCurrentBranch(allowed)});
  await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch:allowed}});
  const before=structuredClone(x.state);
  const otherBranch=allowed==='Karkh'?'Rasafa':'Karkh';
  await assert.rejects(x.client.saveFieldChange('register','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',{...payload,project:{...payload.project,branch:otherBranch}}),/project from your branch/);
  assert.deepEqual(x.state,before);
 }
});

test('an Outdoor employee without an office cannot queue a project in any branch',async()=>{
 const x=setup({actor:{...actor,role:'Outdoor Sales',branch:null,outdoorRotationStartBranch:'Karkh'}});
 for(const branch of ['Karkh','Rasafa','Najaf','Governorates']){
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch,governorate:'النجف'}}),/project from your branch/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
});

test('a server access rejection preserves every queued change and retries the same operation after access is restored',async()=>{
 const outdoor=outdoorActorForCurrentBranch('Karkh');
 const x=setup({actor:outdoor});
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,branch:'Karkh'}});
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 await x.client.saveFieldChange('opening',projectId,opening);
 const before=structuredClone(x.state),posted=[];
 const currentActor={...outdoor,outdoorRotationStartBranch:outdoor.outdoorRotationStartBranch==='Karkh'?'Rasafa':'Karkh'};
 let reject=true;
 navigator.onLine=true;
 globalThis.fetch=async(url,init)=>{
  if(!init?.method)return Response.json({actor:reject?currentActor:outdoor});
  const change=JSON.parse(init.body);posted.push(change);
  if(reject)return Response.json({error:'Choose a project from your branch.'},{status:409});
  return Response.json({project:{...x.state.projects[0],project_number:'PRJ-SYNCED',updated_at:new Date().toISOString()}});
 };
 await x.client.syncFieldChanges();
 assert.equal(posted.length,1,'A rejected registration holds later changes for the same project');
 assert.deepEqual(x.state.queue.map(change=>change.id),before.queue.map(change=>change.id));
 assert.deepEqual(x.state.queue.map(change=>change.payload),before.queue.map(change=>change.payload));
 assert.deepEqual(x.state.projects,before.projects);assert.deepEqual(x.state.openings,before.openings);
 assert.match(x.state.queue[0].error,/project from your branch/);
 assert.equal(x.state.actor.outdoorRotationStartBranch,currentActor.outdoorRotationStartBranch);
 reject=false;
 await x.client.syncFieldChanges();
 assert.deepEqual(posted.map(change=>change.id),[before.queue[0].id,before.queue[0].id,before.queue[1].id]);
 assert.equal(x.state.queue.length,0);assert.equal(x.state.openings[0].width,opening.width);
});

for(const openingState of ['not-yet-saved','queued','synced'])test(`a snapshot started before registration sync retains the new site with its first opening ${openingState}`,async()=>{
 const outdoor=outdoorActorForCurrentBranch('Karkh');
 const x=setup({actor:outdoor});window.location={pathname:'/offline'};
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:null}});
 const registered=structuredClone(x.state.projects[0]);
 const snapshot={...structuredClone(x.state),projects:[],openings:[],queue:[]};
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 let releaseSnapshot,startedSnapshot,posts=0,gets=0;
 const started=new Promise(resolve=>{startedSnapshot=resolve;});
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor:outdoor});
  if(init?.method==='POST')return Response.json({project:{...registered,project_number:'PRJ-NEW',updated_at:new Date(Date.parse(registered.updated_at)+ ++posts).toISOString()}});
  assert.equal(url,'/api/offline');
  if(++gets===1){startedSnapshot();return new Promise(resolve=>{releaseSnapshot=()=>resolve(Response.json(snapshot));});}
  return Response.json(snapshot);
 };
 navigator.onLine=true;
 const preparing=x.client.prepareOffline();await started;
 await x.client.syncFieldChanges();
 assert.equal(x.state.queue.length,0,'Registration has synchronized while its older snapshot is still in flight');
 if(openingState!=='not-yet-saved'){
  navigator.onLine=false;
  const response=await x.client.fieldFetch(`/api/initial-measurements/${projectId}`,{method:'POST',body:JSON.stringify(opening)});
  assert.equal(response.status,201);
  if(openingState==='synced'){navigator.onLine=true;await x.client.syncFieldChanges();assert.equal(x.state.queue.length,0);}
 }
 releaseSnapshot();await preparing;
 let response=await x.client.fieldFetch(`/api/initial-measurements/${projectId}`);
 assert.equal(response.status,200,'The stale snapshot must not remove or hide a project registered after its server read');
 if(openingState==='not-yet-saved'){
  navigator.onLine=false;
  response=await x.client.fieldFetch(`/api/initial-measurements/${projectId}`,{method:'POST',body:JSON.stringify(opening)});
  assert.equal(response.status,201,'The first opening remains writable after navigation and registration sync');
 }
 response=await x.client.fieldFetch(`/api/initial-measurements/${projectId}`);
 assert.equal(response.status,200);
 const saved=await response.json();
 assert.equal(saved.project.project_number,'PRJ-NEW');
 assert.equal(saved.openings.length,1);
 assert.equal(saved.openings[0].id,opening.id);
 assert.equal(x.state.unavailableProjectIds?.includes(projectId)??false,false);
 const retainedQueue=structuredClone(x.state.queue);
 // Protection lasts for the in-flight response only. A subsequent authoritative
 // absence still revokes access and retains any outstanding local changes.
 navigator.onLine=true;await x.client.prepareOffline();
 assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projectId}`)).status,404);
 assert.deepEqual(x.state.queue,retainedQueue);
});

test('a first opening synchronized during a snapshot is retained even when that snapshot already contains the project',async()=>{
 const outdoor=outdoorActorForCurrentBranch('Karkh');
 const site={id:projectId,created_by:outdoor.id,assigned_outdoor_sales_id:null,branch:'Karkh',structure_readiness:'ready',sales_status:'new_lead',project_name:'New site',project_number:'PRJ-NEW',created_at:'2026-11-08T08:00:00Z',updated_at:'2026-11-08T08:00:00Z'};
 const x=setup({actor:outdoor,projects:[site]});window.location={pathname:'/offline'};
 const snapshot=structuredClone(x.state);
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 let releaseSnapshot,startedSnapshot,gets=0;
 const started=new Promise(resolve=>{startedSnapshot=resolve;});
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor:outdoor});
  if(init?.method==='POST')return Response.json({project:{...site,updated_at:'2026-11-08T08:00:01Z'}});
  assert.equal(url,'/api/offline');
  if(++gets===1){startedSnapshot();return new Promise(resolve=>{releaseSnapshot=()=>resolve(Response.json(snapshot));});}
  return Response.json(snapshot);
 };
 navigator.onLine=true;const preparing=x.client.prepareOffline();await started;
 navigator.onLine=false;await x.client.saveFieldChange('opening',projectId,opening);
 navigator.onLine=true;await x.client.syncFieldChanges();
 assert.equal(x.state.queue.length,0);
 releaseSnapshot();await preparing;
 const response=await x.client.fieldFetch(`/api/initial-measurements/${projectId}`);
 assert.equal(response.status,200);
 assert.equal((await response.json()).openings[0]?.id,opening.id,'A stale empty opening list must not erase a just-synchronized first opening');
 // The next snapshot can remove a server-side-deleted opening once there is no
 // local change made during that request.
 await x.client.prepareOffline();
 assert.equal(x.state.openings.length,0);
});

function backgroundSnapshots(t){
 const previous=new Map(['window','navigator','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 t.after(()=>{for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
 let now=100000,active=actor.id,calls=0,failure=null;
 t.mock.method(Date,'now',()=>now);
 globalThis.window=new EventTarget();window.location={pathname:'/offline'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 const stateFor=id=>({actor:{...actor,id},projects:[{id:projectId,created_by:id,branch:'Karkh',assigned_outdoor_sales_id:id,structure_readiness:'ready',sales_status:'new_lead',project_name:id,project_number:'PRJ-1'}],openings:[],queue:[],syncedAt:null,outdoorSales:[],indoorSales:[]});
 const accounts=new Map([[actor.id,stateFor(actor.id)]]),remote=new Map([[actor.id,stateFor(actor.id)]]);
 const access=load('../src/lib/offline/projectAccess.ts');
 function accountEvent(id){const event=new Event('field-change');event.detail={source:'account',userId:id};window.dispatchEvent(event);}
 const store={
  activeFieldUser:()=>active,
  setFieldUser(id){const old=active;active=id;if(old!==id)accountEvent(id);},
  readStoredFieldState:async(id=active)=>structuredClone(accounts.get(id)??null),
  readFieldState:async(id=active)=>accounts.has(id)?access.visibleFieldState(structuredClone(accounts.get(id))):null,
  updateFieldState:async(id,change)=>{const state=change(structuredClone(accounts.get(id)??null));accounts.set(id,state);return access.visibleFieldState(structuredClone(state));},
 };
 globalThis.fetch=async url=>{
  assert.equal(url,'/api/offline');calls++;
  if(failure==='network')throw Error('Connection lost');
  if(failure==='server')return Response.json({error:'Temporarily unavailable'},{status:503});
  return Response.json(remote.get(active));
 };
 const client=load('../src/lib/offline/client.ts',{'./store':store,'./device':{isOfflineDevice:()=>true},'@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),'@/lib/workflow/stages':load('../src/lib/workflow/stages.ts'),'@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts')});
 return {client,store,accounts,remote,accountEvent,get calls(){return calls;},advance(ms){now+=ms;},fail(value){failure=value;},addAccount(id){accounts.set(id,stateFor(id));remote.set(id,stateFor(id));}};
}

test('background preparation shares a recent download while reading newly saved local work',async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});assert.equal(x.calls,1);
 x.advance(1000);
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',projectId,createdBy:actor.id,width:100,height:150};
 await x.store.updateFieldState(actor.id,state=>({...state,openings:[opening],queue:[{id:'local-opening',projectId,action:'opening',payload:opening}]}));
 const current=await x.client.prepareOffline({background:true});
 assert.equal(x.calls,1,'Routine focus/poll work must not download the full workspace again within a minute');
 assert.equal(current.openings[0].id,opening.id);
 assert.equal(current.queue[0].id,'local-opening','The freshness gate must return current storage, not the previous downloaded snapshot');
});

test('background preparation downloads again after one minute regardless of local writes and syncedAt',async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});
 x.advance(30000);
 await x.store.updateFieldState(actor.id,state=>({...state,syncedAt:'2999-01-01T00:00:00Z',queue:[{id:'new-local-change',projectId,action:'opening'}]}));
 x.advance(29999);await x.client.prepareOffline({background:true});assert.equal(x.calls,1);
 x.advance(1);const state=await x.client.prepareOffline({background:true});
 assert.equal(x.calls,2,'Only the last successful download sets the freshness interval');
 assert.equal(state.queue[0].id,'new-local-change');
});

test('explicit preparation bypasses the background freshness interval',async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});
 x.advance(1);x.remote.get(actor.id).projects[0].project_name='Updated on the server';
 const forced=await x.client.prepareOffline();
 assert.equal(x.calls,2);
 assert.equal(forced.projects[0].project_name,'Updated on the server');
 await x.client.prepareOffline({background:true});assert.equal(x.calls,2);
});

for(const failure of ['network','server'])test(`a ${failure} snapshot failure falls back to saved work without advancing download freshness`,async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});
 x.advance(60000);x.fail(failure);
 const fallback=await x.client.prepareOffline({background:true});
 assert.equal(fallback.actor.id,actor.id);assert.equal(x.calls,2);
 x.advance(1);x.fail(null);
 await x.client.prepareOffline({background:true});
 assert.equal(x.calls,3,'The next background call must retry the expired download immediately');
});

test('an account change event invalidates freshness even when the employee ID is unchanged',async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});
 x.advance(1000);await x.client.prepareOffline({background:true});assert.equal(x.calls,1);
 x.accountEvent(actor.id);
 await x.client.prepareOffline({background:true});
 assert.equal(x.calls,2);
});

test('background freshness never crosses accounts or survives an account switch back',async t=>{
 const x=backgroundSnapshots(t),otherId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 x.addAccount(otherId);
 await x.client.prepareOffline({background:true});assert.equal(x.calls,1);
 x.store.setFieldUser(otherId);
 const other=await x.client.prepareOffline({background:true});
 assert.equal(x.calls,2);assert.equal(other.actor.id,otherId);assert.equal(other.projects[0].created_by,otherId);
 x.store.setFieldUser(actor.id);
 const original=await x.client.prepareOffline({background:true});
 assert.equal(x.calls,3);assert.equal(original.actor.id,actor.id);
});

test('a forced call joining a completed background shortcut still downloads current server data',async t=>{
 const x=backgroundSnapshots(t);
 await x.client.prepareOffline({background:true});assert.equal(x.calls,1);
 x.remote.get(actor.id).projects[0].project_name='Changed after background download';
 const background=x.client.prepareOffline({background:true});
 // Let the background call choose its fresh-storage shortcut while its shared
 // promise is still settling, then require an explicit server verification.
 await Promise.resolve();
 const forced=x.client.prepareOffline();
 await background;
 const current=await forced;
 assert.equal(x.calls,2);
 assert.equal(current.projects[0].project_name,'Changed after background download');
});

test('a delayed snapshot cannot reactivate its employee after sign-out or an account switch',async t=>{
 for(const destination of [null,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'])await t.test(destination?'switch account':'sign out',async t=>{
  const x=backgroundSnapshots(t);
  if(destination)x.addAccount(destination);
  const before=structuredClone(x.accounts.get(actor.id)),snapshot=structuredClone(x.remote.get(actor.id));
  let release,signalStarted;
  const started=new Promise(resolve=>{signalStarted=resolve;});
  globalThis.fetch=async url=>{assert.equal(url,'/api/offline');signalStarted();return new Promise(resolve=>{release=()=>resolve(Response.json(snapshot));});};
  const pending=x.client.prepareOffline();
  const rejected=assert.rejects(pending,/employee who opened this registration form/);
  await started;x.store.setFieldUser(destination);release();await rejected;
  assert.equal(x.store.activeFieldUser(),destination);
  assert.deepEqual(x.accounts.get(actor.id),before,'An obsolete snapshot must not persist after its account changes');
  if(destination){
   globalThis.fetch=async()=>Response.json(x.remote.get(destination));
   const current=await x.client.prepareOffline();
   assert.equal(current.actor.id,destination,'Discarding the old request must release initialization for the new account');
   assert.equal(x.store.activeFieldUser(),destination);
  }
 });
});

test('a delayed workspace directory refresh cannot alter either account after an employee switch',async t=>{
 const x=backgroundSnapshots(t),otherId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const fixture=governorateFollowUpFixture();
 x.addAccount(otherId);
 await x.store.updateFieldState(actor.id,state=>({...state,projects:[fixture.project],indoorSales:fixture.indoorSales.map(({id,name})=>({id,name}))}));
 const originalBefore=structuredClone(x.accounts.get(actor.id));
 const otherBefore=structuredClone(x.accounts.get(otherId));
 window.location.pathname='/projects';
 let release,signalStarted;
 const started=new Promise(resolve=>{signalStarted=resolve;});
 globalThis.fetch=async url=>{
  assert.equal(url,'/api/workspace');
  signalStarted();
  return new Promise(resolve=>{release=()=>resolve(Response.json({actor:{...actor},projects:[fixture.project],indoorSales:fixture.indoorSales}));});
 };
 const reading=x.client.fieldFetch('/api/workspace');
 await started;
 x.store.setFieldUser(otherId);
 release();
 assert.equal((await reading).status,200);
 assert.equal(x.store.activeFieldUser(),otherId);
 assert.deepEqual(x.accounts.get(actor.id),originalBefore);
 assert.deepEqual(x.accounts.get(otherId),otherBefore);
});

test('late synchronization authorization failures cannot sign out a newer employee',async t=>{
 for(const phase of ['session','saved change'])await t.test(phase,async t=>{
  const x=backgroundSnapshots(t),otherId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  x.addAccount(otherId);
  await x.store.updateFieldState(actor.id,state=>({...state,queue:[{id:'queued-opening',projectId,userId:actor.id,action:'opening',payload:{},recordedAt:'2026-11-08T08:00:00Z'}]}));
  const beforeA=structuredClone(x.accounts.get(actor.id)),beforeB=structuredClone(x.accounts.get(otherId));
  let release,signalStarted;
  const started=new Promise(resolve=>{signalStarted=resolve;});
  globalThis.fetch=async(url,init)=>{
   if(url==='/api/offline?session=1'&&phase==='saved change')return Response.json({actor});
   assert.equal(url,phase==='session'?'/api/offline?session=1':'/api/offline');
   if(phase==='saved change')assert.equal(init.method,'POST');
   signalStarted();return new Promise(resolve=>{release=()=>resolve(Response.json({error:'Authentication is required.'},{status:401}));});
  };
  const pending=x.client.syncFieldChanges();await started;
  x.store.setFieldUser(otherId);release();await pending;
  assert.equal(x.store.activeFieldUser(),otherId);
  assert.deepEqual(x.accounts.get(actor.id).queue,beforeA.queue,'Failed old-account operations remain durable for their original employee');
  assert.deepEqual(x.accounts.get(otherId),beforeB);
 });
});

test('one synchronization run immediately drains a first opening saved while registration is being acknowledged',async()=>{
 const outdoor=outdoorActorForCurrentBranch('Karkh'),x=setup({actor:outdoor});
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:null}});
 const registration=x.state.queue[0],registered=structuredClone(x.state.projects[0]);
 const posted=[];let sessions=0,releaseRegistration,signalStarted;
 const started=new Promise(resolve=>{signalStarted=resolve;});
 const registeredVersion='2026-11-08T08:00:01Z',openingVersion='2026-11-08T08:00:02Z';
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1'){sessions++;return Response.json({actor:outdoor});}
  assert.equal(url,'/api/offline');assert.equal(init.method,'POST');
  const change=JSON.parse(init.body);posted.push(change);
  if(change.action==='register'){
   signalStarted();return new Promise(resolve=>{releaseRegistration=()=>resolve(Response.json({project:{...registered,project_number:'PRJ-NEW',updated_at:registeredVersion}}));});
  }
  assert.equal(change.action,'opening');
  assert.equal(change.expectedUpdatedAt,registeredVersion,'The opening uses the acknowledged registration version');
  return Response.json({project:{...registered,project_number:'PRJ-NEW',updated_at:openingVersion}});
 };
 navigator.onLine=true;
 const syncing=x.client.syncFieldChanges();await started;
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 await x.client.saveFieldChange('opening',projectId,opening);
 const queuedOpening=x.state.queue.find(change=>change.action==='opening');
 assert.deepEqual(posted.map(change=>change.id),[registration.id],'Opening saving must not wait for the registration request');
 releaseRegistration();await syncing;
 assert.deepEqual(posted.map(change=>change.id),[registration.id,queuedOpening.id]);
 assert.equal(new Set(posted.map(change=>change.id)).size,2);
 assert.equal(sessions,1);
 assert.equal(x.state.queue.length,0,'The first opening must not wait for the next polling interval');
 assert.equal(x.state.openings[0].id,opening.id);
 assert.equal(x.state.projects[0].serverUpdatedAt,openingVersion);
 assert.equal(x.state.projects[0].pending,false);
});

test('a dynamic sync conflict blocks later changes for that project while newly queued other projects continue',async()=>{
 const outdoor=outdoorActorForCurrentBranch('Karkh'),x=setup({actor:outdoor});
 const secondProjectId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:null}});
 const registration=x.state.queue[0],posted=[];let releaseRegistration,signalStarted;
 const started=new Promise(resolve=>{signalStarted=resolve;});
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor:outdoor});
  const change=JSON.parse(init.body);posted.push(change);
  if(change.id===registration.id){signalStarted();return new Promise(resolve=>{releaseRegistration=()=>resolve(Response.json({error:'Project changed on another device'},{status:409}));});}
  assert.equal(change.projectId,secondProjectId,'The conflicted project must not send any later operation in this run');
  return Response.json({project:{...x.state.projects.find(project=>project.id===secondProjectId),project_number:'PRJ-OTHER',updated_at:'2026-11-08T08:00:02Z'}});
 };
 navigator.onLine=true;const syncing=x.client.syncFieldChanges();await started;
 const opening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
 await x.client.saveFieldChange('opening',projectId,opening);
 await x.client.saveFieldChange('register',secondProjectId,{...payload,client:{...payload.client,clientName:'Other site'},project:{...payload.project,assignedOutdoorSalesId:null}});
 await x.client.saveFieldChange('opening',secondProjectId,{...opening,id:'ffffffff-ffff-4fff-8fff-ffffffffffff'});
 const queue=structuredClone(x.state.queue);
 releaseRegistration();await syncing;
 assert.deepEqual(posted.map(change=>change.id),[registration.id,...queue.filter(change=>change.projectId===secondProjectId).map(change=>change.id)]);
 assert.equal(new Set(posted.map(change=>change.id)).size,3,'A conflict must not be retried within the same run');
 assert.deepEqual(x.state.queue.map(change=>change.id),queue.filter(change=>change.projectId===projectId).map(change=>change.id));
 assert.match(x.state.queue[0].error,/another device/);
 assert.equal(x.state.openings.length,2);
 assert.equal(x.state.projects.find(project=>project.id===secondProjectId).pending,false);
});
