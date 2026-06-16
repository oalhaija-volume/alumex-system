import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const factoryRoles = ["Admin"] as const;

export async function GET(request: Request) {
  const authCheck = await requireRole([...factoryRoles, "Installation Head", "Delivery Head"]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const admin = createAdminClient();
  
  let query = admin
    .from("projects")
    .select(`
      id,
      project_number,
      project_name,
      client_id,
      address,
      clients(client_name, mobile, email),
      project_workflow_status,
      created_at,
      updated_at
    `)
    .in("project_workflow_status", [
      "approved_for_factory",
      "sent_to_factory",
      "factory_in_progress",
      "factory_completed",
    ])
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("project_workflow_status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const authCheck = await requireRole(factoryRoles);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = await request.json();
  const { projectId, newStatus } = body;

  if (!projectId || !newStatus) {
    return NextResponse.json(
      { error: "Project ID and new status are required" },
      { status: 400 },
    );
  }

  const validStatuses = [
    "approved_for_factory",
    "sent_to_factory",
    "factory_in_progress",
    "factory_completed",
  ];

  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json(
      { error: "Invalid status for factory operations" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .update({
      project_workflow_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
