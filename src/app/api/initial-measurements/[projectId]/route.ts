import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
import { normalizeRegistrationOpening, registrationRoomTypes } from "@/lib/measurements/registrationOpening";

type Context = { params: Promise<{projectId: string}> };
async function access(context: Context) {
  const auth = await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);
  if (!auth.ok) return {response:NextResponse.json({error:auth.error},{status:auth.status})};
  if (!hasSupabaseServiceRoleKey()) return {response:NextResponse.json({error:"Measurements are unavailable."},{status:503})};
  const {projectId} = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return {response:NextResponse.json({error:"Project not found."},{status:404})};
  const admin = createAdminClient();
  const {data:project,error} = await admin.from("projects").select("id, project_name, project_number, created_by, structure_readiness").eq("id",projectId).maybeSingle();
  if (error) return {response:NextResponse.json({error:"Unable to load project."},{status:500})};
  if (!project || (auth.role !== "Admin" && project.created_by !== auth.user.id)) return {response:NextResponse.json({error:"Project not found."},{status:404})};
  if (project.structure_readiness !== "ready") return {response:NextResponse.json({error:"The site must be ready before measurements can be recorded."},{status:409})};
  return {admin,project,auth};
}
export async function GET(_request: Request, context: Context) {
  const result = await access(context);
  if (result.response) return result.response;
  const {data,error} = await result.admin.from("openings").select("id, width, height, floor, room, opening_type, opening_direction").eq("project_id",result.project.id).order("created_at");
  if (error) return NextResponse.json({error:"Unable to load openings."},{status:500});
  return NextResponse.json({project:result.project,openings:(data ?? []).map(row=>({id:row.id,floor:row.floor ?? "",room:registrationRoomTypes.some(room => room === row.room && room !== "Other") ? row.room : "Other",otherRoom:registrationRoomTypes.some(room => room === row.room && room !== "Other") ? "" : row.room ?? "",width:Number(row.width),height:Number(row.height),structuralType:row.opening_type,openingType:row.opening_direction}))});
}
export async function POST(request: Request, context: Context) {
  const result = await access(context);
  if (result.response) return result.response;
  const opening = normalizeRegistrationOpening(await request.json().catch(()=>null));
  if (!opening) return NextResponse.json({error:"Enter floor, room, valid dimensions, structural type, and opening type."},{status:400});
  // Existing storage calls the structural category opening_type. The movement
  // is stored separately in opening_direction; each row always represents one opening.
  const {error} = await result.admin.from("openings").insert({
    floor:opening.floor, room:opening.room === "Other" ? opening.otherRoom : opening.room,
    id:opening.id, project_id:result.project.id, opening_code:`OP-${opening.id}`, width:opening.width,height:opening.height,
    opening_type:opening.structuralType,opening_direction:opening.openingType,quantity:1,site_readiness:"ready",created_by:result.auth.user.id,
  });
  if (error) {
    if (error.code === "23505") {
      const {data:existing} = await result.admin.from("openings").select("id").eq("id",opening.id).eq("project_id",result.project.id).maybeSingle();
      if (existing) return NextResponse.json({id:existing.id});
    }
    return NextResponse.json({error:"Unable to save this opening. Please try again."},{status:500});
  }
  return NextResponse.json({id:opening.id},{status:201});
}
