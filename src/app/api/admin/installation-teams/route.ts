import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

type InstallationTeamPayload = {
  team_head_name?: unknown;
  labor_count?: unknown;
  phone?: unknown;
  notes?: unknown;
  is_active?: unknown;
};

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("installation_teams")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authCheck = await requireAdminUser();
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
  const body: InstallationTeamPayload = await request.json();

  // Validate input
  const teamHeadName = typeof body.team_head_name === "string" ? body.team_head_name.trim() : "";
  const laborCount = typeof body.labor_count === "number" ? body.labor_count : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!teamHeadName || laborCount === null || laborCount <= 0) {
    return NextResponse.json(
      { error: "Team head name and labor count (positive number) are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("installation_teams")
    .insert([
      {
        team_head_name: teamHeadName,
        labor_count: laborCount,
        phone: phone || null,
        notes: notes || null,
        is_active: true,
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

export async function PUT(request: Request) {
  const authCheck = await requireAdminUser();
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

  const body: InstallationTeamPayload & { id: string } = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("installation_teams")
    .update({
      team_head_name: typeof updates.team_head_name === "string" ? updates.team_head_name.trim() : undefined,
      labor_count: typeof updates.labor_count === "number" ? updates.labor_count : undefined,
      phone: typeof updates.phone === "string" ? updates.phone.trim() : undefined,
      notes: typeof updates.notes === "string" ? updates.notes.trim() : undefined,
      is_active: typeof updates.is_active === "boolean" ? updates.is_active : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const authCheck = await requireAdminUser();
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("installation_teams").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
