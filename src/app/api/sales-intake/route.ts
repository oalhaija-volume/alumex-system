import { normalizeProjectGovernorate } from '@/lib/intake/projectBranch';
import { normalizeOutdoorProjectBranch, outdoorSalesBranch } from '@/lib/intake/outdoorRotation';
import { canAccessProjectBranch, hasGlobalProjectAccess } from '@/lib/auth/projectBranchAccess';
import { normalizeBuildingType } from '@/lib/intake/buildingType';
import { normalizeReadinessNote } from '@/lib/intake/readinessNote';
import { normalizeLegacyOutdoorSalesId } from '@/lib/intake/legacyOutdoorSales';
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";
import { parseProjectLocation } from "@/lib/location/coordinates";

// Registration retains the creator and validates measurement assignment.
export async function POST(request: Request) {
  const auth = await requireRole(["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Sales Manager", "Outdoor Sales"]);
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
  let branch;
  if(!hasGlobalProjectAccess(auth.role)&&!auth.profile?.branch)return NextResponse.json({error:'Ask Admin to assign your branch before creating a project.'},{status:400});
  const actor={role:auth.role,branch:auth.profile?.branch};
  try{branch=normalizeOutdoorProjectBranch(actor,body?.project?.branch===undefined?(outdoorSalesBranch(actor)??auth.profile?.branch):body.project.branch);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  let governorate;
  try{governorate=normalizeProjectGovernorate(branch,body?.project?.governorate);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  let legacyOutdoorSalesId;
  try{legacyOutdoorSalesId=normalizeLegacyOutdoorSalesId(body?.project?.legacyOutdoorSalesId,auth.role);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
  const assignee=body?.project?.assignedOutdoorSalesId;
  if(assignee&&(typeof assignee!=='string'||!/^[0-9a-f-]{36}$/i.test(assignee)))return NextResponse.json({error:'Choose an Outdoor Sales employee.'},{status:400});
  if((auth.role === 'Indoor Sales' || auth.role === 'Sales Manager')&&!assignee)return NextResponse.json({error:'Choose yourself or an Outdoor Sales employee to collect the initial measurements.'},{status:400});
  const admin = createAdminClient();
  if(assignee && !((auth.role === 'Indoor Sales' || auth.role === 'Sales Manager') && assignee===auth.user.id)){const employee=await admin.from('profiles').select('id,branch').eq('id',assignee).eq('role','Outdoor Sales').eq('is_active',true).eq('status','Active').maybeSingle();if(employee.error||!employee.data)return NextResponse.json({error:'Choose an active Outdoor Sales employee.'},{status:400});if(!canAccessProjectBranch({role:'Outdoor Sales',branch:employee.data.branch},branch))return NextResponse.json({error:'Choose an employee from the project branch.'},{status:400});}
  if (legacyOutdoorSalesId) {
    const owner = await admin.from('profiles').select('id,branch').eq('id', legacyOutdoorSalesId).eq('role', 'Outdoor Sales').eq('is_active', true).eq('status', 'Active').maybeSingle();
    if (owner.error) return NextResponse.json({error:'Unable to verify the original project owner. Please try again.'}, {status:503});
    if (!owner.data) return NextResponse.json({error:'Choose an active Outdoor Sales employee as the original project owner.'}, {status:400});
    if (!canAccessProjectBranch({role:'Outdoor Sales',branch:owner.data.branch},branch)) return NextResponse.json({error:'Choose an employee from the project branch.'}, {status:400});
  }

  const { data, error } = await admin.rpc('register_sales_project', {
    p_actor: auth.user.id,
    p_payload: {
      client: {
        clientName: name, mobile: phone, clientType,
        locationLatitude: clientType === 'company' ? companyLocation.latitude : null,
        locationLongitude: clientType === 'company' ? companyLocation.longitude : null,
      },
      project: {
        assignedOutdoorSalesId: assignee || null,
        ...(legacyOutdoorSalesId ? {legacyOutdoorSalesId} : {}),
        address: typeof body.project.address === 'string' && body.project.address.trim()
          ? body.project.address.trim().slice(0, 2000) : `${location.latitude}, ${location.longitude}`,
        locationLatitude: location.latitude, locationLongitude: location.longitude,
        buildingType, readinessNote, structureReadiness: readiness,
        ...(branch ? {branch} : {}),
        ...(governorate ? {governorate} : {}),
      },
    },
  });
  if (error) {
    return NextResponse.json({error:error.code === '22023' ? error.message : "Unable to save the project registration. Please try again."}, {status:error.code === '22023' ? 400 : 500});
  }
  return NextResponse.json(data, {status:201});
}
