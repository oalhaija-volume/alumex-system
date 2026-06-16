import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const installationRoles = ["Admin", "Project Manager"] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const authCheck = await requireRole([...installationRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { assignmentId } = await context.params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("installation_assignments")
    .select(`
      id,
      project_id,
      installation_team_id,
      status,
      completion_date,
      notes,
      created_at,
      updated_at,
      projects(
        id,
        project_number,
        project_name,
        address,
        clients(client_name, mobile, email)
      ),
      installation_teams(
        id,
        team_head_name,
        labor_count,
        phone,
        notes
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
  const authCheck = await requireRole(installationRoles);
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
  const { status, completionDate, notes } = body;

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

  // Get assignment to find project
  const { data: assignment, error: getError } = await admin
    .from("installation_assignments")
    .select("project_id")
    .eq("id", assignmentId)
    .single();

  if (getError || !assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Update assignment
  const { data, error } = await admin
    .from("installation_assignments")
    .update({
      status,
      completion_date: status === "completed" ? (completionDate || new Date().toISOString().split("T")[0]) : undefined,
      notes: notes || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update project status based on assignment status
  if (status === "in_progress") {
    await admin
      .from("projects")
      .update({
        project_workflow_status: "installation_in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.project_id);
  } else if (status === "completed") {
    await admin
      .from("projects")
      .update({
        project_workflow_status: "installation_completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.project_id);
  }

  return NextResponse.json(data);
}
