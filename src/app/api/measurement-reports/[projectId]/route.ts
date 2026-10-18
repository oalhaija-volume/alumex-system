import {NextResponse} from 'next/server';
import {salesProject} from '@/lib/workflow/access';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const {projectId}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(projectId))return NextResponse.json({error:'Project not found.'},{status:404});
 const access=await salesProject(projectId);if(access.response)return access.response;
 const report=new URL(request.url).searchParams.get('report');
 if(report){
  if(!/^[0-9a-f-]{36}$/i.test(report))return NextResponse.json({error:'Measurement report not found.'},{status:404});
  const {data,error}=await access.admin.from('measurement_completion_reports').select('photo').eq('project_id',projectId).eq('id',report).maybeSingle();
  if(error)return NextResponse.json({error:'Unable to load measurement photo.'},{status:500});
  if(!data)return NextResponse.json({error:'Measurement report not found.'},{status:404});
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }
 const {data,error}=await access.admin.from('measurement_completion_reports').select('id,project_id,note,has_photo,recorded_by,recorded_by_name,recorded_at').eq('project_id',projectId).order('recorded_at',{ascending:false});
 return error?NextResponse.json({error:'Unable to load measurement notes.'},{status:500}):NextResponse.json({reports:data},{headers:{'Cache-Control':'private, no-store'}});
}
