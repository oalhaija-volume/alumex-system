import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const employeeId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const assignmentId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const collectorId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const actor={id:employeeId,name:'Ehab fixture',role:'Outdoor Sales',branch:'Rasafa',outdoorRotationStartBranch:'Rasafa',outdoorTeamMemberIds:[employeeId,teammateId]};
const project={id:projectId,project_number:'PRJ-EXCEPTION',project_name:'Retained draft',branch:'Rasafa',measurement_branch:null,
 created_by:collectorId,registeredBy:'Indoor fixture',original_creator_role:'Indoor Sales',follow_up_owner_id:collectorId,
 structure_readiness:'ready',sales_status:'new_lead',archived_at:null,assigned_outdoor_sales_id:employeeId,measurement_assignment_id:assignmentId,
 measurement_exception_employee_id:employeeId,measurement_exception_assignment_id:assignmentId,measurement_exception_reason:'Explicit exception for this visit only',
 updated_at:'2026-11-24T04:00:00Z',created_at:'2026-11-23T04:00:00Z',address:'Fixture site',phone:null,next_follow_up_at:null};
const opening={id:'11111111-1111-4111-8111-111111111111',projectId,createdBy:employeeId,floor:'GF',room:'Bedroom',otherRoom:'',width:1400,height:1800,quantity:1,structuralType:'Window',openingType:'Sliding'};

function setup(t,overrides={}){
 const previous=new Map(['window','navigator','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 t.after(()=>{for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
 let state=structuredClone({actor,projects:[project],openings:[opening],queue:[],syncedAt:null,outdoorSales:[{id:collectorId,name:'Rasafa collector',branch:'Karkh',outdoorRotationStartBranch:'Karkh'}],indoorSales:[],...overrides});
 let active=state.actor.id;
 globalThis.window={location:{pathname:'/offline'},dispatchEvent(){},addEventListener(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-24T08:00:00+03:00']));}static now(){return Date.parse('2026-11-24T08:00:00+03:00');}}
 const cache=new Map();let access;
 const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readStoredFieldState:async()=>structuredClone(state),
  readFieldState:async()=>access.visibleFieldState(structuredClone(state)),
  updateFieldState:async(id,update)=>{assert.equal(id,state.actor.id);state=update(structuredClone(state));return access.visibleFieldState(structuredClone(state));}};
 function load(path){const url=new URL(path,import.meta.url);if(cache.has(url.href))return cache.get(url.href);const exports={};cache.set(url.href,exports);
  const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports','Date',source)(name=>{
   if(name==='./store')return store;if(name==='./device')return{isOfflineDevice:()=>true};
   if(name.startsWith('@/'))return load(`../src/${name.slice(2)}.ts`);if(name.startsWith('.'))return load(new URL(`${name}.ts`,url));
   throw new Error(`Unexpected module ${name}`);
  },exports,FixedDate);return exports;
 }
 access=load('../src/lib/offline/projectAccess.ts');const client=load('../src/lib/offline/client.ts'),tasks=load('../src/lib/workflow/salesTasks.ts');
 return{client,store,tasks,get raw(){return structuredClone(state);},get visible(){return access.visibleFieldState(structuredClone(state));}};
}

test('the named exception records and finishes offline, then drains both operations through normal server validation',async t=>{
 const x=setup(t);assert.equal(x.visible.projects.length,1);assert.equal(x.tasks.measurementTasks(x.visible.projects,actor,new Date('2026-11-24T08:00:00+03:00')).length,1);
 await x.client.saveFieldChange('opening',projectId,{...opening,id:'22222222-2222-4222-8222-222222222222'});
 await x.client.saveFieldChange('finish',projectId,{});
 assert.deepEqual(x.raw.queue.map(change=>change.action),['opening','finish']);assert.equal(x.visible.queue.length,2);
 assert.equal(x.tasks.measurementTasks(x.visible.projects,actor).length,0,'Optimistic finish leaves the task list without hiding its unsynced work');
 await assert.rejects(x.client.saveFieldChange('reopen',projectId,{}),/assign a new measurement task/);
 const posts=[];navigator.onLine=true;
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor});
  const change=JSON.parse(init.body);assert.equal(change.acknowledgeOnly,undefined);posts.push(change);
  return Response.json({project:{...project,updated_at:`2026-11-24T05:0${posts.length}:00Z`,
   ...(change.action==='finish'?{sales_status:'ready_for_quotation',measurement_exception_employee_id:null,measurement_exception_assignment_id:null,measurement_exception_reason:null}:{})}});
 };
 await x.client.syncFieldChanges();
 assert.deepEqual(posts.map(change=>change.action),['opening','finish']);assert.equal(x.raw.queue.length,0);
 assert.equal(x.raw.projects[0].measurement_exception_employee_id,null);assert.equal(x.visible.projects.length,0);
 assert.equal(x.raw.openings.length,2,'Completion and access expiry retain actual measurements');
});

test('a teammate cannot inherit the named cross-area exception or record an opening',async t=>{
 const x=setup(t,{actor:{...actor,id:teammateId}});assert.equal(x.visible.projects.length,0);
 await assert.rejects(x.client.saveFieldChange('opening',projectId,{...opening,id:'22222222-2222-4222-8222-222222222222'}),/not available/);
 assert.equal(x.raw.queue.length,0);
});

test('a lost committed finish response acknowledges only its receipt and expires the local grant',async t=>{
 const x=setup(t);await x.client.saveFieldChange('finish',projectId,{});
 const operation=x.raw.queue[0];assert.equal(operation.measurementExceptionAssignmentId,assignmentId);
 let committed=false,ordinary=0,acks=0;navigator.onLine=true;
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor});
  const body=JSON.parse(init.body);assert.equal(body.id,operation.id);assert.deepEqual(body.payload,operation.payload);
  if(body.acknowledgeOnly){acks++;return Response.json({acknowledged:true,operationId:body.id,projectId});}
  ordinary++;if(!committed){committed=true;throw new Error('Response lost after commit');}
  return Response.json({error:'Project not found.'},{status:404});
 };
 await x.client.syncFieldChanges();assert.equal(x.raw.queue.length,1);assert.equal(x.visible.queue.length,1);
 await x.client.syncFieldChanges();
 assert.equal(ordinary,2);assert.equal(acks,1);assert.equal(x.raw.queue.length,0);
 assert.equal(x.raw.projects[0].measurement_exception_employee_id,null);assert.equal(x.visible.projects.length,0);
 assert.deepEqual(x.raw.openings,[opening]);
});

test('an uncommitted finish rejected after revocation remains durable when no exact receipt exists',async t=>{
 const x=setup(t);await x.client.saveFieldChange('finish',projectId,{});const operation=x.raw.queue[0];
 navigator.onLine=true;
 globalThis.fetch=async(url,init)=>url==='/api/offline?session=1'?Response.json({actor}):Response.json({error:JSON.parse(init.body).acknowledgeOnly?'Saved operation not found.':'Project not found.'},{status:404});
 await x.client.syncFieldChanges();
 assert.equal(x.raw.queue[0].id,operation.id);assert.deepEqual(x.raw.queue[0].payload,operation.payload);assert.deepEqual(x.raw.openings,[opening]);
 assert.equal(x.visible.projects.length,0);assert.ok(x.raw.unavailableProjectIds.includes(projectId));
});

test('verified reassignment refreshes assignment and exception proof even while a local opening is pending',async t=>{
 const queued={id:'33333333-3333-4333-8333-333333333333',userId:employeeId,projectId,action:'opening',payload:opening,recordedAt:project.updated_at};
 const x=setup(t,{projects:[{...project,pending:true}],queue:[queued]});navigator.onLine=true;
 globalThis.fetch=async()=>Response.json({actor,projects:[{...project,project_name:'Server name',measurement_assignment_id:'44444444-4444-4444-8444-444444444444',
  assigned_outdoor_sales_id:collectorId,measurement_exception_employee_id:null,measurement_exception_assignment_id:null,measurement_exception_reason:null,project_log_only:true}],openings:[],queue:[],syncedAt:null});
 await x.client.prepareOffline();
 const raw=x.raw;assert.equal(raw.projects[0].measurement_assignment_id,'44444444-4444-4444-8444-444444444444');
 assert.equal(raw.projects[0].measurement_exception_employee_id,null);assert.equal(raw.projects[0].measurement_exception_assignment_id,null);assert.equal(raw.projects[0].measurement_exception_reason,null);
 assert.equal(raw.projects[0].project_name,'Server name','A pending opening does not prevent verified identity updates');assert.deepEqual(raw.queue,[queued]);assert.deepEqual(raw.openings,[opening]);assert.equal(x.visible.projects.length,0);
 await assert.rejects(x.client.saveFieldChange('opening',projectId,opening),/reference only/);
});

test('an incomplete remote projection cannot preserve an old task exception',async t=>{
 const queued={id:'33333333-3333-4333-8333-333333333333',userId:employeeId,projectId,action:'opening',payload:opening,recordedAt:project.updated_at};
 const x=setup(t,{projects:[{...project,pending:true}],queue:[queued]});navigator.onLine=true;
 const remote={...project};delete remote.measurement_assignment_id;delete remote.measurement_exception_employee_id;delete remote.measurement_exception_assignment_id;delete remote.measurement_exception_reason;
 globalThis.fetch=async()=>Response.json({actor,projects:[remote],openings:[],queue:[],syncedAt:null});await x.client.prepareOffline();
 assert.equal(x.raw.projects[0].measurement_assignment_id,null);assert.equal(x.raw.projects[0].measurement_exception_employee_id,null);assert.equal(x.visible.projects.length,0);assert.deepEqual(x.raw.queue,[queued]);
});

test('an ordinary reassignment clears the local exception instead of transferring it to another task',async t=>{
 const x=setup(t,{actor:{...actor,role:'Sales Manager'}});
 await x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:collectorId});
 const p=x.raw.projects[0];assert.equal(p.assigned_outdoor_sales_id,collectorId);assert.notEqual(p.measurement_assignment_id,assignmentId);
 assert.equal(p.measurement_exception_employee_id,null);assert.equal(p.measurement_exception_assignment_id,null);assert.equal(p.measurement_exception_reason,null);
});

test('an exception grant cannot be fabricated in the offline queue',async t=>{
 const x=setup(t,{actor:{...actor,role:'Sales Manager'}}),before=x.raw;
 await assert.rejects(x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:employeeId,measurementExceptionReason:'Unverified local grant'}),/assigned online by an Admin/);
 assert.deepEqual(x.raw,before);
 const response=await x.client.fieldFetch('/api/workspace',{method:'PATCH',body:JSON.stringify({projectId,action:'assign-measurements',assignedOutdoorSalesId:employeeId,measurementExceptionReason:'Must reach the server'})});
 assert.equal(response.status,409);assert.deepEqual(x.raw,before);
});

test('Admin reassignment requires online access and retains the saved exception and opening',async t=>{
 const x=setup(t,{actor:{...actor,role:'Admin'}}),before=x.raw;
 await assert.rejects(x.client.saveFieldChange('assign-measurements',projectId,{assignedOutdoorSalesId:collectorId}),/requires an internet connection/i);
 assert.deepEqual(x.raw,before);
});
