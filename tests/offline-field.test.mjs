import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',js)(n=>{if(!(n in deps))throw Error(n);return deps[n];},exports);return exports;}
const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Employee',role:'Indoor Sales'};
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload={client:{clientType:'individual',clientName:'Client',mobile:'07000000000'},project:{assignedOutdoorSalesId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',address:'Site',locationLatitude:33.3,locationLongitude:44.4,structureReadiness:'ready'}};
function setup(){globalThis.window={dispatchEvent:()=>{}};let active=actor.id;let state={actor,outdoorSales:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Outdoor employee'}],projects:[],openings:[],queue:[],syncedAt:null};Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readFieldState:async()=>structuredClone(state),updateFieldState:async(id,fn)=>{assert.equal(id,actor.id);state=fn(structuredClone(state));return structuredClone(state);}};const client=load('../src/lib/offline/client.ts',{'./store':store,'@/lib/measurements/registrationOpening':load('../src/lib/measurements/registrationOpening.ts')});return {client,get state(){return state;},get active(){return active;}};}
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
