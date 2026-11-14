import { leadershipRoles } from '@/lib/auth/permissions';
import { operationalSpecifications,operationalAdditionalItems } from '@/lib/workflow/operations';
import type { QuoteSnapshot } from '@/lib/workflow/pricing';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessProjectBranch, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
// Select only operational fields. Never send contract snapshots, evidence, catalog or totals.
export async function GET(){
 const auth=await requireRole([...leadershipRoles,'Operations Manager','Project Manager']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const admin=createAdminClient();
 const actor={role:auth.role,branch:auth.profile?.branch};
 let projectQuery=admin.from('projects').select('id,branch,project_number,project_name,address,location_latitude,location_longitude,client_id');
 const branches=projectBranchesForActor(actor);
 if(branches!==null)projectQuery=projectQuery.in('branch',branches);
 const available=await projectQuery;
 if(available.error)return NextResponse.json({error:'Unable to load operations projects.'},{status:500});
 const allowedProjects=(available.data??[]).filter(project=>canAccessProjectBranch(actor,project.branch));
 if(!allowedProjects.length)return NextResponse.json({projects:[],canAccept:['Admin','CEO','Company Owner','Operations Manager'].includes(auth.role)},{headers:{'Cache-Control':'private, no-store'}});
 const flows=await admin.from('sales_workflows').select('project_id,stage,revision,signed_at,accepted_at,quotation').in('project_id',allowedProjects.map(project=>project.id)).in('stage',['signed','operations']).not('signed_at','is',null).not('contract','is',null).neq('contract','null').order('signed_at',{ascending:false});
 if(flows.error)return NextResponse.json({error:'The operations database update is required.'},{status:503});
 const safeFlows=(flows.data??[]).filter(flow=>allowedProjects.some(project=>project.id===flow.project_id)).map(f=>({project_id:f.project_id,stage:f.stage,revision:f.revision,signed_at:f.signed_at,accepted_at:f.accepted_at,specifications:operationalSpecifications(f.quotation as unknown as QuoteSnapshot),additionalItems:operationalAdditionalItems(f.quotation as unknown as QuoteSnapshot)}));
 const ids=safeFlows.map(f=>f.project_id);
 if(!ids.length)return NextResponse.json({projects:[],canAccept:['Admin','CEO','Company Owner','Operations Manager'].includes(auth.role)});
 const projects=allowedProjects.filter(project=>ids.includes(project.id));
 const openings=await admin.from('openings').select('id,project_id,floor,room,width,height,quantity,opening_type,opening_direction').in('project_id',ids);
 if(openings.error)return NextResponse.json({error:'Unable to load operations projects.'},{status:500});
 const clients=await admin.from('clients').select('id,name:client_name,mobile').in('id',[...new Set(projects.map(p=>p.client_id))]);
 if(clients.error)return NextResponse.json({error:'Unable to load client contacts.'},{status:500});
 return NextResponse.json({canAccept:['Admin','CEO','Company Owner','Operations Manager'].includes(auth.role),projects:projects.map(p=>({...p,client:clients.data.find(c=>c.id===p.client_id),handoff:safeFlows.find(f=>f.project_id===p.id),openings:openings.data.filter(o=>o.project_id===p.id)}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const auth=await requireRole(['Admin','CEO','Company Owner','Operations Manager']);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);if(typeof body?.projectId!=='string'||!Number.isInteger(body.revision))return NextResponse.json({error:'Invalid project.'},{status:400});
 const admin=createAdminClient();
 const project=await admin.from('projects').select('branch').eq('id',body.projectId).maybeSingle();
 if(project.error||!project.data||!canAccessProjectBranch({role:auth.role,branch:auth.profile?.branch},project.data.branch))return NextResponse.json({error:'Project not found.'},{status:404});
 const result=await admin.rpc('advance_sales_flow',{p_project:body.projectId,p_action:'accept',p_revision:body.revision,p_payload:{},p_actor:auth.user.id});
 // The RPC returns commercial data internally; the response deliberately does not.
 return result.error?NextResponse.json({error:'Unable to start work. Reload and check that the project is signed.'},{status:409}):NextResponse.json({ok:true});
}
