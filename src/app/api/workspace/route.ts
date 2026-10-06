import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { salesProject,salesRoles } from '@/lib/workflow/access';
export async function GET(){
 const auth=await requireRole(salesRoles);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();let query=admin.from('projects').select('id,project_name,project_number,address,client_id,structure_readiness,sales_status,next_follow_up_at,created_by,created_at,project_notes').order('created_at',{ascending:false});
 if(auth.role!=='Admin')query=query.eq('created_by',auth.user.id);
 const result=await query;
 if(result.error)return NextResponse.json({error:'Unable to load projects.'},{status:500});
 const clientIds=[...new Set((result.data??[]).map(p=>p.client_id))];
 const clients=clientIds.length?await admin.from('clients').select('id,mobile').in('id',clientIds):{data:[],error:null};
 if(clients.error)return NextResponse.json({error:'Unable to load client contacts.'},{status:500});
 const ids=[...new Set((result.data??[]).map(p=>p.created_by).filter((id):id is string=>!!id))];
 const profiles=ids.length?await admin.from('profiles').select('id,full_name,username').in('id',ids):{data:[],error:null};
 if(profiles.error)return NextResponse.json({error:'Unable to load employee names.'},{status:500});
 return NextResponse.json({projects:(result.data??[]).map(p=>({...p,phone:clients.data?.find(c=>c.id===p.client_id)?.mobile??null,registeredBy:profiles.data?.find(e=>e.id===p.created_by)?.full_name??'Employee'}))},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request){
 const body=await request.json().catch(()=>null);if(typeof body?.projectId!=='string')return NextResponse.json({error:'Project is required.'},{status:400});
 const access=await salesProject(body.projectId);if(access.response)return access.response;
 if(access.project.structure_readiness==='ready')return NextResponse.json({error:'This project has already moved to measurements.'},{status:409});
 const ready=body.action==='ready';
 if(!ready && body.action!=='follow-up')return NextResponse.json({error:'Invalid action.'},{status:400});
 const next=typeof body.nextFollowUp==='string'&&body.nextFollowUp?new Date(body.nextFollowUp):null;
 if(!ready && (!next||!Number.isFinite(next.getTime())))return NextResponse.json({error:'Choose the next follow-up date.'},{status:400});
 const note=typeof body.note==='string'?body.note.trim():'';
 if(note.length>2000)return NextResponse.json({error:'Keep the follow-up note under 2,000 characters.'},{status:400});
 const {error}=await access.admin.from('projects').update(ready?{structure_readiness:'ready',sales_status:'new_lead',next_follow_up_at:null}:{next_follow_up_at:next!.toISOString(),project_notes:note}).eq('id',body.projectId).eq('structure_readiness','not_ready');
 return error?NextResponse.json({error:'Unable to update follow-up.'},{status:500}):NextResponse.json({ok:true});
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
