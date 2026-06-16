import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const deliveryRoles = ["Admin", "Delivery Head"] as const;

export async function GET(request: Request) {
  const authCheck = await requireRole([...deliveryRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const admin = createAdminClient();
  
  const { data, error } = await admin
    .from("projects")
    .select(`
      id,
      project_number,
      project_name,
      client_id,
      address,
      project_workflow_status,
      clients(client_name, mobile, email),
      created_at,
      updated_at
    `)
    .in("project_workflow_status", [
      "final_payment_received",
      "delivery_pending",
      "delivered",
    ])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
