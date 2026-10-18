import { normalizeClientCancellation, normalizeMeasurementDelayNote } from '@/lib/measurements/measurementDelay';
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeFollowUp,normalizeMeasurementAssignment } from '@/lib/workflow/followUps';
import { canAccessCRM } from '@/lib/auth/permissions';
import { salesRoles } from '@/lib/workflow/access';
import { normalizeRegistrationOpening,registrationRoomTypes } from '@/lib/measurements/registrationOpening';
import { parseProjectLocation } from '@/lib/location/coordinates';
import type { Json } from '@/lib/supabase/database.types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();
 const profileQuery=admin.from('profiles').select('full_name,username,branch').eq('id',auth.user.id).single();
 const actorFromProfile=(profile:{full_name:string|null;username:string|null;branch:string|null}|null)=>({id:auth.user.id,name:profile?.full_name??profile?.username??'Employee',role:auth.role,branch:auth.role==='Outdoor Sales'?null:profile?.branch??null});
 if(new URL(request.url).searchParams.has('session')){
  const profile=await profileQuery;
  if(profile.error)return NextResponse.json({error:'Unable to load your employee branch.'},{status:503});
  return NextResponse.json({actor:actorFromProfile(profile.data)},{headers:{'Cache-Control':'no-store'}});
 }
 let query=admin.from('projects').select('id,branch,project_number,project_name,address,client_id,structure_readiness,sales_status,status,next_follow_up_at,follow_up_type,follow_up_detail,follow_up_owner_id,project_notes,readiness_note,measurement_delayed,measurement_delay_note,measurement_delayed_at,measurement_delayed_by,client_cancellation_note,client_cancelled_at,client_cancelled_by,created_at,created_by,updated_at,assigned_outdoor_sales_id,measurement_assignment_id,original_creator_role').order('created_at',{ascending:false});
 if(auth.role==='Outdoor Sales')query=query.or(`created_by.eq.${auth.user.id},assigned_outdoor_sales_id.eq.${auth.user.id}`);
 const [profile,projects,directory]=await Promise.all([profileQuery,query,admin.from('profiles').select('id,full_name,username,role').in('role',['Indoor Sales','Outdoor Sales']).eq('is_active',true).eq('status','Active').order('full_name')]);
 if(profile.error)return NextResponse.json({error:'Unable to load your employee branch.'},{status:503});
 const actor=actorFromProfile(profile.data);
 if(projects.error)return NextResponse.json({error:'Unable to download projects.'},{status:500});
 const ids=projects.data.map(p=>p.id);const clientIds=[...new Set(projects.data.map(p=>p.client_id))];
 const peopleIds=[...new Set(projects.data.flatMap(p=>[p.created_by,p.assigned_outdoor_sales_id,p.follow_up_owner_id,p.measurement_delayed_by,p.client_cancelled_by]).filter((id):id is string=>!!id))];
 const [people,openings,clients]=await Promise.all([
  peopleIds.length?admin.from('profiles').select('id,full_name,username').in('id',peopleIds):{data:[],error:null},
  ids.length?admin.from('openings').select('id,project_id,floor,room,width,height,opening_type,opening_direction').in('project_id',ids):{data:[],error:null},
  clientIds.length?admin.from('clients').select('id,mobile').in('id',clientIds):{data:[],error:null}
 ]);
 if(directory.error||people.error)return NextResponse.json({error:'Unable to load employee assignments.'},{status:500});
 if(openings.error||clients.error)return NextResponse.json({error:'Unable to download measurements.'},{status:500});
 const indoorSales=directory.data.filter(p=>p.role==='Indoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const outdoorSales=directory.data.filter(p=>p.role==='Outdoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const employees=new Map((people.data??[]).map(p=>[p.id,p]));
 const contacts=new Map(clients.data.map(c=>[c.id,c.mobile]));
 const name=(id:string|null)=>id?(employees.get(id)?.full_name??employees.get(id)?.username):null;
 return NextResponse.json({actor,outdoorSales,indoorSales,queue:[],syncedAt:null,projects:projects.data.map(p=>({...p,clientCancelledBy:name(p.client_cancelled_by)??null,measurementDelayedBy:name(p.measurement_delayed_by)??null,followUpOwner:name(p.follow_up_owner_id)??null,phone:contacts.get(p.client_id)??null,registeredBy:name(p.created_by)??'Employee',assignedOutdoorSales:name(p.assigned_outdoor_sales_id)??null,assignedToYou:p.assigned_outdoor_sales_id===actor.id,serverUpdatedAt:p.updated_at})),openings:openings.data.map(o=>({id:o.id,projectId:o.project_id,floor:o.floor??'',room:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?o.room:'Other',otherRoom:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?'':o.room??'',width:Number(o.width),height:Number(o.height),structuralType:o.opening_type,openingType:o.opening_direction}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||body.userId!==auth.user.id||!uuid.test(body.id)||!uuid.test(body.projectId)||!body.payload||!Number.isFinite(Date.parse(body.recordedAt)))return NextResponse.json({error:'Invalid saved change or account. Sign in with the employee who recorded this work.'},{status:400});
 if(['follow-up','ready','assign-measurements'].includes(body.action)&&!canAccessCRM(auth.role))return NextResponse.json({error:'CRM access is limited to Indoor Sales and company leadership.'},{status:403});
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
  const assignee=p?.assignedOutdoorSalesId;
  if(assignee && (typeof assignee!=='string'||!uuid.test(assignee)))return NextResponse.json({error:'Choose an Outdoor Sales employee.'},{status:400});
  if(auth.role==='Indoor Sales'&&!assignee)return NextResponse.json({error:'Choose yourself or an Outdoor Sales employee to collect the initial measurements.'},{status:400});
  payload={client:{clientName:name,mobile:phone,clientType:c.clientType,locationLatitude:c.clientType==='company'?company.latitude:null,locationLongitude:c.clientType==='company'?company.longitude:null},project:{...(assignee?{assignedOutdoorSalesId:assignee}:{}),address:address.slice(0,2000)||`${location.latitude}, ${location.longitude}`,locationLatitude:location.latitude,locationLongitude:location.longitude,structureReadiness:p.structureReadiness,readinessNote}};
 }else if(body.action==='opening'){
  const opening=normalizeRegistrationOpening(body.payload);if(!opening)return NextResponse.json({error:'Complete the opening dimensions, floor, room and types.'},{status:400});payload=opening as unknown as Json;
 }else if(body.action==='follow-up'){
  try{payload=normalizeFollowUp(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='assign-measurements'||(body.action==='ready'&&body.payload.assignedOutdoorSalesId!==undefined)){
  try{payload=normalizeMeasurementAssignment(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='cancel-project'){
  try{payload=normalizeClientCancellation(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(body.action==='delay-measurements'){
  try{payload={note:normalizeMeasurementDelayNote(body.payload.note)};}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(!['finish','reopen','ready','resume-measurements'].includes(body.action))return NextResponse.json({error:'Unknown offline action.'},{status:400});
 const result=await createAdminClient().rpc('sync_field_change',{p_operation:body.id,p_actor:auth.user.id,p_project:body.projectId,p_action:body.action,p_payload:payload,p_recorded_at:body.recordedAt,p_expected_updated_at:typeof body.expectedUpdatedAt==='string'?body.expectedUpdatedAt:null});
 return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({project:result.data},{headers:{'Cache-Control':'no-store'}});
}
