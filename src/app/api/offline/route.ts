import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
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
 let query=admin.from('projects').select('id,project_number,project_name,address,client_id,structure_readiness,sales_status,next_follow_up_at,project_notes,created_at,created_by,updated_at').order('created_at',{ascending:false});
 if(auth.role!=='Admin')query=query.eq('created_by',auth.user.id);
 const projects=await query;
 if(projects.error)return NextResponse.json({error:'Unable to download projects.'},{status:500});
 const ids=projects.data.map(p=>p.id);const clientIds=[...new Set(projects.data.map(p=>p.client_id))];
 const [openings,clients]=await Promise.all([
  ids.length?admin.from('openings').select('id,project_id,floor,room,width,height,opening_type,opening_direction').in('project_id',ids):Promise.resolve({data:[],error:null}),
  clientIds.length?admin.from('clients').select('id,mobile').in('id',clientIds):Promise.resolve({data:[],error:null})
 ]);
 if(openings.error||clients.error)return NextResponse.json({error:'Unable to download measurements.'},{status:500});
 return NextResponse.json({actor,queue:[],syncedAt:null,projects:projects.data.map(p=>({...p,phone:clients.data.find(c=>c.id===p.client_id)?.mobile??null,registeredBy:p.created_by===actor.id?actor.name:'Employee',serverUpdatedAt:p.updated_at})),openings:openings.data.map(o=>({id:o.id,projectId:o.project_id,floor:o.floor??'',room:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?o.room:'Other',otherRoom:registrationRoomTypes.some(r=>r===o.room&&r!=='Other')?'':o.room??'',width:Number(o.width),height:Number(o.height),structuralType:o.opening_type,openingType:o.opening_direction}))},{headers:{'Cache-Control':'private, no-store'}});
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
  payload={client:{clientName:name,mobile:phone,clientType:c.clientType,locationLatitude:c.clientType==='company'?company.latitude:null,locationLongitude:c.clientType==='company'?company.longitude:null},project:{address:typeof p.address==='string'?p.address.slice(0,2000):`${location.latitude}, ${location.longitude}`,locationLatitude:location.latitude,locationLongitude:location.longitude,structureReadiness:p.structureReadiness}};
 }else if(body.action==='opening'){
  const opening=normalizeRegistrationOpening(body.payload);if(!opening)return NextResponse.json({error:'Complete the opening dimensions, floor, room and types.'},{status:400});payload=opening as unknown as Json;
 }else if(body.action==='follow-up'){
  const {nextFollowUp,note}=body.payload;if(typeof nextFollowUp!=='string'||!Number.isFinite(Date.parse(nextFollowUp))||typeof note!=='string'||note.length>2000)return NextResponse.json({error:'Enter a valid follow-up date and note.'},{status:400});payload={nextFollowUp,note};
 }else if(!['finish','reopen','ready'].includes(body.action))return NextResponse.json({error:'Unknown offline action.'},{status:400});
 const result=await createAdminClient().rpc('sync_field_change',{p_operation:body.id,p_actor:auth.user.id,p_project:body.projectId,p_action:body.action,p_payload:payload,p_recorded_at:body.recordedAt,p_expected_updated_at:typeof body.expectedUpdatedAt==='string'?body.expectedUpdatedAt:null});
 return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({project:result.data},{headers:{'Cache-Control':'no-store'}});
}
