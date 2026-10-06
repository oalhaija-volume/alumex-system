import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
export const salesRoles = ["Admin", "Indoor Sales", "Outdoor Sales"] as const;
export async function salesProject(projectId: string) {
 const auth=await requireRole(salesRoles);
 if(!auth.ok)return {response:NextResponse.json({error:auth.error},{status:auth.status})};
 if(!hasSupabaseServiceRoleKey())return {response:NextResponse.json({error:"Service unavailable."},{status:503})};
 const admin=createAdminClient();
 const {data:project,error}=await admin.from('projects').select('id, project_number, project_name, client_id, address, location_latitude, location_longitude, created_by, structure_readiness, sales_status, next_follow_up_at, project_notes, assigned_outdoor_sales_id').eq('id',projectId).maybeSingle();
 if(error || !project || (auth.role!=='Admin' && project.created_by!==auth.user.id && !(auth.role==='Outdoor Sales'&&project.assigned_outdoor_sales_id===auth.user.id)))return {response:NextResponse.json({error:'Project not found.'},{status:404})};
 return {auth,admin,project};
}
