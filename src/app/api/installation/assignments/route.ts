import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const installationRoles = ["Admin", "Project Manager"] as const;

export async function GET(request: Request) {
  const authCheck = await requireRole([...installationRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
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

  const user = authCheck.user;
  const body = await request.json();
  const { projectId, installationTeamId, notes } = body;

  if (!projectId || !installationTeamId) {
    return NextResponse.json(
      { error: "Project ID and Installation Team ID are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Check if assignment already exists
  const { data: existing } = await admin
    .from("installation_assignments")
    .select("id")
    .eq("project_id", projectId)
    .neq("status", "completed")
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "An active installation assignment already exists for this project" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("installation_assignments")
    .insert([
      {
        project_id: projectId,
        installation_team_id: installationTeamId,
        assigned_by: user.id,
        status: "pending",
        notes: notes || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
