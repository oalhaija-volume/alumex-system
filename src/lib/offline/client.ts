import { normalizeRegistrationOpening } from '@/lib/measurements/registrationOpening';
import { activeFieldUser,readFieldState,setFieldUser,updateFieldState } from './store';
import type { FieldChange,FieldProject,FieldState } from './types';
let connectionAvailable=true;
export function isFieldOnline(){return typeof navigator!=="undefined" && navigator.onLine && connectionAvailable;}
function connection(available:boolean){if(connectionAvailable!==available){connectionAvailable=available;window.dispatchEvent(new Event('field-connection'));}}
let initializing:Promise<FieldState>|null=null;
let syncing:Promise<void>|null=null;
export async function prepareOffline():Promise<FieldState>{
 if(initializing)return initializing;
 initializing=(async()=>{
  if(!navigator.onLine){const state=await readFieldState();if(!state)throw new Error('Sign in online once to prepare this device for offline work.');return state;}
  let response:Response;
  try{response=await fetch('/api/offline',{cache:'no-store',signal:AbortSignal.timeout(8000)});connection(true);}catch{connection(false);const cached=await readFieldState();if(cached)return cached;throw new Error('Connect once to prepare this device for offline work.');}
  if(!response.ok){if([401,403].includes(response.status))setFieldUser(null);throw new Error('Sign in with an active sales account to use offline work.');}
  const remote=await response.json() as FieldState;
  const state=await updateFieldState(remote.actor.id,old=>{
   const pending=new Set(old?.queue.map(c=>c.projectId)??[]);
   return {...remote,queue:old?.queue??[],projects:[...remote.projects.filter(p=>!pending.has(p.id)),...(old?.projects.filter(p=>pending.has(p.id))??[])],openings:[...remote.openings.filter(o=>!pending.has(o.projectId)),...(old?.openings.filter(o=>pending.has(o.projectId))??[])],syncedAt:new Date().toISOString()};
  });
  setFieldUser(remote.actor.id);return state;
 })();
 try{return await initializing;}finally{initializing=null;}
}
async function stateForWrite(){let state=await readFieldState();if(!state)state=await prepareOffline();return state;}
export async function syncFieldChanges(){
 if(!navigator.onLine)return;
 if(syncing)return syncing;
 const run=async()=>{
  if(!navigator.onLine)return;
  const id=activeFieldUser();if(!id)return;
  // Verify the currently signed-in account before sending any retained work.
  const session=await fetch('/api/offline?session=1',{cache:'no-store',signal:AbortSignal.timeout(8000)}).catch(()=>null);
  if(!session){connection(false);return;}
  connection(true);
  if(!session.ok){if([401,403].includes(session.status))setFieldUser(null);return;}
  const identity=await session.json();if(identity.actor.id!==id){setFieldUser(null);return;}
  const failed=new Set<string>();
  for(const change of (await readFieldState(id))?.queue??[]){
   if(activeFieldUser()!==id)return;
   if(failed.has(change.projectId))continue;
   const current=await readFieldState(id);const project=current?.projects.find(p=>p.id===change.projectId);
   let response:Response;
   try{response=await fetch('/api/offline',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({...change,expectedUpdatedAt:project?.serverUpdatedAt??project?.updated_at})});}catch{connection(false);return;}
   const result=await response.json().catch(()=>null);
   if(!response.ok){
    if([401,403].includes(response.status)){setFieldUser(null);return;}
    await updateFieldState(id,s=>({...s!,queue:s!.queue.map(c=>c.id===change.id?{...c,error:result?.error??'Unable to sync. Your work is still saved on this device.'}:c)}));
    failed.add(change.projectId);continue;
   }
   await updateFieldState(id,s=>{
    const queue=s!.queue.filter(c=>c.id!==change.id);const stillPending=queue.some(c=>c.projectId===change.projectId);
    return {...s!,queue,projects:s!.projects.map(p=>p.id===change.projectId?{...p,...(!stillPending?result.project:{}),project_number:result.project.project_number,serverUpdatedAt:result.project.updated_at,pending:stillPending}:p),syncedAt:new Date().toISOString()};
   });
  }
 };
 syncing=Promise.resolve('locks' in navigator?navigator.locks.request('alumex-field-sync',run):run()).then(()=>undefined).finally(()=>{syncing=null;});return syncing;
}
export async function saveFieldChange(action:FieldChange['action'],projectId:string,payload:Record<string,unknown>){
 const state=await stateForWrite();const change:FieldChange={id:crypto.randomUUID(),userId:state.actor.id,projectId,action,payload,recordedAt:new Date().toISOString()};
 await updateFieldState(state.actor.id,s=>{
  if(!s)throw new Error('Offline account unavailable.');
  let projects=[...s.projects];const openings=[...s.openings];let p=projects.find(p=>p.id===projectId);
  if(action==='register'){
   const client=payload.client as Record<string,unknown>,project=payload.project as Record<string,unknown>;
   p={id:projectId,project_name:String(client.clientName),project_number:'Pending sync',address:String(project.address??''),phone:String(client.mobile),structure_readiness:String(project.structureReadiness),sales_status:'new_lead',next_follow_up_at:null,project_notes:null,created_at:change.recordedAt,created_by:s.actor.id,registeredBy:s.actor.name,updated_at:change.recordedAt,pending:true};projects.push(p);
  }else{
   if(!p)throw new Error('Open this project online once before working on it offline.');
   if(['opening','finish','reopen'].includes(action)&&!['new_lead','ready_for_quotation'].includes(p.sales_status))throw new Error('Measurements are locked after quotation creation.');
   if(action==='opening'){
    if(p.structure_readiness!=='ready'||p.sales_status!=='new_lead')throw new Error('Reopen measurements before adding an opening.');
    const opening=normalizeRegistrationOpening(payload);if(!opening)throw new Error('Complete the opening details.');
    if(openings.some(o=>o.id===opening.id))return s;
    openings.push({...opening,projectId});
   }
   if(action==='finish'){if(!openings.some(o=>o.projectId===projectId))throw new Error('Save at least one opening first.');p={...p,sales_status:'ready_for_quotation'};}
   if(action==='reopen')p={...p,sales_status:'new_lead'};
   if(action==='ready')p={...p,structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null};
   if(action==='follow-up')p={...p,next_follow_up_at:String(payload.nextFollowUp),project_notes:String(payload.note??'')};
   projects=projects.map(row=>row.id===projectId?{...p!,pending:true}:row);
  }
  return {...s,projects,openings,queue:[...s.queue,change]};
 });
 // Local durability is the save boundary. Network synchronization may finish later.
 void syncFieldChanges().catch(()=>{});
 return {projectId,pending:true};
}
export async function fieldFetch(url:string,init?:RequestInit):Promise<Response>{
 const method=init?.method??'GET';
 if(method==='GET'){
  const s=await readFieldState();const id=url.split('/').pop();
  const pending=s?.queue.some(c=>url==='/api/workspace'||c.projectId===id);
  if(!pending && navigator.onLine){try{
   const response=await fetch(url,init);connection(true);
   if(response.ok){
    const data=await response.clone().json();
    if(s && url!=='/api/workspace' && data.project && data.openings)await updateFieldState(s.actor.id,old=>old?.queue.some(c=>c.projectId===id)?old:{...old!,projects:old!.projects.map(p=>p.id===id?{...p,...data.project}:p),openings:[...old!.openings.filter(o=>o.projectId!==id),...data.openings.map((o:Record<string,unknown>)=>({...o,projectId:id}))]});
    return response;
   }
   if(response.status<500)return response;
  }catch{connection(false);/* Read the last saved local copy below. */}}
  if(!s)return Response.json({error:'Open this workspace online once before working offline.'},{status:503});
  if(url==='/api/workspace')return Response.json({projects:s.projects});
  const p=s.projects.find(p=>p.id===id);
  return p?Response.json({project:p,openings:s.openings.filter(o=>o.projectId===id)}):Response.json({error:'This project is not downloaded on this device.'},{status:404});
 }
 try{
  const body=JSON.parse(String(init?.body??'{}')) as Record<string,unknown>;
  if(url==='/api/sales-intake'){const projectId=crypto.randomUUID();await saveFieldChange('register',projectId,body);if(isFieldOnline())await syncFieldChanges();const pending=(await readFieldState())?.queue.some(c=>c.projectId===projectId)??true;return Response.json({projectId,pending},{status:201});}
  const projectId=url==='/api/workspace'?String(body.projectId):url.split('/').pop()!;
  const action=method==='POST'?'opening':String(body.action) as FieldChange['action'];
  await saveFieldChange(action,projectId,body);
  return Response.json({id:body.id,ok:true,pending:true,salesStatus:action==='finish'?'ready_for_quotation':'new_lead'},{status:method==='POST'?201:200});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to save on this device.'},{status:400});}
}
export async function pendingFieldChanges(){return (await readFieldState())?.queue.length??0;}
export type {FieldProject};

export async function reviewServerProject(projectId:string){
 const response=await fetch('/api/offline',{cache:'no-store'});if(!response.ok)throw new Error('Connect and sign in to review the latest version.');
 const data=await response.json() as FieldState;if(data.actor.id!==activeFieldUser())throw new Error('Sign in with the employee who saved this work.');
 const project=data.projects.find(p=>p.id===projectId);if(!project)throw new Error('Project no longer available. Your saved work remains on this device.');
 return {project,openings:data.openings.filter(o=>o.projectId===projectId)};
}
export async function retryReviewedProject(projectId:string,updatedAt:string){
 const id=activeFieldUser();if(!id)return;
 await updateFieldState(id,s=>({...s!,projects:s!.projects.map(p=>p.id===projectId?{...p,serverUpdatedAt:updatedAt}:p),queue:s!.queue.map(c=>c.projectId===projectId?{...c,error:undefined}:c)}));await syncFieldChanges();
}

export async function keepReviewedServerVersion(review:Awaited<ReturnType<typeof reviewServerProject>>){
 const id=activeFieldUser();if(!id)throw new Error('Sign in before resolving saved work.');
 await updateFieldState(id,s=>({...s!,queue:s!.queue.filter(c=>c.projectId!==review.project.id),projects:s!.projects.map(p=>p.id===review.project.id?{...review.project,pending:false}:p),openings:[...s!.openings.filter(o=>o.projectId!==review.project.id),...review.openings]}));
}

export async function deleteOnlineProject(projectId:string){
 if(!isFieldOnline())throw new Error('Connect to the internet before deleting a project.');
 const state=await readFieldState();
 if(state?.queue.some(change=>change.projectId===projectId))throw new Error('Sync this project’s saved changes before deleting it.');
 const response=await fetch('/api/workspace',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,confirmed:true})});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'Unable to delete project.');
 const id=activeFieldUser();
 if(state&&id===state.actor.id)await updateFieldState(id,s=>({...s!,projects:s!.projects.filter(p=>p.id!==projectId),openings:s!.openings.filter(o=>o.projectId!==projectId)}));
 return result as {ok:boolean;cleanupPending:boolean};
}
