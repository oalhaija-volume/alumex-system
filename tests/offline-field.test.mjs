import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',js)(n=>{if(!(n in deps))throw Error(n);return deps[n];},exports);return exports;}
const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Employee',role:'Indoor Sales'};
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload={client:{clientType:'individual',clientName:'Client',mobile:'07000000000'},project:{assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Site',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'ready'}};
function setup(){globalThis.window={dispatchEvent:()=>{}};let active=actor.id;let state={actor,indoorSales:[{id:actor.id,name:actor.name}],outdoorSales:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Outdoor employee'}],projects:[],openings:[],queue:[],syncedAt:null};Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readFieldState:async()=>structuredClone(state),updateFieldState:async(id,fn)=>{assert.equal(id,actor.id);state=fn(structuredClone(state));return structuredClone(state);}};const client=load('../src/lib/offline/client.ts',{'./store':store,'@/lib/workflow/followUps':load('../src/lib/workflow/followUps.ts'),'@/lib/workflow/stages':load('../src/lib/workflow/stages.ts'),'@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts')});return {client,get state(){return state;},get active(){return active;}};}
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
 const x=setup();await assert.rejects(x.client.saveFieldChange('register',projectId,{...payload,project:{...payload.project,assignedOutdoorSalesId:null}}),/Assign an Outdoor/);assert.equal(x.state.queue.length,0);
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
