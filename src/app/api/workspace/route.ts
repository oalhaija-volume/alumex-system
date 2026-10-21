import { isHistoricalProject, loadMeasurementAttempts, loadWorkspaceProjects } from '@/lib/measurements/visitHistory';
import { normalizeClientCancellation } from '@/lib/measurements/measurementDelay';
import { normalizeReactivation } from '@/lib/workflow/reactivation';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeFollowUp,normalizeMeasurementAssignment } from '@/lib/workflow/followUps';
import { salesProject,salesRoles } from '@/lib/workflow/access';
export async function GET(){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();
 const actor={id:auth.user.id,role:auth.role,branch:auth.profile?.branch};
 const [result,directory]=await Promise.all([loadWorkspaceProjects(admin,actor),admin.from('profiles').select('id,full_name,username,role').in('role',['Indoor Sales', 'Sales Manager','Outdoor Sales']).eq('is_active',true).eq('status','Active').order('full_name')]);
 if(result.error)return NextResponse.json({error:'Unable to load projects.'},{status:500});
 const clientIds=[...new Set((result.data??[]).map(p=>p.client_id))];
 const ids=[...new Set([auth.user.id,...(result.data??[]).flatMap(p=>[p.created_by,p.assigned_outdoor_sales_id,p.follow_up_owner_id,p.measurement_delayed_by,p.client_cancelled_by]).filter((id):id is string=>!!id)])];
 const [clients,profiles,attempts]=await Promise.all([
  clientIds.length?admin.from('clients').select('id,mobile').in('id',clientIds):{data:[],error:null},
  admin.from('profiles').select('id,full_name,username').in('id',ids),
  loadMeasurementAttempts(admin,(result.data??[]).map(project=>project.id))
 ]);
 if(attempts.error)return NextResponse.json({error:'Unable to load visit history.'},{status:500});
 if(clients.error)return NextResponse.json({error:'Unable to load client contacts.'},{status:500});
 if(profiles.error)return NextResponse.json({error:'Unable to load employee names.'},{status:500});
 if(directory.error)return NextResponse.json({error:'Unable to load employee assignments.'},{status:500});
 const people=new Map((profiles.data??[]).map(p=>[p.id,p]));
 const contacts=new Map((clients.data??[]).map(c=>[c.id,c.mobile]));
 const name=(id:string|null)=>id?(people.get(id)?.full_name??people.get(id)?.username):null;
 const actorProfile=people.get(auth.user.id);
 return NextResponse.json({actor:{id:auth.user.id,role:auth.role,branch:auth.role==='Outdoor Sales'?null:auth.profile?.branch??null,name:actorProfile?.full_name??actorProfile?.username??'Employee'},outdoorSales:directory.data.filter(p=>p.role==='Outdoor Sales').map(p=>({id:p.id,name:p.full_name??p.username??'Employee'})),indoorSales:directory.data.filter(p=>(p.role === 'Indoor Sales' || p.role === 'Sales Manager')).map(p=>({id:p.id,name:p.full_name??p.username??'Employee'})),projects:(result.data??[]).map(p=>({...p,project_log_only:isHistoricalProject(p,actor),measurement_attempts:attempts.data?.get(p.id)??[],clientCancelledBy:name(p.client_cancelled_by)??null,measurementDelayedBy:name(p.measurement_delayed_by)??null,followUpOwner:name(p.follow_up_owner_id)??null,phone:contacts.get(p.client_id)??null,assignedOutdoorSales:name(p.assigned_outdoor_sales_id)??null,assignedToYou:p.assigned_outdoor_sales_id===auth.user.id,registeredBy:name(p.created_by)??'Employee'}))},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request){
 const body=await request.json().catch(()=>null);if(typeof body?.projectId!=='string')return NextResponse.json({error:'Project is required.'},{status:400});
 const access=await salesProject(body.projectId,true);if(access.response)return access.response;
 if(body.action==='reactivate-project'){
  if(!['Indoor Sales', 'Sales Manager','Admin'].includes(access.auth.role))return NextResponse.json({error:'Only Indoor Sales or Admin can reactivate client-cancelled projects.'},{status:403});
  let input;
  try{input=normalizeReactivation(body);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  const result=await access.admin.rpc('reactivate_client_project',{p_project:body.projectId,p_actor:access.auth.user.id,p_note:input.note,p_expected_updated_at:input.expectedUpdatedAt});
  if(result.error?.code==='PGRST202')return NextResponse.json({error:'Project reactivation is not available yet. Please contact Admin.'},{status:503});
  return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({ok:true,project:result.data});
 }
 if(!['ready','assign-measurements','request-openings','follow-up','cancel-project'].includes(body.action))return NextResponse.json({error:'Invalid action.'},{status:400});
 let payload={};
 try{if(body.action==='cancel-project')payload=normalizeClientCancellation(body);else if(body.action==='follow-up')payload=normalizeFollowUp(body);else if(body.action==='request-openings'||body.action==='assign-measurements'||body.assignedOutdoorSalesId!==undefined)payload=normalizeMeasurementAssignment(body);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
 const result=await access.admin.rpc('sync_field_change',{p_operation:crypto.randomUUID(),p_actor:access.auth.user.id,p_project:body.projectId,p_action:body.action,p_payload:payload,p_recorded_at:new Date().toISOString(),p_expected_updated_at:access.project.updated_at});
 return result.error?NextResponse.json({error:result.error.message},{status:409}):NextResponse.json({ok:true});
}

export async function DELETE(request:Request){
 const auth=await requireRole(['Admin']);
 if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(typeof body?.projectId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.projectId)||body.confirmed!==true)
  return NextResponse.json({error:'Confirm the project you want to delete.'},{status:400});
 const admin=createAdminClient();
 const result=await admin.rpc('delete_projects_as_admin',{target_project_ids:[body.projectId],actor_user_id:auth.user.id});
 if(result.error)return NextResponse.json({error:'Unable to delete this project. Refresh and try again.'},{status:409});
 // Storage is outside the database transaction. Retain failed cleanup entries
 // for retry, rather than losing the path after the project has been deleted.
 const pending=await admin.from('project_file_cleanup').select('project_id,path').eq('project_id',body.projectId);
 let cleanupPending=!!pending.error;
 for(const item of pending.data??[]){
  const removed=await admin.storage.from('signed-contracts-private').remove([item.path]);
  if(removed.error){cleanupPending=true;continue;}
  const cleared=await admin.from('project_file_cleanup').delete().eq('project_id',item.project_id).eq('path',item.path);
  if(cleared.error)cleanupPending=true;
 }
 return NextResponse.json({ok:true,cleanupPending});
}
