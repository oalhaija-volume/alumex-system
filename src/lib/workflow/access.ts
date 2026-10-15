import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
import { canAccessCRM } from '@/lib/auth/permissions';
export const salesRoles = ["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Outdoor Sales"] as const;
export async function salesProject(projectId: string, crmOnly=false) {
 const auth=await requireRole(salesRoles);
 if(!auth.ok)return {response:NextResponse.json({error:auth.error},{status:auth.status})};
 if(crmOnly&&!canAccessCRM(auth.role))return {response:NextResponse.json({error:'CRM access is limited to Indoor Sales and company leadership.'},{status:403})};
 if(!hasSupabaseServiceRoleKey())return {response:NextResponse.json({error:"Service unavailable."},{status:503})};
 const admin=createAdminClient();
 const {data:project,error}=await admin.from('projects').select('id, project_number, project_name, client_id, address, location_latitude, location_longitude, created_by, structure_readiness, sales_status, next_follow_up_at, follow_up_type, follow_up_detail, follow_up_owner_id, project_notes, updated_at, assigned_outdoor_sales_id').eq('id',projectId).maybeSingle();
 if(error || !project || (!['Admin','Sales Director','CEO','Company Owner','Indoor Sales'].includes(auth.role) && project.created_by!==auth.user.id && !(auth.role==='Outdoor Sales'&&project.assigned_outdoor_sales_id===auth.user.id)))return {response:NextResponse.json({error:'Project not found.'},{status:404})};
 return {auth,admin,project};
}
