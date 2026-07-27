import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { loadOutdoorSalesProjectIds } from "@/lib/projects/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const roles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireRole(roles);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { projectId } = await context.params;
  if (!uuidPattern.test(projectId)) {
    return NextResponse.json({ error: "A valid project id is required." }, { status: 400 });
  }
  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json({ error: supabaseServiceRoleError }, { status: 500 });
  }
  if (auth.role === "Outdoor Sales") {
    const scope = await loadOutdoorSalesProjectIds(auth.user.id);
    if (scope.error || !scope.ids.has(projectId)) {
      return NextResponse.json(
        { error: scope.error ? "Unable to verify project access." : "Assigned project access is required." },
        { status: scope.error ? 500 : 403 },
      );
    }
  }

  const admin = createAdminClient();
  const projectPromise = admin
    .from("projects")
    .select("id, client_id, original_source, original_creator_id, original_creator_role, owner_id, responsible_user_id, responsible_department, sales_status, structure_readiness, expected_structure_ready_date, priority, estimated_value, engineer_name, consultant_name, contractor_name, project_notes, created_at")
    .eq("id", projectId)
    .maybeSingle();
  const contactsPromise = admin
    .from("client_contacts")
    .select("id, contact_type, contact_name, role_title, mobile, whatsapp, email, is_primary")
    .eq("project_id", projectId)
    .order("is_primary", { ascending: false });
  const statusPromise = admin
    .from("project_status_history")
    .select("id, previous_status, new_status, changed_by, changed_by_role, reason, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const ownershipPromise = admin
    .from("project_ownership_history")
    .select("id, previous_owner_id, new_owner_id, changed_by, changed_by_role, reason, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const [projectResult, contactsResult, statusResult, ownershipResult] =
    await Promise.all([
      projectPromise,
      contactsPromise,
      statusPromise,
      ownershipPromise,
    ]);
  const error =
    projectResult.error ??
    contactsResult.error ??
    statusResult.error ??
    ownershipResult.error;
  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load the sales profile.") },
      { status: 500 },
    );
  }
  if (!projectResult.data) {
    return NextResponse.json({ error: "Project was not found." }, { status: 404 });
  }

  const profileIds = Array.from(
    new Set(
      [
        projectResult.data.original_creator_id,
        projectResult.data.owner_id,
        projectResult.data.responsible_user_id,
        ...(statusResult.data ?? []).map((item) => item.changed_by),
        ...(ownershipResult.data ?? []).flatMap((item) => [
          item.previous_owner_id,
          item.new_owner_id,
          item.changed_by,
        ]),
      ].filter((id): id is string => Boolean(id)),
    ),
  );
  const profilesResult =
    profileIds.length > 0
      ? await admin.from("profiles").select("id, full_name, email").in("id", profileIds)
      : { data: [], error: null };
  if (profilesResult.error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(profilesResult.error, "Unable to load employee names.") },
      { status: 500 },
    );
  }
  const names = Object.fromEntries(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || profile.email,
    ]),
  );
  return NextResponse.json({
    project: projectResult.data,
    contacts: contactsResult.data ?? [],
    statusHistory: statusResult.data ?? [],
    ownershipHistory: ownershipResult.data ?? [],
    profileNames: names,
  });
}
