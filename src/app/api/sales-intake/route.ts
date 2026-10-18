import { normalizeBuildingType } from '@/lib/intake/buildingType';
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";
import { parseProjectLocation } from "@/lib/location/coordinates";
import { generateNextProjectNumber } from "@/lib/projects/numbering";

// Registration retains the creator and validates measurement assignment.
export async function POST(request: Request) {
  const auth = await requireRole(["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Outdoor Sales"]);
  if (!auth.ok) return NextResponse.json({error: auth.error}, {status: auth.status});
  if (!hasSupabaseServiceRoleKey()) return NextResponse.json({error:supabaseServiceRoleError}, {status:500});
  const body = await request.json().catch(() => null);
  const name = typeof body?.client?.clientName === "string" ? body.client.clientName.trim() : "";
  const phone = typeof body?.client?.mobile === "string" ? body.client.mobile.trim() : "";
  const clientType = body?.client?.clientType;
  if (clientType !== "individual" && clientType !== "company") {
    return NextResponse.json({error:"Select Individual or Corporate."}, {status:400});
  }
  const companyLocation = parseProjectLocation(body?.client?.locationLatitude, body?.client?.locationLongitude);
  const readiness = body?.project?.structureReadiness;
  const location = parseProjectLocation(body?.project?.locationLatitude, body?.project?.locationLongitude);
  if (!name || !phone || !location.isValid || !["ready", "not_ready"].includes(readiness)) {
    return NextResponse.json({error:"Enter the client name, phone number, location pin, and site readiness."}, {status:400});
  }
  let readinessNote:string|null;
  try{readinessNote=normalizeReadinessNote(auth.role,readiness,body?.project?.readinessNote);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  let buildingType;
  try{buildingType=normalizeBuildingType(body?.project?.buildingType,auth.role==='Outdoor Sales');}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  const assignee=body?.project?.assignedOutdoorSalesId;
  if(assignee&&(typeof assignee!=='string'||!/^[0-9a-f-]{36}$/i.test(assignee)))return NextResponse.json({error:'Choose an Outdoor Sales employee.'},{status:400});
  if(auth.role==='Indoor Sales'&&!assignee)return NextResponse.json({error:'Choose yourself or an Outdoor Sales employee to collect the initial measurements.'},{status:400});
  const admin = createAdminClient();
  if (auth.role === 'Indoor Sales') {
    const profile = await admin.from('profiles').select('branch').eq('id', auth.user.id).single();
    if (profile.error) return NextResponse.json({error:'Unable to load your employee branch.'}, {status:503});
    if (!profile.data.branch) return NextResponse.json({error:'Ask Admin to assign your Karkh or Rasafa branch before creating a project.'}, {status:400});
  }
  if(assignee && !(auth.role==='Indoor Sales' && assignee===auth.user.id)){const employee=await admin.from('profiles').select('id').eq('id',assignee).eq('role','Outdoor Sales').eq('is_active',true).eq('status','Active').maybeSingle();if(employee.error||!employee.data)return NextResponse.json({error:'Choose an active Outdoor Sales employee.'},{status:400});}

  const date = new Date();
  const prefix = `PRJ-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}-`;
  const {data:numbers,error:numberError} = await admin.from("projects").select("project_number").like("project_number",`${prefix}%`);
  if (numberError) return NextResponse.json({error:"Unable to prepare registration. Please try again."}, {status:500});
  const projectNumber = generateNextProjectNumber({projectNumbers:(numbers ?? []).map(row => row.project_number),date});
  const {data:client,error:clientError} = await admin.from("clients").insert({
    client_name:name, mobile:phone, client_type:clientType, created_by:auth.user.id,
    company_name:clientType === "company" ? name : null,
    location_latitude:clientType === "company" ? companyLocation.latitude : null,
    location_longitude:clientType === "company" ? companyLocation.longitude : null,
  }).select("id").single();
  if (clientError) return NextResponse.json({error:"Unable to save the client. Please check the details and try again."}, {status:500});
  const {data:project,error:projectError} = await admin.from("projects").insert({
    project_number:projectNumber, project_name:name, client_id:client.id, assigned_outdoor_sales_id:assignee||null,
    address:typeof body?.project?.address === "string" && body.project.address.trim()
      ? body.project.address.trim().slice(0, 2000)
      : `${location.latitude}, ${location.longitude}`,
    location_latitude:location.latitude, location_longitude:location.longitude,
    building_type:buildingType, readiness_note:readinessNote, structure_readiness:readiness, status:"Draft", sales_status:"new_lead",
    original_source:auth.role === "Outdoor Sales" ? "outdoor_sales" : "showroom_walk_in",
    original_creator_id:auth.user.id, original_creator_role:auth.role,
    created_by:auth.user.id, owner_id:auth.user.id, sales_engineer_id:auth.user.id,
  }).select("id").single();
  if (projectError) {
    // Roll back only the client just created by this failed request.
    await admin.from("clients").delete().eq("id",client.id);
    return NextResponse.json({error:projectError.code === '22023' ? projectError.message : "Unable to save the project registration. Please try again."}, {status:projectError.code === '22023' ? 400 : 500});
  }
  return NextResponse.json({projectId:project.id,clientId:client.id,projectNumber}, {status:201});
}
