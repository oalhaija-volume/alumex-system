import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',js)(n=>{if(n==='@/lib/location/coordinates')return load('../src/lib/location/coordinates.ts');if(n==='./device')return deps[n]??{isOfflineDevice:()=>true};if(n==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(n==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':load('../src/lib/auth/permissions.ts')});if(n==='@/lib/intake/buildingType')return load('../src/lib/intake/buildingType.ts');if(n==='@/lib/intake/readinessNote')return load('../src/lib/intake/readinessNote.ts');if(n==='@/lib/auth/permissions')return load('../src/lib/auth/permissions.ts');if(!(n in deps))throw Error(n);return deps[n];},exports);return exports;}
const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Employee',role:'Indoor Sales',branch:'Karkh'};
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload={client:{clientType:'individual',clientName:'Client',mobile:'07000000000'},project:{buildingType:'villa_house',assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Site',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'ready'}};
function setup(overrides={}){globalThis.window={dispatchEvent:()=>{}};let active=actor.id;let state={actor,indoorSales:[{id:actor.id,name:actor.name}],outdoorSales:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Outdoor employee'}],projects:[],openings:[],queue:[],syncedAt:null,...overrides};Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readFieldState:async()=>structuredClone(state),updateFieldState:async(id,fn)=>{assert.equal(id,actor.id);state=fn(structuredClone(state));return structuredClone(state);}};const client=load('../src/lib/offline/client.ts',{'./store':store,'@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),'@/lib/workflow/stages':load('../src/lib/workflow/stages.ts'),'@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts')});return {client,get state(){return state;},get active(){return active;}};}
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


test('restricted employees cannot queue CRM updates or readiness changes on a cached device',async()=>{
 const originalRole=actor.role;
 try {
  for(const role of ['Outdoor Sales','HR']) {
   actor.role=role;
   const x=setup();
   await x.client.saveFieldChange('register',projectId,payload);
   const before=x.state.queue.length;
   for(const action of ['follow-up','ready','assign-measurements'])await assert.rejects(x.client.saveFieldChange(action,projectId,{}),/CRM access is limited/);
   assert.equal(x.state.queue.length,before);
  }
 }finally{actor.role=originalRole;}
});

test('CRM assignment preserves creator and saved measurements, and hands a ready site to the selected employee',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,structureReadiness:'not_ready'}});
 x.state.outdoorSales.push({id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Second outdoor employee'});
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
 await assert.rejects(x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),/eligible employee/);
 assert.deepEqual(x.state,before);
});

test('offline registration retains the assigned branch and rejects an unassigned employee',async()=>{
 const x=setup();await x.client.saveFieldChange('register',projectId,payload);
 assert.equal(x.state.projects[0].branch,'Karkh');
 assert.equal(x.state.projects[0].location_latitude,33.3);assert.equal(x.state.projects[0].location_longitude,44.4);
 const unassigned=setup({actor:{...actor,branch:null}});
 await assert.rejects(unassigned.client.saveFieldChange('register',projectId,payload),/Ask Admin to assign/);
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
 await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:other.id}}),/Outdoor Sales employee/);
 assert.equal(x.state.queue.length,0);
});


test('an empty synchronization queue makes no session or write requests',async()=>{
 const x=setup();navigator.onLine=true;
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network request');};
 await x.client.syncFieldChanges();
 assert.equal(calls,0);assert.equal(x.active,actor.id);
});

test('Outdoor Sales cannot save a not-ready project locally without a note; the saved reason survives follow-up changes',async()=>{
 const x=setup({actor:{...actor,role:'Outdoor Sales'}});
 const notReady={...payload,project:{...payload.project,structureReadiness:'not_ready'}};
 for(const readinessNote of [undefined,' \n\t ',23,'x'.repeat(2001)]){
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...notReady,project:{...notReady.project,readinessNote}}),/note/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 await x.client.saveFieldChange('register',projectId,{...notReady,project:{...notReady.project,readinessNote:'  Plastering unfinished  '}});
 assert.equal(x.state.projects[0].readiness_note,'Plastering unfinished');
 assert.equal((await (await x.client.fieldFetch('/api/workspace')).json()).projects[0].readiness_note,'Plastering unfinished');
 // Later CRM contact notes must not replace the original site-readiness reason.
 x.state.actor.role='Indoor Sales';
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

const delayProject={id:projectId,project_number:'PRJ-DELAY',project_name:'Delayed visit',created_by:'creator',assigned_outdoor_sales_id:actor.id,structure_readiness:'ready',sales_status:'new_lead',updated_at:'2026-10-18T00:00:00Z'};
const delayOpening={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',projectId,floor:'Ground',room:'Kitchen',width:120,height:150,structuralType:'Window',openingType:'Sliding'};
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
  const x=setup({actor:{...actor,role:'Outdoor Sales'}});
  await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,buildingType}}),/building type/);
  assert.equal(x.state.queue.length,0);assert.equal(x.state.projects.length,0);
 }
 for(const buildingType of ['commercial_building','residential_building','villa_house']){
  const x=setup({actor:{...actor,role:'Outdoor Sales'}});
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
 const x=setup({projects:[project],openings:[original],outdoorSales:[{id:actor.id,name:actor.name}]});
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
