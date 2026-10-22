import { isHistoricalProject, loadMeasurementAttempts, loadWorkspaceProjects } from '@/lib/measurements/visitHistory';
import { normalizeProjectBranch,normalizeProjectGovernorate } from '@/lib/intake/projectBranch';
import {normalizeMeasurementCompletion} from '@/lib/measurements/completion';
import { normalizeBuildingType } from '@/lib/intake/buildingType';
import { normalizeClientCancellation, normalizeMeasurementDelay } from '@/lib/measurements/measurementDelay';
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeFollowUp,normalizeMeasurementAssignment } from '@/lib/workflow/followUps';
import { canAccessCRM } from '@/lib/auth/permissions';
import { canAccessProjectBranch } from '@/lib/auth/projectBranchAccess';
import { salesRoles } from '@/lib/workflow/access';
import { normalizeOpeningEdit,normalizeRegistrationOpening,registrationRoomTypes } from '@/lib/measurements/registrationOpening';
import { parseProjectLocation } from '@/lib/location/coordinates';
import type { Json } from '@/lib/supabase/database.types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();
 const profileQuery=admin.from('profiles').select('full_name,username,branch,outdoor_rotation_start_branch').eq('id',auth.user.id).single();
 const actorFromProfile=(profile:{full_name:string|null;username:string|null;branch:string|null;outdoor_rotation_start_branch:string|null}|null)=>({id:auth.user.id,name:profile?.full_name??profile?.username??'Employee',role:auth.role,branch:auth.role==='Outdoor Sales'?null:profile?.branch??null,outdoorRotationStartBranch:auth.role==='Outdoor Sales'?profile?.outdoor_rotation_start_branch??null:null});
 if(new URL(request.url).searchParams.has('session')){
  const profile=await profileQuery;
  if(profile.error)return NextResponse.json({error:'Unable to load your employee branch.'},{status:503});
  return NextResponse.json({actor:actorFromProfile(profile.data)},{headers:{'Cache-Control':'no-store'}});
 }
 const [profile,projects,directory]=await Promise.all([profileQuery,loadWorkspaceProjects(admin,{id:auth.user.id,role:auth.role,branch:auth.profile?.branch}),admin.from('profiles').select('id,full_name,username,role').in('role',['Indoor Sales', 'Sales Manager','Outdoor Sales']).eq('is_active',true).eq('status','Active').order('full_name')]);
 if(profile.error)return NextResponse.json({error:'Unable to load your employee branch.'},{status:503});
 const actor=actorFromProfile(profile.data);
 if(projects.error)return NextResponse.json({error:'Unable to download projects.'},{status:500});
 // A branch may have changed between authentication and the profile refresh.
 // Only download projects allowed by both snapshots of the employee profile.
 projects.data=projects.data.filter(project=>canAccessProjectBranch(actor,project.branch));
 const ids=projects.data.filter(p=>!isHistoricalProject(p,actor)).map(p=>p.id);const clientIds=[...new Set(projects.data.map(p=>p.client_id))];
 const peopleIds=[...new Set(projects.data.flatMap(p=>[p.created_by,p.assigned_outdoor_sales_id,p.follow_up_owner_id,p.measurement_delayed_by,p.client_cancelled_by]).filter((id):id is string=>!!id))];
 const [people,openings,clients,reports,attempts]=await Promise.all([
  peopleIds.length?admin.from('profiles').select('id,full_name,username').in('id',peopleIds):{data:[],error:null},
  ids.length?admin.from('openings').select('id,project_id,floor,room,width,height,quantity,work_area,facade_number,has_curtain_wall_capture,has_skylight_capture,has_arch,has_roller_shutter,opening_type,opening_direction').in('project_id',ids):{data:[],error:null},
  clientIds.length?admin.from('clients').select('id,mobile').in('id',clientIds):{data:[],error:null},
  ids.length?admin.from('measurement_completion_reports').select('id,project_id,note,has_photo,recorded_by,recorded_by_name,recorded_at').in('project_id',ids):{data:[],error:null},
  loadMeasurementAttempts(admin,projects.data.map(project=>project.id))
 ]);
 if(attempts.error)return NextResponse.json({error:'Unable to load visit history.'},{status:500});
 if(directory.error||people.error)return NextResponse.json({error:'Unable to load employee assignments.'},{status:500});
 if(openings.error||clients.error||reports.error)return NextResponse.json({error:'Unable to download measurements.'},{status:500});
 const indoorSales=directory.data.filter(p=>(p.role === 'Indoor Sales' || p.role === 'Sales Manager')).map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const outdoorSales=directory.data.filter(p=>p.role==='Outdoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const employees=new Map((people.data??[]).map(p=>[p.id,p]));
 const contacts=new Map(clients.data.map(c=>[c.id,c.mobile]));
 const name=(id:string|null)=>id?(employees.get(id)?.full_name??employees.get(id)?.username):null;
 return NextResponse.json({measurementReports:reports.data??[],actor,outdoorSales,indoorSales,queue:[],syncedAt:null,projects:projects.data.map(p=>({...p,project_log_only:isHistoricalProject(p,actor),measurement_attempts:attempts.data?.get(p.id)??[],clientCancelledBy:name(p.client_cancelled_by)??null,measurementDelayedBy:name(p.measurement_delayed_by)??null,followUpOwner:name(p.follow_up_owner_id)??null,phone:contacts.get(p.client_id)??null,registeredBy:name(p.created_by)??'Employee',assignedOutdoorSales:name(p.assigned_outdoor_sales_id)??null,assignedToYou:p.assigned_outdoor_sales_id===actor.id,serverUpdatedAt:p.updated_at})),openings:openings.data.map(o=>({id:o.id,projectId:o.project_id,floor:o.floor??'',room:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?o.room:'Other',otherRoom:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?'':o.room??'',width:Number(o.width),height:Number(o.height),quantity:o.quantity,hasArch:o.has_arch,hasRollerShutter:o.has_roller_shutter,...( o.work_area?{workArea:o.work_area,...(o.work_area==='facade'?{facadeNumber:o.facade_number}:{})}:{}),hasCurtainWallCapture:o.has_curtain_wall_capture,hasSkylightCapture:o.has_skylight_capture,structuralType:o.opening_type,openingType:o.opening_direction}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||body.userId!==auth.user.id||!uuid.test(body.id)||!uuid.test(body.projectId)||!body.payload||!Number.isFinite(Date.parse(body.recordedAt)))return NextResponse.json({error:'Invalid saved change or account. Sign in with the employee who recorded this work.'},{status:400});
 if(['follow-up','ready','assign-measurements','request-openings'].includes(body.action)&&!canAccessCRM(auth.role))return NextResponse.json({error:'CRM access is limited to Indoor Sales and company leadership.'},{status:403});
 let payload:Json={};
 if(body.action==='register'){
  const c=body.payload.client,p=body.payload.project;
  const name=typeof c?.clientName==='string'?c.clientName.trim():'';const phone=typeof c?.mobile==='string'?c.mobile.trim():'';
  const location=parseProjectLocation(p?.locationLatitude,p?.locationLongitude);const company=parseProjectLocation(c?.locationLatitude,c?.locationLongitude);
  const address=typeof p?.address==='string'?p.address.trim():'';
  const addressOnly=auth.role==='Outdoor Sales'&&p?.locationLatitude==null&&p?.locationLongitude==null;
  if(addressOnly&&(!address||address.length>2000))return NextResponse.json({error:'Enter the project site address.'},{status:400});
  if(!name||name.length>150||!phone||phone.length>80||!['individual','company'].includes(c?.clientType)||!['ready','not_ready'].includes(p?.structureReadiness)||(!location.isValid&&!addressOnly))return NextResponse.json({error:'Complete the client, phone, locations and site readiness.'},{status:400});
  let readinessNote:string|null;
  try{readinessNote=normalizeReadinessNote(auth.role,p.structureReadiness,p.readinessNote);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  // Older installed clients can still deliver previously queued registrations without this field.
  let buildingType;
  try{buildingType=normalizeBuildingType(p.buildingType,auth.role==='Outdoor Sales'&&p.buildingType!==undefined);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  // Retain compatibility with registrations already saved by older installed clients.
  let branch;
  if(auth.role==='Outdoor Sales'&&p.branch!==undefined){try{branch=normalizeProjectBranch(p.branch);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}}
  let governorate;
  try{governorate=normalizeProjectGovernorate(branch,p.governorate);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  const assignee=p?.assignedOutdoorSalesId;
  if(assignee && (typeof assignee!=='string'||!uuid.test(assignee)))return NextResponse.json({error:'Choose an Outdoor Sales employee.'},{status:400});
  if((auth.role === 'Indoor Sales' || auth.role === 'Sales Manager')&&!assignee)return NextResponse.json({error:'Choose yourself or an Outdoor Sales employee to collect the initial measurements.'},{status:400});
  payload={client:{clientName:name,mobile:phone,clientType:c.clientType,locationLatitude:c.clientType==='company'?company.latitude:null,locationLongitude:c.clientType==='company'?company.longitude:null},project:{...(branch?{branch}:{}),...(governorate?{governorate}:{}),...(p.buildingType===undefined?{}:{buildingType}),...(assignee?{assignedOutdoorSalesId:assignee}:{}),address:address.slice(0,2000)||`${location.latitude}, ${location.longitude}`,locationLatitude:location.latitude,locationLongitude:location.longitude,structureReadiness:p.structureReadiness,readinessNote}};
 }else if(body.action==='finish'){
  try{payload=body.payload.note===undefined&&body.payload.photo===undefined?{}:normalizeMeasurementCompletion(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='opening'){
  const opening=normalizeRegistrationOpening(body.payload);if(!opening)return NextResponse.json({error:'Complete the opening dimensions, floor, room and types.'},{status:400});payload=opening as unknown as Json;
 }else if(body.action==='edit-opening'){
  const edit=normalizeOpeningEdit(body.payload);if(!edit)return NextResponse.json({error:'Complete the opening details.'},{status:400});payload=edit as unknown as Json;
 }else if(body.action==='follow-up'){
  try{payload=normalizeFollowUp(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='request-openings'||body.action==='assign-measurements'||(body.action==='ready'&&body.payload.assignedOutdoorSalesId!==undefined)){
  try{payload=normalizeMeasurementAssignment(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='cancel-project'){
  try{payload=normalizeClientCancellation(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='delay-measurements'){
  try{payload=normalizeMeasurementDelay(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(!['finish','reopen','ready','resume-measurements'].includes(body.action))return NextResponse.json({error:'Unknown offline action.'},{status:400});
 const admin=createAdminClient();
 if(auth.role==='Indoor Sales'){
  const project=await admin.from('projects').select('branch').eq('id',body.projectId).maybeSingle();
  if(project.error)return NextResponse.json({error:'Unable to verify project access.'},{status:503});
  if(project.data&&!canAccessProjectBranch({role:auth.role,branch:auth.profile?.branch},project.data.branch))return NextResponse.json({error:'Project not found.'},{status:404});
 }
 const result=await admin.rpc('sync_field_change',{p_operation:body.id,p_actor:auth.user.id,p_project:body.projectId,p_action:body.action,p_payload:payload,p_recorded_at:body.recordedAt,p_expected_updated_at:typeof body.expectedUpdatedAt==='string'?body.expectedUpdatedAt:null});
 if(result.error&&['Project is not available to this employee','This project was deleted. Its saved offline work cannot be synced.'].includes(result.error.message)){
  // A missing project may have been deleted while the employee was offline.
  // Confirm deletion and the employee's former access before disclosing it.
  let deletion=admin.from('audit_events').select('id').eq('action','project_deleted').eq('entity_type','project').eq('entity_id',body.projectId);
  if(!canAccessCRM(auth.role))deletion=deletion.or(`previous_value->>created_by.eq.${auth.user.id},previous_value->>assigned_outdoor_sales_id.eq.${auth.user.id}`);
  if(auth.role==='Indoor Sales')deletion=['Karkh','Rasafa'].includes(auth.profile?.branch??'')?deletion.in('previous_value->>branch',[auth.profile!.branch!,'Governorates']):deletion.eq('previous_value->>branch','');
  const archived=await deletion.limit(1).maybeSingle();
  if(!archived.error&&archived.data)return NextResponse.json({code:'project_deleted',error:'This project was deleted by an Admin. Saved work cannot be synced and will be kept on this device.'},{status:410,headers:{'Cache-Control':'no-store'}});
 }
 return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({project:result.data},{headers:{'Cache-Control':'no-store'}});
}
