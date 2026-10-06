import { NextResponse } from 'next/server';
import { salesProject } from '@/lib/workflow/access';
import type { FollowUpEntry } from '@/lib/workflow/followUps';
import type { Json } from '@/lib/supabase/database.types';
export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}){
 const {projectId}=await params;const access=await salesProject(projectId);if(access.response)return access.response;
 const {admin,project}=access;
 const rows:{operation_id:string;actor_id:string;action:string;recorded_at:string;result:Json}[]=[];
 for(let offset=0;;offset+=1000){
  const result=await admin.from('field_sync_receipts').select('operation_id,actor_id,action,recorded_at,result').eq('project_id',projectId).in('action',['follow-up','ready']).order('recorded_at',{ascending:false}).order('operation_id').range(offset,offset+999);
  if(result.error)return NextResponse.json({error:'Unable to load follow-up history.'},{status:500});
  rows.push(...result.data);if(result.data.length<1000)break;
 }
 const actorIds=[...new Set(rows.map(row=>row.actor_id))];
 const people=actorIds.length?await admin.from('profiles').select('id,full_name,username').in('id',actorIds):{data:[],error:null};
 if(people.error)return NextResponse.json({error:'Unable to load follow-up authors.'},{status:500});
 const entries:FollowUpEntry[]=rows.map(row=>{
  const data=row.result as Record<string,Json>;const actor=people.data?.find(p=>p.id===row.actor_id);
  return {id:row.operation_id,action:row.action==='ready'?'ready':'follow-up',note:row.action==='follow-up'&&typeof data.project_notes==='string'?data.project_notes:'',nextFollowUp:row.action==='follow-up'&&typeof data.next_follow_up_at==='string'?data.next_follow_up_at:null,recordedAt:row.recorded_at,recordedBy:actor?.full_name??actor?.username??'Employee'};
 });
 // Older workflows only retained the latest note. Do not invent an author or
 // date for that note, or pretend that overwritten notes can be recovered.
 if(!entries.some(entry=>entry.action==='follow-up')&&project.project_notes)entries.push({id:'previous-note',action:'snapshot',note:project.project_notes,nextFollowUp:project.next_follow_up_at,recordedAt:null,recordedBy:'Not recorded'});
 return NextResponse.json({project:{id:project.id,project_name:project.project_name,project_number:project.project_number,structure_readiness:project.structure_readiness,next_follow_up_at:project.next_follow_up_at},entries},{headers:{'Cache-Control':'private, no-store'}});
}
