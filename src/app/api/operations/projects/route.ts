import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const operationsRoles = ["Admin", "Operations Manager"] as const;
const operationsStatuses = [
  "finance_down_payment_confirmed",
  "finance_payment_exception",
  "operations_manager_review",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clientName(
  value:
    | { client_name: string | null }
    | Array<{ client_name: string | null }>
    | null,
) {
  return (Array.isArray(value) ? value[0] : value)?.client_name ?? "";
}

export async function GET() {
  const authCheck = await requireRole(operationsRoles);

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

  try {
    const admin = createAdminClient();
    const [projectsResult, profilesResult] = await Promise.all([
      admin
        .from("projects")
        .select(
          "id, project_number, project_name, branch, project_type, address, status, workflow_status, sales_engineer_id, clients(client_name)",
        )
        .in("workflow_status", [...operationsStatuses])
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, full_name, email"),
    ]);
    const error = projectsResult.error ?? profilesResult.error;

    if (error) {
      throw error;
    }

    const salesOwners = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.id,
        profile.full_name?.trim() || profile.email || "",
      ]),
    );

    return NextResponse.json({
      projects: (projectsResult.data ?? []).map((project) => ({
        id: project.id,
        projectNumber: project.project_number,
        projectName: project.project_name,
        branch: project.branch,
        projectType: project.project_type ?? "",
        address: project.address ?? "",
        clientName: clientName(project.clients),
        salesOwner:
          salesOwners.get(project.sales_engineer_id ?? "") ?? "",
        paymentStatus:
          project.workflow_status === "finance_payment_exception"
            ? "Finance exception approved"
            : "Payment received",
        isCompleted: project.status === "Completed",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to load Operations projects.",
        ),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authCheck = await requireRole(operationsRoles);

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

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
    action?: unknown;
  } | null;
  const projectId =
    typeof body?.projectId === "string" ? body.projectId : "";

  if (!uuidPattern.test(projectId) || body?.action !== "complete") {
    return NextResponse.json(
      { error: "A valid project completion request is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, status, workflow_status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          projectError,
          "Unable to load the project.",
        ),
      },
      { status: 500 },
    );
  }

  if (
    !project ||
    !operationsStatuses.includes(
      project.workflow_status as (typeof operationsStatuses)[number],
    )
  ) {
    return NextResponse.json(
      { error: "This project is not available in Operations." },
      { status: 404 },
    );
  }

  if (project.status === "Completed") {
    return NextResponse.json({ project: { id: projectId, isCompleted: true } });
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("projects")
    .update({
      status: "Completed",
      workflow_status: "operations_manager_review",
      operations_manager_id: authCheck.user.id,
    })
    .eq("id", projectId);

  if (updateError) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          updateError,
          "Unable to complete the project.",
        ),
      },
      { status: 500 },
    );
  }

  const { error: eventError } = await admin
    .from("project_workflow_events")
    .insert({
      project_id: projectId,
      event_type: "operations_completed",
      from_workflow_status: project.workflow_status,
      to_workflow_status: "operations_manager_review",
      actor_id: authCheck.user.id,
      notes: "Operations Manager marked the project completed",
      metadata: { completedAt },
    });

  if (eventError) {
    console.error("[api/operations/projects] completion event failed", eventError);
  }

  return NextResponse.json({
    project: { id: projectId, isCompleted: true, completedAt },
  });
}
