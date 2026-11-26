import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'Sales Manager',branch:'Karkh',name:'Fixture manager'};
const projectId='11111111-1111-4111-8111-111111111111',linkedId='22222222-2222-4222-8222-222222222222',otherId='33333333-3333-4333-8333-333333333333';
const oldTime='2026-11-26T08:00:00Z',newTime='2026-11-26T09:00:00Z';
function modules(dependencies={}){
 const cache=new Map();
 function load(url){
  if(cache.has(url.href))return cache.get(url.href);
  const exports={};cache.set(url.href,exports);
  const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',source)(name=>Object.hasOwn(dependencies,name)?dependencies[name]:load(name.startsWith('@/')?new URL(`../src/${name.slice(2)}.ts`,import.meta.url):new URL(`${name}.ts`,url)),exports);
  return exports;
 }
 return path=>load(new URL(`../src/${path}.ts`,import.meta.url));
}
function quotationData(id=projectId,rate=250000){
 const quotation={lines:[{opening:{id:'window',width:100,height:100,quantity:1,opening_type:'Window',opening_direction:'Sliding'},area:1,system:{id:'system',name:'Alumex System',unit:'sqm',quantity:1,rate,total:rate},glass:null,extras:[],total:rate}],total:rate,currency:'IQD',createdAt:oldTime,preparedBy:actor.id,version:3};
 return {quotationAccess:'full',project:{id,project_name:'Old project',project_number:`PRJ-${id.slice(0,4)}`,updated_at:oldTime,branch:'Karkh',address:'Saved site',sales_status:'quotation_in_progress'},client:{name:'Old client',mobile:'07000000000'},openings:[],catalog:[],flow:{project_id:id,revision:3,stage:'quotation',quotation,contract:null,evidence:null,signed_at:null,accepted_at:null,accepted_by:null},history:[{version:1,contract:{client:{name:'Historical client'},project:{name:'Historical title'}}}]};
}
function fixture(){
 const events=new EventTarget();events.location={pathname:'/offline'};
 Object.defineProperty(globalThis,'window',{configurable:true,value:events});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false,userAgent:'Windows'}});
 let active=actor.id;
 const data=quotationData(),draft=quotationData(projectId,310000),successor=quotationData(projectId,345678);
 const body={action:'save',revision:3,choices:[{openingId:'window',systemId:'system',systemRate:310000,extras:[]}]};
 let state={actor,projects:[projectId,linkedId,otherId].map(id=>({...data.project,id,client_id:id===otherId?'other-client':'shared-client',client_name:id===otherId?'Unrelated client':'Old client',project_name:id===projectId?'Unfinished local title':'Old project',created_at:oldTime,created_by:actor.id,registeredBy:actor.name,structure_readiness:'ready',phone:null,next_follow_up_at:null,project_notes:null})),openings:[{id:'unsynced-opening',projectId,width:125}],queue:[{id:'pending-title',projectId,action:'rename-project',payload:{projectName:'Unfinished local title'}}],syncedAt:null,
  quotations:{entries:[projectId,linkedId,otherId].map(id=>({projectId:id,data:quotationData(id),available:true,downloadedAt:oldTime})),queue:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',userId:actor.id,projectId,recordedAt:oldTime,attemptedAt:oldTime,body,base:data,draft,successor:{body:{...body,choices:[{openingId:'window',systemId:'system',systemRate:345678,extras:[]}]},draft:successor,recordedAt:oldTime}}],archived:[],downloadedAt:null}};
 const writes=[],requests=[];
 const store={activeFieldUser:()=>active,readStoredFieldState:async()=>structuredClone(state),readFieldState:async()=>structuredClone(state),setFieldUser:id=>{active=id;},updateFieldState:async(id,change)=>{
  assert.equal(id,actor.id);state=change(structuredClone(state));writes.push(structuredClone(state));events.dispatchEvent(new Event('field-change'));return structuredClone(state);
 }};
 const load=modules({'./store':store});
 let network=()=>{throw new Error('Unexpected network request');};
 globalThis.fetch=async(url,init={})=>{requests.push({url:String(url),init});return network(String(url),init);};
 return {client:load('lib/offline/client'),quotes:load('lib/offline/quotations'),load,store,writes,requests,
  get state(){return structuredClone(state);},set state(value){state=structuredClone(value);},network:handler=>{network=handler;},online:()=>{navigator.onLine=true;},switchAccount:id=>{active=id;}};
}
const updates=[{id:projectId,project_name:'Corrected client',updated_at:newTime},{id:linkedId,project_name:'Corrected client',updated_at:newTime}];
const rename=x=>x.client.updateSavedClientName(actor.id,projectId,'shared-client','Corrected client',updates);

test('confirmed client renames refresh linked cache names while preserving pending titles, server baselines and every priced draft',async()=>{
 const x=fixture(),before=x.state;await rename(x);
 const after=x.state;
 assert.equal(after.projects[0].client_name,'Corrected client');assert.equal(after.projects[0].project_name,'Unfinished local title');
 assert.equal(after.projects[0].serverUpdatedAt,oldTime,'A pending field operation must still conflict against its original server baseline');
 assert.equal(after.projects[1].project_name,'Corrected client');assert.deepEqual(after.projects[2],before.projects[2]);
 assert.deepEqual(after.queue,before.queue);assert.deepEqual(after.openings,before.openings);
 assert.deepEqual(after.quotations.queue,before.quotations.queue,'Attempted request bodies, base snapshots and successor prices remain exact');
 for(const id of [projectId,linkedId]){
  const entry=after.quotations.entries.find(row=>row.projectId===id),previous=before.quotations.entries.find(row=>row.projectId===id);
  assert.equal(entry.data.client.name,'Corrected client');assert.equal(entry.data.project.project_name,'Corrected client');
  assert.deepEqual(entry.data.flow,previous.data.flow);assert.deepEqual(entry.data.history,previous.data.history);
 }
 const shown=await(await x.quotes.quotationFetch(`/api/sales-flow/${projectId}`)).json();
 assert.equal(shown.client.name,'Corrected client');assert.equal(shown.project.project_name,'Corrected client');
 assert.equal(shown.flow.quotation.total,345678);assert.equal(shown.flow.revision,3);assert.equal(shown.offlineQuotation.pending,true);
 assert.deepEqual(x.state.quotations.queue,before.quotations.queue);assert.equal(x.requests.length,0);
});

test('a fresh quotation download updates pending document identity without rebasing its stale revision or choices',async()=>{
 const x=fixture(),before=x.state;x.online();
 const remote=quotationData();remote.client.name='Corrected client';remote.project.project_name='Corrected client';remote.project.updated_at=newTime;remote.flow.revision=4;
 x.network(url=>{assert.equal(url,'/api/offline/quotations');return Response.json({actor,quotations:x.state.quotations.entries.map(entry=>({projectId:entry.projectId,data:entry.projectId===projectId?remote:entry.data})),complete:true});});
 await x.quotes.prepareOfflineQuotations();
 const shown=await(await x.quotes.quotationFetch(`/api/sales-flow/${projectId}`)).json();
 assert.equal(shown.client.name,'Corrected client');assert.equal(shown.project.project_name,'Corrected client');assert.equal(shown.flow.revision,3);assert.equal(shown.flow.quotation.total,345678);
 assert.equal(x.state.quotations.entries[0].data.flow.revision,4);assert.deepEqual(x.state.quotations.queue,before.quotations.queue);
 x.network((url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor});
  assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).revision,3);
  return Response.json({error:'The project changed. Reload before saving.',code:'OFFLINE_QUOTATION_CONFLICT'},{status:409});
 });
 await x.quotes.syncOfflineQuotations();
 assert.equal(x.state.quotations.queue[0].conflict,true);assert.equal(x.state.quotations.queue[0].status,409);
 assert.deepEqual(x.state.quotations.queue[0].body,before.quotations.queue[0].body);assert.deepEqual(x.state.quotations.queue[0].base,before.quotations.queue[0].base);
 assert.deepEqual(x.state.quotations.queue[0].successor,before.quotations.queue[0].successor);
});

test('workspace refreshes propagate server names into quotation caches while preserving local project work',async()=>{
 const x=fixture(),before=x.state,remote=structuredClone(before);x.online();
 remote.projects=remote.projects.map(project=>project.id===projectId?{...project,client_name:'Corrected client',project_name:'Corrected client',updated_at:newTime}:project);
 remote.queue=[];remote.openings=[];
 x.network(url=>{assert.equal(url,'/api/offline');return Response.json(remote);});
 await x.client.prepareOffline();
 const current=x.state,shown=await(await x.quotes.quotationFetch(`/api/sales-flow/${projectId}`)).json();
 assert.equal(shown.client.name,'Corrected client');assert.equal(shown.project.project_name,'Corrected client');assert.equal(shown.flow.quotation.total,345678);
 assert.equal(current.projects.find(project=>project.id===projectId).project_name,'Unfinished local title');
 assert.deepEqual(current.queue,before.queue);assert.deepEqual(current.quotations.queue,before.quotations.queue);assert.deepEqual(current.openings,before.openings);
});

test('late downloads cannot restore identity metadata from before a confirmed rename',async()=>{
 const x=fixture();await rename(x);x.online();
 const pending=x.state.quotations.queue;
 x.network(()=>Response.json({actor,quotations:x.state.quotations.entries.map(entry=>({projectId:entry.projectId,data:quotationData(entry.projectId)})),complete:true}));
 await x.quotes.prepareOfflineQuotations();
 const shown=await(await x.quotes.quotationFetch(`/api/sales-flow/${projectId}`)).json();
 assert.equal(shown.client.name,'Corrected client');assert.equal(shown.project.project_name,'Corrected client');assert.equal(shown.project.updated_at,newTime);
 assert.deepEqual(x.state.quotations.queue,pending);
});

test('idempotent acknowledgement of older work cannot briefly restore old cached names',async()=>{
 const x=fixture();const initial=x.state;initial.quotations.queue[0].successor=undefined;x.state=initial;await rename(x);x.writes.length=0;x.online();
 const pending=x.state.quotations.queue[0],latest=quotationData(projectId,310000);latest.flow.revision=5;latest.project.updated_at=newTime;latest.project.project_name='Corrected client';latest.client.name='Corrected client';
 x.network((url,init)=>{
  if(url==='/api/offline?session=1')return Response.json({actor});
  if(init.method==='POST')return Response.json({ok:true,operationId:pending.id,revision:4,flow:{...pending.draft.flow,revision:4}});
  return Response.json(latest,{headers:{'X-Alumex-Actor':actor.id}});
 });
 await x.quotes.syncOfflineQuotations();
 assert.equal(x.state.quotations.queue.length,0);
 for(const write of x.writes){const entry=write.quotations.entries.find(row=>row.projectId===projectId);assert.equal(entry.data.client.name,'Corrected client');assert.equal(entry.data.project.project_name,'Corrected client');}
 assert.equal(x.state.quotations.entries.find(row=>row.projectId===projectId).data.flow.quotation.total,310000);
});

test('older rename responses and account changes cannot overwrite newer or differently owned cache metadata',async()=>{
 const x=fixture();await rename(x);const before=x.state;
 await x.client.updateSavedClientName(actor.id,projectId,'shared-client','Old client',[{id:projectId,project_name:'Old project',updated_at:oldTime},{id:linkedId,project_name:'Old project',updated_at:oldTime}]);
 assert.deepEqual(x.state,before);
 x.store.readStoredFieldState=async()=>{x.switchAccount('different-actor');return before;};
 const writes=x.writes.length;await rename(x);assert.equal(x.writes.length,writes);
});
