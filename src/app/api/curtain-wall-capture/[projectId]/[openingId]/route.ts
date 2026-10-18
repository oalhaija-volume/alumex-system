import {NextResponse} from 'next/server';
import {salesProject} from '@/lib/workflow/access';
export async function GET(_request:Request,{params}:{params:Promise<{projectId:string;openingId:string}>}){
 const {projectId,openingId}=await params;
 if(![projectId,openingId].every(id=>/^[0-9a-f-]{36}$/i.test(id)))return NextResponse.json({error:'Opening not found.'},{status:404});
 const access=await salesProject(projectId);if(access.response)return access.response;
 const {data,error}=await access.admin.from('openings').select('curtain_wall_capture').eq('id',openingId).eq('project_id',projectId).eq('opening_type','Curtain Wall').maybeSingle();
 if(error)return NextResponse.json({error:'Unable to load Curtain Wall details.'},{status:500});
 if(!data)return NextResponse.json({error:'Opening not found.'},{status:404});
 return NextResponse.json({curtainWall:data.curtain_wall_capture},{headers:{'Cache-Control':'private, no-store'}});
}
