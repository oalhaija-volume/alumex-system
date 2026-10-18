import {normalizeMeasurementCompletion} from '@/lib/measurements/completion';
import type { Json } from '@/lib/supabase/database.types';
import { canCancelProject, normalizeClientCancellation, canDelayMeasurements, canResumeMeasurements, normalizeMeasurementDelayNote } from '@/lib/measurements/measurementDelay';
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
import { normalizeOpeningEdit, normalizeRegistrationOpening, registrationRoomTypes } from "@/lib/measurements/registrationOpening";

type Context = { params: Promise<{projectId: string}> };
async function access(context: Context) {
  const auth = await requireRole(["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Outdoor Sales"]);
  if (!auth.ok) return {response:NextResponse.json({error:auth.error},{status:auth.status})};
  if (!hasSupabaseServiceRoleKey()) return {response:NextResponse.json({error:"Measurements are unavailable."},{status:503})};
  const {projectId} = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return {response:NextResponse.json({error:"Project not found."},{status:404})};
  const admin = createAdminClient();
  const {data:project,error} = await admin.from("projects").select("id, additional_openings_state,additional_openings_original_ids,building_type, project_name, project_number, created_by, assigned_outdoor_sales_id, follow_up_owner_id, structure_readiness, sales_status, updated_at, measurement_delayed, measurement_delay_note, measurement_delayed_at, measurement_delayed_by, client_cancellation_note, client_cancelled_at, client_cancelled_by").eq("id",projectId).maybeSingle();
  if (error) return {response:NextResponse.json({error:"Unable to load project."},{status:500})};
  if (!project || (!["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales"].includes(auth.role) && project.created_by !== auth.user.id && !(auth.role === "Outdoor Sales" && project.assigned_outdoor_sales_id === auth.user.id) && !(auth.role === "Indoor Sales" && project.follow_up_owner_id === auth.user.id))) return {response:NextResponse.json({error:"Project not found."},{status:404})};
  if (project.structure_readiness !== "ready") return {response:NextResponse.json({error:"The site must be ready before measurements can be recorded."},{status:409})};
  return {admin,project,auth};
}
export async function GET(_request: Request, context: Context) {
  const result = await access(context);
  if (result.response) return result.response;
  const {data,error} = await result.admin.from("openings").select("id, width, height, quantity,has_curtain_wall_capture,has_skylight_capture, floor, room, has_arch,opening_type, opening_direction").eq("project_id",result.project.id).order("created_at");
  if (error) return NextResponse.json({error:"Unable to load openings."},{status:500});
  return NextResponse.json({project:result.project,canCancelProject:canCancelProject(result.project,{id:result.auth.user.id,role:result.auth.role}),canDelayMeasurements:canDelayMeasurements(result.project,{id:result.auth.user.id,role:result.auth.role}),canResumeMeasurements:canResumeMeasurements(result.project,{id:result.auth.user.id,role:result.auth.role}),openings:(data ?? []).map(row=>({id:row.id,floor:row.floor ?? "",room:registrationRoomTypes.some(room => room === row.room && room !== "Other") ? row.room : "Other",otherRoom:registrationRoomTypes.some(room => room === row.room && room !== "Other") ? "" : row.room ?? "",width:Number(row.width),height:Number(row.height),quantity:row.quantity,hasArch:row.has_arch,hasCurtainWallCapture:row.has_curtain_wall_capture,hasSkylightCapture:row.has_skylight_capture,structuralType:row.opening_type,openingType:row.opening_direction}))});
}
export async function POST(request: Request, context: Context) {
  const result = await access(context);
  if (result.response) return result.response;
  if (result.project.sales_status !== "new_lead") return NextResponse.json({error:"Reopen measurements before adding another opening."},{status:409});
  if(result.project.measurement_delayed)return NextResponse.json({error:"Resume measurements before recording or completing them."},{status:409});
  if(result.project.additional_openings_state && result.auth.role==='Outdoor Sales' && result.project.assigned_outdoor_sales_id!==result.auth.user.id)return NextResponse.json({error:'Only the assigned employee can complete this task.'},{status:403});
  const opening = normalizeRegistrationOpening(await request.json().catch(()=>null));
  if (!opening) return NextResponse.json({error:"Enter floor, room, valid dimensions, structural type, and opening type."},{status:400});
  // Existing storage calls the structural category opening_type. The movement
  // is stored separately in opening_direction; each row records the quantity of identical openings.
  const {error} = await result.admin.from("openings").insert({
    curtain_wall_capture:opening.curtainWall??null, skylight_capture:opening.skylight??null, floor:opening.floor, room:opening.room === "Other" ? opening.otherRoom : opening.room,
    id:opening.id, project_id:result.project.id, opening_code:`OP-${opening.id}`, width:opening.width,height:opening.height,
    has_arch:opening.hasArch??false,opening_type:opening.structuralType,opening_direction:opening.openingType,quantity:opening.quantity??1,site_readiness:"ready",created_by:result.auth.user.id,
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

export async function PATCH(request: Request, context: Context) {
  const result = await access(context);
  if (result.response) return result.response;
  if (!["new_lead","ready_for_quotation"].includes(result.project.sales_status ?? "")) return NextResponse.json({error:"Measurements are locked once a quotation has been saved."},{status:409});
  const body = await request.json().catch(()=>null);
  if(body?.action==='finish'&&(body.note!==undefined||body.photo!==undefined)){
    let completion;
    try{completion=normalizeMeasurementCompletion(body);}catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
    const saved=await result.admin.rpc('sync_field_change',{p_operation:crypto.randomUUID(),p_actor:result.auth.user.id,p_project:result.project.id,p_action:'finish',p_payload:completion,p_recorded_at:new Date().toISOString(),p_expected_updated_at:result.project.updated_at});
    return saved.error?NextResponse.json({error:saved.error.message},{status:409}):NextResponse.json({project:saved.data,salesStatus:'ready_for_quotation'});
  }
  if(result.project.additional_openings_state && ['finish','reopen','edit-opening'].includes(body?.action)){
    const payload=body.action==='edit-opening'?normalizeOpeningEdit(body):{};
    if(!payload)return NextResponse.json({error:'Complete the opening details.'},{status:400});
    const saved=await result.admin.rpc('sync_field_change',{p_operation:body.action==='edit-opening'?body.operationId:crypto.randomUUID(),p_actor:result.auth.user.id,p_project:result.project.id,p_action:body.action,p_payload:payload as unknown as Json,p_recorded_at:new Date().toISOString(),p_expected_updated_at:result.project.updated_at});
    return saved.error?NextResponse.json({error:saved.error.message},{status:409}):NextResponse.json({project:saved.data,salesStatus:body.action==='finish'?'ready_for_quotation':'new_lead'});
  }
  if (body?.action === 'cancel-project' || body?.action === 'delay-measurements' || body?.action === 'resume-measurements') {
    const actor={id:result.auth.user.id,role:result.auth.role};
    if (!(body.action === 'cancel-project' ? canCancelProject(result.project,actor) : body.action === 'delay-measurements' ? canDelayMeasurements(result.project,actor) : canResumeMeasurements(result.project,actor)))
      return NextResponse.json({error:'Only the assigned Outdoor Sales employee can report a client delay.'},{status:403});
    let payload = {};
    try { if(body.action === 'cancel-project') payload=normalizeClientCancellation(body);else if(body.action === 'delay-measurements') payload={note:normalizeMeasurementDelayNote(body.note)}; }
    catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
    const saved=await result.admin.rpc('sync_field_change',{p_operation:crypto.randomUUID(),p_actor:actor.id,p_project:result.project.id,
      p_action:body.action,p_payload:payload,p_recorded_at:new Date().toISOString(),p_expected_updated_at:result.project.updated_at});
    return saved.error?NextResponse.json({error:saved.error.message},{status:409}):NextResponse.json({project:saved.data});
  }
  if(result.project.measurement_delayed)return NextResponse.json({error:"Resume measurements before recording or completing them."},{status:409});
  if(body?.action==='edit-opening'){
    if(result.project.sales_status!=='new_lead')return NextResponse.json({error:'Reopen measurements before editing an opening.'},{status:409});
    const edit=normalizeOpeningEdit(body);
    if(!edit||typeof body.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId))return NextResponse.json({error:'Complete the opening details.'},{status:400});
    const saved=await result.admin.rpc('sync_field_change',{p_operation:body.operationId,p_actor:result.auth.user.id,p_project:result.project.id,
      p_action:'edit-opening',p_payload:edit as unknown as Json,p_recorded_at:new Date().toISOString(),p_expected_updated_at:result.project.updated_at});
    return saved.error?NextResponse.json({error:saved.error.message},{status:409}):NextResponse.json({id:edit.opening.id});
  }
  if (body?.action !== "finish" && body?.action !== "reopen") return NextResponse.json({error:"Invalid measurement action."},{status:400});
  if (body.action === "finish") {
    const {data:openings,error} = await result.admin.from("openings")
      .select("id, floor, room, width, height, quantity, has_arch,opening_type, opening_direction").eq("project_id",result.project.id);
    if (error) return NextResponse.json({error:"Unable to check saved measurements."},{status:500});
    if (!openings?.length || openings.some(row=>{
      const opening = normalizeRegistrationOpening({id:row.id,floor:row.floor,room:"Other",otherRoom:row.room,
        width:Number(row.width),height:Number(row.height),quantity:row.quantity,hasArch:row.has_arch,structuralType:row.opening_type,openingType:row.opening_direction});
      return !opening || opening.openingType !== row.opening_direction;
    })) return NextResponse.json({error:"Save at least one opening and complete the floor, room, dimensions and types for every opening."},{status:400});
  }
  const ready = body.action === "finish";
  const salesStatus = ready ? "ready_for_quotation" : "new_lead";
  const {error} = await result.admin.from("projects").update({sales_status:salesStatus,status:ready ? "Quotation" : "Draft"}).eq("id",result.project.id);
  if (error) return NextResponse.json({error:"Unable to update the project status. Please try again."},{status:500});
  return NextResponse.json({salesStatus});
}
