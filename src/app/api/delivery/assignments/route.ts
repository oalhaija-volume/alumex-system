import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const deliveryRoles = ["Admin", "Delivery Head", "Delivery Team"] as const;

export async function GET() {
  const authCheck = await requireRole([...deliveryRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("delivery_assignments")
    .select(`
      id,
      project_id,
      delivery_date,
      status,
      notes,
      created_at,
      updated_at,
      projects(
        id,
        project_number,
        project_name,
        client_id,
        address,
        clients(client_name, mobile, email)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authCheck = await requireRole(deliveryRoles);
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

  const user = authCheck.user;
  const body = await request.json();
  const { projectId, deliveryDate, notes } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: "Project ID is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Check if assignment already exists
  const { data: existing } = await admin
    .from("delivery_assignments")
    .select("id")
    .eq("project_id", projectId)
    .neq("status", "completed")
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "An active delivery assignment already exists for this project" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("delivery_assignments")
    .insert([
      {
        project_id: projectId,
        delivery_date: deliveryDate || null,
        status: "pending",
        notes: notes || null,
        created_by: user.id,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
