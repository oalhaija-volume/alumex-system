import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const employeeId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const operationId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor={id:employeeId,name:'Ehab',role:'Outdoor Sales',branch:'Rasafa',outdoorRotationStartBranch:'Rasafa'};
const project={id:projectId,branch:'Rasafa',project_name:'Retained Rasafa work',project_number:'PRJ-RETAINED',created_by:employeeId,structure_readiness:'ready',sales_status:'new_lead',updated_at:'2026-11-15T19:00:00Z'};
const change={id:operationId,userId:employeeId,projectId,action:'reopen',payload:{},recordedAt:project.updated_at};

function setup(t,{status=200,receipt={acknowledged:true,operationId,projectId},queue=[change],branch='Rasafa'}={}){
 const original=new Map(['window','navigator','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 t.after(()=>{for(const[key,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
 let state={actor,projects:[{...project,branch}],openings:[{id:'opening',projectId,createdBy:employeeId}],measurementReports:[{id:'report',project_id:projectId,note:'Retained note'}],queue:structuredClone(queue),syncedAt:null};
 let active=employeeId;const calls=[];const writes=[];
 globalThis.window={location:{pathname:'/offline'},dispatchEvent(){},addEventListener(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 globalThis.fetch=async(url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor});
  assert.equal(url,'/api/offline');assert.equal(init.method,'POST');
  const body=JSON.parse(init.body);calls.push(body);
  assert.equal(body.acknowledgeOnly,true,'A hidden project must never reach the normal write path');
  return Response.json(receipt,{status});
 };
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-24T08:00:00+03:00']));}static now(){return Date.parse('2026-11-24T08:00:00+03:00');}}
 const cache=new Map();
 const store={activeFieldUser:()=>active,setFieldUser:id=>{active=id;},readStoredFieldState:async()=>structuredClone(state),readFieldState:async()=>visible(state),updateFieldState:async(id,update)=>{assert.equal(id,employeeId);state=update(structuredClone(state));writes.push(structuredClone(state));return visible(state);}};
 function load(path){
  const url=new URL(path,import.meta.url);if(cache.has(url.href))return cache.get(url.href);
  const exports={};cache.set(url.href,exports);
  const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports','Date',source)(name=>{
   if(name==='./store')return store;
   if(name==='./device')return{isOfflineDevice:()=>true};
   if(name.startsWith('@/'))return load(`../src/${name.slice(2)}.ts`);
   if(name.startsWith('.'))return load(new URL(`${name}.ts`,url));
   throw new Error(`Unexpected dependency ${name}`);
  },exports,FixedDate);return exports;
 }
 const visibility=load('../src/lib/offline/projectAccess.ts');
 const visible=value=>visibility.visibleFieldState(structuredClone(value));
 const client=load('../src/lib/offline/client.ts');
 return{client,calls,writes,get raw(){return structuredClone(state);},get visible(){return visible(state);}};
}

test('exact committed hidden receipt clears only its operation without merging or displaying its project',async t=>{
 const pending={...change,id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',payload:{note:'Uncommitted'}};
 const x=setup(t,{queue:[change,pending],receipt:{acknowledged:true,operationId,projectId,project:{branch:'Karkh',project_name:'Must not merge'}}});
 const before=x.raw;await x.client.syncFieldChanges();
 assert.deepEqual(x.raw.queue,[pending]);assert.deepEqual(x.raw.projects,before.projects);
 assert.deepEqual(x.raw.openings,before.openings);assert.deepEqual(x.raw.measurementReports,before.measurementReports);
 assert.deepEqual(x.visible.projects,[]);assert.deepEqual(x.visible.queue,[]);
 assert.equal(x.calls.length,2);assert.ok(x.calls.every(call=>call.acknowledgeOnly===true));
});

for(const variant of [
 {label:'no committed receipt',status:404,receipt:{error:'Saved operation not found.'}},
 {label:'different operation',receipt:{acknowledged:true,operationId:'other',projectId}},
 {label:'different project',receipt:{acknowledged:true,operationId,projectId:'other'}},
 {label:'project snapshot without acknowledgement',receipt:{project}},
 {label:'temporary server failure',status:503,receipt:{error:'Try again.'}},
])test(`${variant.label} preserves all hidden drafts and measurements`,async t=>{
 const x=setup(t,variant),before=x.raw;await x.client.syncFieldChanges();
 assert.deepEqual(x.raw,before);assert.equal(x.calls.length,1);assert.deepEqual(x.visible.projects,[]);
});

test('Najaf hidden work never receives a Baghdad rotation acknowledgement attempt',async t=>{
 const x=setup(t,{branch:'Najaf'}),before=x.raw;await x.client.syncFieldChanges();
 assert.deepEqual(x.raw,before);assert.equal(x.calls.length,0);
});
