import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const deliveryRoles = ["Admin", "Delivery Head", "Delivery Team"] as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const authCheck = await requireRole([...deliveryRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { assignmentId } = await context.params;

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
    .eq("id", assignmentId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
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

  const { assignmentId } = await context.params;
  const body = await request.json();
  const { status, deliveryDate, notes, markProjectDelivered } = body;

  if (!status) {
    return NextResponse.json(
      { error: "Status is required" },
      { status: 400 },
    );
  }

  const validStatuses = ["pending", "in_progress", "completed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Update delivery assignment
  const { data, error } = await admin
    .from("delivery_assignments")
    .update({
      status,
      delivery_date: deliveryDate || undefined,
      notes: notes || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If status is completed and markProjectDelivered is true, update project status
  if (status === "completed" && markProjectDelivered) {
    const assignment = data as { project_id: string };
    await admin
      .from("projects")
      .update({
        workflow_status: "delivered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.project_id);
  }

  return NextResponse.json(data);
}
