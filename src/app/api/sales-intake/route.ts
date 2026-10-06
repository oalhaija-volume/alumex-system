import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";
import { parseProjectLocation } from "@/lib/location/coordinates";
import { generateNextProjectNumber } from "@/lib/projects/numbering";

// Step one only: save registration. No assignments, workflow transitions,
// measurement requests, CRM tasks, notifications, or next-page navigation.
export async function POST(request: Request) {
  const auth = await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);
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
  if (clientType === "company" && !companyLocation.isValid) {
    return NextResponse.json({error:"Choose the company location as well as the project site."}, {status:400});
  }
  const readiness = body?.project?.structureReadiness;
  const location = parseProjectLocation(body?.project?.locationLatitude, body?.project?.locationLongitude);
  if (!name || !phone || !location.isValid || !["ready", "not_ready"].includes(readiness)) {
    return NextResponse.json({error:"Enter the client name, phone number, location pin, and site readiness."}, {status:400});
  }
  const admin = createAdminClient();
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
    project_number:projectNumber, project_name:name, client_id:client.id,
    address:typeof body?.project?.address === "string" && body.project.address.trim()
      ? body.project.address.trim().slice(0, 2000)
      : `${location.latitude}, ${location.longitude}`,
    location_latitude:location.latitude, location_longitude:location.longitude,
    structure_readiness:readiness, status:"Draft", sales_status:"new_lead",
    original_source:auth.role === "Outdoor Sales" ? "outdoor_sales" : "showroom_walk_in",
    original_creator_id:auth.user.id, original_creator_role:auth.role,
    created_by:auth.user.id, owner_id:auth.user.id, sales_engineer_id:auth.user.id,
  }).select("id").single();
  if (projectError) {
    // Roll back only the client just created by this failed request.
    await admin.from("clients").delete().eq("id",client.id);
    return NextResponse.json({error:"Unable to save the project registration. Please try again."}, {status:500});
  }
  return NextResponse.json({projectId:project.id,clientId:client.id,projectNumber}, {status:201});
}
