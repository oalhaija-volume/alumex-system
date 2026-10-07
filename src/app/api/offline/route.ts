import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeFollowUp } from '@/lib/workflow/followUps';
import { salesRoles } from '@/lib/workflow/access';
import { normalizeRegistrationOpening,registrationRoomTypes } from '@/lib/measurements/registrationOpening';
import { parseProjectLocation } from '@/lib/location/coordinates';
import type { Json } from '@/lib/supabase/database.types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();const profile=await admin.from('profiles').select('full_name,username').eq('id',auth.user.id).single();
 const actor={id:auth.user.id,name:profile.data?.full_name??profile.data?.username??'Employee',role:auth.role};
 if(new URL(request.url).searchParams.has('session'))return NextResponse.json({actor},{headers:{'Cache-Control':'no-store'}});
 let query=admin.from('projects').select('id,project_number,project_name,address,client_id,structure_readiness,sales_status,status,next_follow_up_at,follow_up_type,follow_up_detail,follow_up_owner_id,project_notes,created_at,created_by,updated_at,assigned_outdoor_sales_id,original_creator_role').order('created_at',{ascending:false});
 if(auth.role==='Outdoor Sales')query=query.or(`created_by.eq.${auth.user.id},assigned_outdoor_sales_id.eq.${auth.user.id}`);else if(auth.role!=='Admin')query=query.or(`created_by.eq.${auth.user.id},follow_up_owner_id.eq.${auth.user.id}`);
 const projects=await query;
 if(projects.error)return NextResponse.json({error:'Unable to download projects.'},{status:500});
 const ids=projects.data.map(p=>p.id);const clientIds=[...new Set(projects.data.map(p=>p.client_id))];
 const peopleIds=[...new Set(projects.data.flatMap(p=>[p.created_by,p.assigned_outdoor_sales_id,p.follow_up_owner_id]).filter((id):id is string=>!!id))];
 const [directory,people]=await Promise.all([admin.from('profiles').select('id,full_name,username,role').in('role',['Indoor Sales','Outdoor Sales']).eq('is_active',true).eq('status','Active').order('full_name'),peopleIds.length?admin.from('profiles').select('id,full_name,username').in('id',peopleIds):Promise.resolve({data:[],error:null})]);
 if(directory.error||people.error)return NextResponse.json({error:'Unable to load employee assignments.'},{status:500});
 const indoorSales=directory.data.filter(p=>p.role==='Indoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const outdoorSales=directory.data.filter(p=>p.role==='Outdoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'}));
 const [openings,clients]=await Promise.all([
  ids.length?admin.from('openings').select('id,project_id,floor,room,width,height,opening_type,opening_direction').in('project_id',ids):Promise.resolve({data:[],error:null}),
  clientIds.length?admin.from('clients').select('id,mobile').in('id',clientIds):Promise.resolve({data:[],error:null})
 ]);
 if(openings.error||clients.error)return NextResponse.json({error:'Unable to download measurements.'},{status:500});
 return NextResponse.json({actor,outdoorSales,indoorSales,queue:[],syncedAt:null,projects:projects.data.map(p=>({...p,followUpOwner:people.data?.find(e=>e.id===p.follow_up_owner_id)?.full_name??people.data?.find(e=>e.id===p.follow_up_owner_id)?.username??null,phone:clients.data.find(c=>c.id===p.client_id)?.mobile??null,registeredBy:people.data?.find(e=>e.id===p.created_by)?.full_name??people.data?.find(e=>e.id===p.created_by)?.username??'Employee',assignedOutdoorSales:people.data?.find(e=>e.id===p.assigned_outdoor_sales_id)?.full_name??people.data?.find(e=>e.id===p.assigned_outdoor_sales_id)?.username??null,assignedToYou:p.assigned_outdoor_sales_id===actor.id,serverUpdatedAt:p.updated_at})),openings:openings.data.map(o=>({id:o.id,projectId:o.project_id,floor:o.floor??'',room:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?o.room:'Other',otherRoom:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?'':o.room??'',width:Number(o.width),height:Number(o.height),structuralType:o.opening_type,openingType:o.opening_direction}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||body.userId!==auth.user.id||!uuid.test(body.id)||!uuid.test(body.projectId)||!body.payload||!Number.isFinite(Date.parse(body.recordedAt)))return NextResponse.json({error:'Invalid saved change or account. Sign in with the employee who recorded this work.'},{status:400});
 let payload:Json={};
 if(body.action==='register'){
  const c=body.payload.client,p=body.payload.project;
  const name=typeof c?.clientName==='string'?c.clientName.trim():'';const phone=typeof c?.mobile==='string'?c.mobile.trim():'';
  const location=parseProjectLocation(p?.locationLatitude,p?.locationLongitude);const company=parseProjectLocation(c?.locationLatitude,c?.locationLongitude);
  if(!name||name.length>150||!phone||phone.length>80||!['individual','company'].includes(c?.clientType)||!['ready','not_ready'].includes(p?.structureReadiness)||!location.isValid||(c.clientType==='company'&&!company.isValid))return NextResponse.json({error:'Complete the client, phone, locations and site readiness.'},{status:400});
  const assignee=p?.assignedOutdoorSalesId;
  if(assignee && (typeof assignee!=='string'||!uuid.test(assignee)))return NextResponse.json({error:'Choose an Outdoor Sales employee.'},{status:400});
  if(auth.role==='Indoor Sales'&&!assignee)return NextResponse.json({error:'Indoor Sales must assign an Outdoor Sales employee for measurements.'},{status:400});
  payload={client:{clientName:name,mobile:phone,clientType:c.clientType,locationLatitude:c.clientType==='company'?company.latitude:null,locationLongitude:c.clientType==='company'?company.longitude:null},project:{...(assignee?{assignedOutdoorSalesId:assignee}:{}),address:typeof p.address==='string'?p.address.slice(0,2000):`${location.latitude}, ${location.longitude}`,locationLatitude:location.latitude,locationLongitude:location.longitude,structureReadiness:p.structureReadiness}};
 }else if(body.action==='opening'){
  const opening=normalizeRegistrationOpening(body.payload);if(!opening)return NextResponse.json({error:'Complete the opening dimensions, floor, room and types.'},{status:400});payload=opening as unknown as Json;
 }else if(body.action==='follow-up'){
  try{payload=normalizeFollowUp(body.payload);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 }else if(!['finish','reopen','ready'].includes(body.action))return NextResponse.json({error:'Unknown offline action.'},{status:400});
 const result=await createAdminClient().rpc('sync_field_change',{p_operation:body.id,p_actor:auth.user.id,p_project:body.projectId,p_action:body.action,p_payload:payload,p_recorded_at:body.recordedAt,p_expected_updated_at:typeof body.expectedUpdatedAt==='string'?body.expectedUpdatedAt:null});
 return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({project:result.data},{headers:{'Cache-Control':'no-store'}});
}
