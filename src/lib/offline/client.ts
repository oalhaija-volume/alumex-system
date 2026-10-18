import {normalizeMeasurementCompletion,retainMeasurementReport} from '@/lib/measurements/completion';
import { normalizeBuildingType } from '@/lib/intake/buildingType';
import { canCancelProject, normalizeClientCancellation, canDelayMeasurements, canResumeMeasurements, normalizeMeasurementDelayNote } from '@/lib/measurements/measurementDelay';
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';
import { canAccessCRM } from '@/lib/auth/permissions';
import { normalizeFollowUp,type FollowUpInput } from '@/lib/workflow/followUps';
import { needsSalesFollowUp } from '@/lib/workflow/stages';
import { normalizeOpeningEdit, sameOpeningMeasurements, normalizeRegistrationOpening, type RegistrationOpening } from '@/lib/measurements/registrationOpening';
import { activeFieldUser,readFieldState,setFieldUser,updateFieldState } from './store';
import type { FieldChange,FieldProject,FieldState } from './types';
// Captures are immutable after save. Keep downloaded media when refreshing lightweight metadata.
export function retainSkylightCapture<T extends RegistrationOpening & {projectId:string}>(opening:T,cached:FieldState['openings']):T {
 const previous=cached.find(o=>o.id===opening.id&&o.projectId===opening.projectId);
 return {...opening,...(opening.hasSkylightCapture&&previous?.skylight?{skylight:previous.skylight}:{}),...(opening.hasCurtainWallCapture&&previous?.curtainWall?{curtainWall:previous.curtainWall}:{})};
}
export function isDeviceWorkspace(){return typeof window!=='undefined'&&window.location?.pathname==='/offline';}
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
  if(!response.ok){if([401,403].includes(response.status))setFieldUser(null);else if(response.status>=500){connection(false);const cached=await readFieldState();if(cached)return cached;}throw new Error('Sign in with an active sales account to use offline work.');}
  const remote=await response.json() as FieldState;
  const state=await updateFieldState(remote.actor.id,old=>{
   const pending=new Set(old?.queue.map(c=>c.projectId)??[]);
   return {...remote,measurementReports:[...(remote.measurementReports??[]).filter(r=>!pending.has(r.project_id)).map(r=>retainMeasurementReport(r,old?.measurementReports??[])),...(old?.measurementReports??[]).filter(r=>pending.has(r.project_id))],followUpHistories:canAccessCRM(remote.actor.role)?Object.fromEntries(Object.entries(old?.followUpHistories??{}).filter(([id])=>remote.projects.some(p=>p.id===id)||pending.has(id))):{},queue:old?.queue??[],projects:[...remote.projects.filter(p=>!pending.has(p.id)),...(old?.projects.filter(p=>pending.has(p.id))??[])],openings:[...remote.openings.filter(o=>!pending.has(o.projectId)).map(o=>retainSkylightCapture(o,old?.openings??[])),...(old?.openings.filter(o=>pending.has(o.projectId))??[])],syncedAt:new Date().toISOString()};
  },'snapshot');
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
  if(!(await readFieldState(id))?.queue.length)return;
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
   if(['follow-up','ready','assign-measurements','request-openings'].includes(change.action)&&!canAccessCRM(identity.actor.role)){await updateFieldState(id,s=>({...s!,queue:s!.queue.map(c=>c.id===change.id?{...c,error:'CRM access is limited to Indoor Sales and company leadership.'}:c)}));failed.add(change.projectId);continue;}
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
 const state=await stateForWrite();if(['follow-up','ready','assign-measurements','request-openings'].includes(action)&&!canAccessCRM(state.actor.role))throw new Error('CRM access is limited to Indoor Sales and company leadership.');if(action==='follow-up')payload=normalizeFollowUp(payload);if(action==='finish')payload=normalizeMeasurementCompletion(payload);const change:FieldChange={id:crypto.randomUUID(),userId:state.actor.id,projectId,action,payload,recordedAt:new Date().toISOString()};
 await updateFieldState(state.actor.id,s=>{
  if(!s)throw new Error('Offline account unavailable.');
  const measurementReports=[...(s.measurementReports??[])];let projects=[...s.projects];const openings=[...s.openings];let p=projects.find(p=>p.id===projectId);
  if(action==='register'){
   const client=payload.client as Record<string,unknown>,project=payload.project as Record<string,unknown>;
   const buildingType=normalizeBuildingType(project.buildingType,s.actor.role==='Outdoor Sales');
   const readinessNote=normalizeReadinessNote(s.actor.role,project.structureReadiness,project.readinessNote);
   const assigned=typeof project.assignedOutdoorSalesId==='string'?project.assignedOutdoorSalesId:'';
   if(s.actor.role==='Indoor Sales'&&!s.actor.branch)throw new Error('Ask Admin to assign your Karkh or Rasafa branch before creating a project.');
   const selfAssigned=s.actor.role==='Indoor Sales'&&assigned===s.actor.id;
   if(s.actor.role==='Indoor Sales'&&!assigned)throw new Error('Choose yourself or an Outdoor Sales employee to collect the initial measurements.');
   if(assigned&&!selfAssigned&&!s.outdoorSales?.some(e=>e.id===assigned))throw new Error('Choose an Outdoor Sales employee from the list. Connect online to refresh employees.');
   p={building_type:buildingType,branch:s.actor.role==='Indoor Sales'?s.actor.branch:null,assigned_outdoor_sales_id:assigned||null,assignedOutdoorSales:selfAssigned?s.actor.name:s.outdoorSales?.find(e=>e.id===assigned)?.name??null,assignedToYou:assigned===s.actor.id,original_creator_role:s.actor.role,id:projectId,project_name:String(client.clientName),project_number:'Pending sync',address:String(project.address??''),phone:String(client.mobile),structure_readiness:String(project.structureReadiness),sales_status:'new_lead',next_follow_up_at:null,follow_up_type:null,follow_up_detail:null,follow_up_owner_id:s.actor.role==='Indoor Sales'?s.actor.id:null,followUpOwner:s.actor.role==='Indoor Sales'?s.actor.name:null,project_notes:null,readiness_note:readinessNote,created_at:change.recordedAt,created_by:s.actor.id,registeredBy:s.actor.name,updated_at:change.recordedAt,pending:true};projects.push(p);
  }else{
   if(!p)throw new Error('Open this project online once before working on it offline.');
   if(p.additional_openings_state && ['opening','edit-opening','finish','reopen'].includes(action)){
    if(p.additional_openings_state!=='requested')throw new Error('Ask Indoor Sales to assign another additional-openings task.');
    if(s.actor.role==='Outdoor Sales'&&p.assigned_outdoor_sales_id!==s.actor.id)throw new Error('Only the assigned employee can complete this task.');
    if(action==='edit-opening'&&p.additional_openings_original_ids?.includes(String((payload.opening as Record<string,unknown>)?.id)))throw new Error('Existing measurements are preserved. Add the new openings separately.');
    if(action==='finish'&&!openings.some(o=>o.projectId===projectId&&!p!.additional_openings_original_ids?.includes(o.id)))throw new Error('Add at least one new opening before submitting this task.');
   }
   if(action==='request-openings'){
    if(!['ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'].includes(p.sales_status)||p.structure_readiness!=='ready')throw new Error('Additional openings can only be requested after measurements and before signing.');
    const employee=s.outdoorSales?.find(e=>e.id===payload.assignedOutdoorSalesId);
    if(!employee)throw new Error('Choose an active Outdoor Sales employee.');
    p={...p,additional_openings_state:'requested',additional_openings_original_ids:openings.filter(o=>o.projectId===projectId).map(o=>o.id),sales_status:'new_lead',measurement_delayed:false,assigned_outdoor_sales_id:employee.id,assignedOutdoorSales:employee.name,assignedToYou:employee.id===s.actor.id,measurement_assignment_id:change.id};
   }
   if(['opening','edit-opening','finish','reopen'].includes(action)&&p.measurement_delayed)throw new Error('Resume measurements before recording or completing them.');
   if(['opening','edit-opening','finish','reopen'].includes(action)&&!['new_lead','ready_for_quotation'].includes(p.sales_status))throw new Error('Measurements are locked after quotation creation.');
   if(action==='cancel-project'){
    if(!canCancelProject(p,s.actor))throw new Error('This project cannot be cancelled by this employee at its current stage.');
    const cancellation=normalizeClientCancellation(payload);change.payload=cancellation;
    p={...p,sales_status:'cancelled',measurement_delayed:false,client_cancellation_note:cancellation.note,client_cancelled_at:change.recordedAt,client_cancelled_by:s.actor.id,clientCancelledBy:s.actor.name,next_follow_up_at:null};
   }
   if(action==='delay-measurements'||action==='resume-measurements'){
    if(!(action==='delay-measurements'?canDelayMeasurements(p,s.actor):canResumeMeasurements(p,s.actor)))throw new Error('Only the assigned Outdoor Sales employee can report a client delay.');
    if(p.structure_readiness!=='ready'||p.sales_status!=='new_lead')throw new Error('Client delays can only be recorded before measurements are completed.');
    if(action==='delay-measurements'){
     if(p.measurement_delayed)throw new Error('This project is already delayed by the client.');
     const note=normalizeMeasurementDelayNote(payload.note);change.payload={note};
     p={...p,next_follow_up_at:null,follow_up_type:null,follow_up_detail:null,measurement_delayed:true,measurement_delay_note:note,measurement_delayed_at:change.recordedAt,measurement_delayed_by:s.actor.id,measurementDelayedBy:s.actor.name};
    }else{
     if(!p.measurement_delayed)throw new Error('This project is not delayed by the client.');
     p={...p,measurement_delayed:false};
    }
   }
   if(action==='opening'){
    if(p.structure_readiness!=='ready'||p.sales_status!=='new_lead')throw new Error('Reopen measurements before adding an opening.');
    const opening=normalizeRegistrationOpening(payload);if(!opening)throw new Error('Complete the opening details.');
    if(openings.some(o=>o.id===opening.id))return s;
    openings.push({...opening,projectId});
   }
   if(action==='edit-opening'){
    if(p.structure_readiness!=='ready'||p.sales_status!=='new_lead')throw new Error('Reopen measurements before editing an opening.');
    if(!canAccessCRM(s.actor.role)&&!(s.actor.role==='Outdoor Sales'&&(p.created_by===s.actor.id||p.assigned_outdoor_sales_id===s.actor.id)))throw new Error('Project is not available to this employee');
    const edit=normalizeOpeningEdit(payload);if(!edit)throw new Error('Complete the opening details.');
    const index=openings.findIndex(o=>o.id===edit.opening.id&&o.projectId===projectId);
    if(index<0)throw new Error('Opening not found in this project.');
    const existing=openings[index];
    if(!sameOpeningMeasurements(existing,edit.previous))throw new Error('This opening changed on another device. Reload measurements before editing it again.');
    if((existing.hasCurtainWallCapture||existing.curtainWall)&&edit.opening.structuralType!=='Curtain Wall')throw new Error('A saved Curtain Wall photo and note must remain attached to a Curtain Wall.');
    if((existing.hasSkylightCapture||existing.skylight)&&edit.opening.structuralType!=='Skylight')throw new Error('A saved skylight shape must remain attached to a skylight.');
    openings[index]={...existing,...edit.opening};change.payload=edit;
   }
   if(action==='finish'){if(!openings.some(o=>o.projectId===projectId))throw new Error('Save at least one opening first.');if(payload.note||payload.photo)measurementReports.push({id:change.id,project_id:projectId,note:String(payload.note),photo:String(payload.photo)||null,has_photo:!!payload.photo,recorded_by:s.actor.id,recorded_by_name:s.actor.name,recorded_at:change.recordedAt});p={...p,sales_status:'ready_for_quotation',...(p.additional_openings_state==='requested'?{additional_openings_state:'submitted' as const}:{})};}
   if(action==='reopen')p={...p,sales_status:'new_lead'};
   if(action==='ready'||action==='assign-measurements'){
    if(p.sales_status!=='new_lead'||(action==='assign-measurements'&&p.structure_readiness!=='ready'))throw new Error('Measurement assignment is only available before measurements are completed.');
    const id=payload.assignedOutdoorSalesId??p.assigned_outdoor_sales_id;const employee=s.outdoorSales?.find(e=>e.id===id)??(p.original_creator_role==='Indoor Sales'&&id===p.created_by?s.indoorSales?.find(e=>e.id===id):undefined);
    if(!employee)throw new Error('Choose an eligible employee for measurements.');
    change.payload={...payload,assignedOutdoorSalesId:employee.id};
    p={...p,measurement_delayed:false,assigned_outdoor_sales_id:employee.id,assignedOutdoorSales:employee.name,assignedToYou:employee.id===s.actor.id,measurement_assignment_id:change.id};
   }
   if(action==='ready'){if(p.structure_readiness!=='not_ready'||p.sales_status!=='new_lead')throw new Error('This project has already moved beyond site readiness.');p={...p,structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null,follow_up_owner_id:p.follow_up_owner_id??(s.actor.role==='Indoor Sales'?s.actor.id:null),followUpOwner:p.followUpOwner??(s.actor.role==='Indoor Sales'?s.actor.name:null)};}
   if(action==='follow-up'&&!needsSalesFollowUp(p))throw new Error('Sales follow-up is complete for this project.');
   if(action==='follow-up'){
    const owner=s.indoorSales?.find(e=>e.id===payload.followUpOwnerId);
    if(!owner)throw new Error('Choose an Indoor Sales employee from the list. Connect online to refresh employees.');
    p={...p,next_follow_up_at:String(payload.nextFollowUp),project_notes:String(payload.note??''),follow_up_type:String(payload.followUpType),follow_up_detail:String(payload.followUpDetail),follow_up_owner_id:owner.id,followUpOwner:owner.name};
   }
   projects=projects.map(row=>row.id===projectId?{...p!,pending:true}:row);
  }
  return {...s,measurementReports,projects,openings,queue:[...s.queue,change]};
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
  // This explicit device workspace already owns an account-scoped snapshot.
  // OfflineStatus refreshes it in the background; reads need no second API call.
  const savedProject=s?.projects.find(p=>p.id===id);
  const useSaved=isDeviceWorkspace()&&s&&(url==='/api/workspace'||savedProject);
  if(!useSaved && !pending && isFieldOnline()){
   const controller=new AbortController();
   const abort=()=>controller.abort();
   const timeout=setTimeout(abort,8000);
   init?.signal?.addEventListener('abort',abort,{once:true});
   if(init?.signal?.aborted)abort();
   try{
   const response=await fetch(url,{...init,signal:controller.signal});connection(true);
   if(response.ok){
    const data=await response.clone().json();
    if(s && url!=='/api/workspace' && data.project && data.openings)await updateFieldState(s.actor.id,old=>old?.queue.some(c=>c.projectId===id)?old:{...old!,projects:old!.projects.map(p=>p.id===id?{...p,...data.project}:p),openings:[...old!.openings.filter(o=>o.projectId!==id),...data.openings.map((o:RegistrationOpening)=>retainSkylightCapture({...o,projectId:id!},old!.openings))]});
    return response;
   }
   if(response.status<500)return response;
   }catch{if(init?.signal?.aborted)throw new DOMException('Request cancelled','AbortError');connection(false);/* Read the last saved local copy below. */}
   finally{clearTimeout(timeout);init?.signal?.removeEventListener('abort',abort);}
  }
  if(!s)return Response.json({error:'Open this workspace online once before working offline.'},{status:503});
  if(url==='/api/workspace')return Response.json({actor:s.actor,outdoorSales:s.outdoorSales??[],indoorSales:s.indoorSales??[],projects:s.projects});
  const p=s.projects.find(p=>p.id===id);
  return p?Response.json({project:p,canCancelProject:canCancelProject(p,s.actor),canDelayMeasurements:canDelayMeasurements(p,s.actor),canResumeMeasurements:canResumeMeasurements(p,s.actor),openings:s.openings.filter(o=>o.projectId===id)}):Response.json({error:'This project is not downloaded on this device.'},{status:404});
 }
 try{
  const body=JSON.parse(String(init?.body??'{}')) as Record<string,unknown>;
  if(url==='/api/sales-intake'){const projectId=crypto.randomUUID();await saveFieldChange('register',projectId,body);if(isFieldOnline()&&!isDeviceWorkspace())await syncFieldChanges();const pending=(await readFieldState())?.queue.some(c=>c.projectId===projectId)??true;return Response.json({projectId,pending},{status:201});}
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
 return {project,openings:data.openings.filter(o=>o.projectId===projectId),measurementReports:(data.measurementReports??[]).filter(r=>r.project_id===projectId)};
}
export async function retryReviewedProject(projectId:string,updatedAt:string,correction?:{changeId:string;values:FollowUpInput}){
 const id=activeFieldUser();if(!id)return;
 const corrected=correction?normalizeFollowUp(correction.values):null;
 await updateFieldState(id,s=>{
  if(!s)throw new Error('Offline account unavailable.');
  if(corrected&&!canAccessCRM(s.actor.role))throw new Error('CRM access is limited to Indoor Sales and company leadership.');
  if(corrected&&!s.indoorSales?.some(e=>e.id===corrected.followUpOwnerId))throw new Error('Choose an Indoor Sales employee from the list. Connect online to refresh employees.');
  const queue=s.queue.map(c=>c.projectId===projectId?{...c,error:undefined,...(corrected&&c.id===correction?.changeId&&c.action==='follow-up'?{id:crypto.randomUUID(),payload:corrected}:{})}:c);
  const latest=queue.filter(c=>c.projectId===projectId&&c.action==='follow-up').at(-1)?.payload;
  return {...s,queue,projects:s.projects.map(p=>p.id===projectId?{...p,serverUpdatedAt:updatedAt,...(corrected&&latest?{next_follow_up_at:String(latest.nextFollowUp),project_notes:String(latest.note??''),follow_up_type:String(latest.followUpType??''),follow_up_detail:String(latest.followUpDetail??''),follow_up_owner_id:String(latest.followUpOwnerId??''),followUpOwner:s.indoorSales?.find(e=>e.id===latest.followUpOwnerId)?.name??null}:{})}:p)};
 });
 await syncFieldChanges();
}

export async function keepReviewedServerVersion(review:Awaited<ReturnType<typeof reviewServerProject>>){
 const id=activeFieldUser();if(!id)throw new Error('Sign in before resolving saved work.');
 await updateFieldState(id,s=>({...s!,measurementReports:[...(s!.measurementReports??[]).filter(r=>r.project_id!==review.project.id),...review.measurementReports.map(r=>retainMeasurementReport(r,s!.measurementReports??[]))],queue:s!.queue.filter(c=>c.projectId!==review.project.id),projects:s!.projects.map(p=>p.id===review.project.id?{...review.project,pending:false}:p),openings:[...s!.openings.filter(o=>o.projectId!==review.project.id),...review.openings.map(o=>retainSkylightCapture(o,s!.openings))]}));
}

export async function deleteOnlineProject(projectId:string){
 if(!isFieldOnline())throw new Error('Connect to the internet before deleting a project.');
 const state=await readFieldState();
 if(state?.queue.some(change=>change.projectId===projectId))throw new Error('Sync this project’s saved changes before deleting it.');
 const response=await fetch('/api/workspace',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,confirmed:true})});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'Unable to delete project.');
 const id=activeFieldUser();
 if(state&&id===state.actor.id)await updateFieldState(id,s=>({...s!,measurementReports:(s!.measurementReports??[]).filter(r=>r.project_id!==projectId),followUpHistories:Object.fromEntries(Object.entries(s!.followUpHistories??{}).filter(([key])=>key!==projectId)),projects:s!.projects.filter(p=>p.id!==projectId),openings:s!.openings.filter(o=>o.projectId!==projectId)}));
 return result as {ok:boolean;cleanupPending:boolean};
}
