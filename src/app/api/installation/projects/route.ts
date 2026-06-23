import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";

const installationRoles = ["Admin", "Installation Head", "Installation Team"] as const;

export async function GET() {
  const authCheck = await requireRole([...installationRoles]);
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
      address,
      workflow_status,
      clients(client_name, mobile, email)
    `)
    .in("workflow_status", [
      "delivered",
      "installation_in_progress",
      "installation_completed",
    ])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
