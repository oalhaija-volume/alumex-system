import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import type { AppRole } from "@/lib/auth/roles";

const measurementWorkspaceRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Project Engineer",
  "Site Engineer",
] as const;

const actions = [
  "start",
  "en_route",
  "save_draft",
  "submit",
  "complete",
  "begin_review",
  "return",
  "approve",
  "assign",
] as const;

type MeasurementAction = (typeof actions)[number];

async function completeMeasurementsForQuotation(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  actor: {
    id: string;
    role: AppRole;
  },
) {
  const { data: measurementRequest, error: requestError } = await admin
    .from("measurement_requests")
    .select("id, project_id, assigned_to, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !measurementRequest) {
    throw new Error(requestError?.message ?? "Measurement request was not found.");
  }

  const fieldRoles = new Set([
    "Admin",
    "Outdoor Sales",
    "Project Engineer",
    "Site Engineer",
  ]);
  if (
    !fieldRoles.has(actor.role) ||
    (actor.role !== "Admin" &&
      measurementRequest.assigned_to !== actor.id)
  ) {
    throw new Error("Only the assigned measurement employee can complete this visit.");
  }

  if (measurementRequest.status === "approved") {
    return measurementRequest;
  }

  let currentStatus = measurementRequest.status;
  if (["in_progress", "draft_saved"].includes(currentStatus)) {
    const { error: submitError } = await admin.rpc(
      "advance_measurement_workflow",
      {
        target_request_id: requestId,
        workflow_action: "submit",
        actor_user_id: actor.id,
        action_note: "Measurements saved and completed for quotation.",
      },
    );
    if (submitError) throw submitError;
    currentStatus = "submitted";
  }

  if (!["submitted", "under_review"].includes(currentStatus)) {
    throw new Error("Start the measurement visit before completing it.");
  }

  const { data: submission, error: submissionError } = await admin
    .from("measurement_submissions")
    .select("id")
    .eq("measurement_request_id", requestId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (submissionError || !submission) {
    throw new Error(
      submissionError?.message ?? "No saved measurement submission was found.",
    );
  }

  const completedAt = new Date().toISOString();
  const { error: approvalError } = await admin
    .from("measurement_submissions")
    .update({
      status: "approved",
      reviewed_by: actor.id,
      reviewed_at: completedAt,
      review_note: null,
    })
    .eq("id", submission.id);
  if (approvalError) throw approvalError;

  const { error: completionError } = await admin
    .from("measurement_requests")
    .update({ status: "approved", completed_at: completedAt })
    .eq("id", requestId);
  if (completionError) throw completionError;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("sales_status")
    .eq("id", measurementRequest.project_id)
    .maybeSingle();
  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Project was not found.");
  }

  const previousStatus = project.sales_status;
  const { error: projectUpdateError } = await admin
    .from("projects")
    .update({
      sales_status: "ready_for_quotation",
      last_updated_by: actor.id,
      updated_at: completedAt,
    })
    .eq("id", measurementRequest.project_id);
  if (projectUpdateError) throw projectUpdateError;

  if (previousStatus !== "ready_for_quotation") {
    const { error: historyError } = await admin
      .from("project_status_history")
      .insert({
        project_id: measurementRequest.project_id,
        previous_status: previousStatus,
        new_status: "ready_for_quotation",
        changed_by: actor.id,
        changed_by_role: actor.role,
        reason: "Measurements saved and completed for quotation.",
      });
    if (historyError) throw historyError;
  }

  const { error: auditError } = await admin.from("audit_events").insert({
    actor_id: actor.id,
    actor_role: actor.role,
    action: "measurement_complete",
    entity_type: "measurement_request",
    entity_id: requestId,
    previous_value: { status: currentStatus },
    new_value: { status: "approved", project_status: "ready_for_quotation" },
    reason: "Measurements saved and completed for quotation.",
  });
  if (auditError) throw auditError;

  return {
    ...measurementRequest,
    status: "approved",
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireRole(measurementWorkspaceRoles);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { requestId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
        note?: unknown;
        assignedTo?: unknown;
        preferredAt?: unknown;
      }
    | null;
  const action =
    typeof body?.action === "string" &&
    actions.includes(body.action as MeasurementAction)
      ? (body.action as MeasurementAction)
      : null;

  if (!action) {
    return NextResponse.json(
      { error: "Select a valid measurement action." },
      { status: 400 },
    );
  }

  const note = typeof body?.note === "string" ? body.note.trim() : null;
  if (action === "return" && !note) {
    return NextResponse.json(
      { error: "A correction reason is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const assignedTo =
    typeof body?.assignedTo === "string" ? body.assignedTo.trim() : "";
  const preferredAt =
    typeof body?.preferredAt === "string" && body.preferredAt
      ? new Date(body.preferredAt).toISOString()
      : null;
  const result =
    action === "assign"
      ? assignedTo
        ? await admin.rpc("assign_measurement_request", {
            target_request_id: requestId,
            target_assignee_id: assignedTo,
            target_preferred_at: preferredAt,
            assignment_note: note,
            actor_user_id: auth.user.id,
          })
        : {
            data: null,
            error: { message: "Select a measurement assignee." },
          }
      : action === "complete"
        ? await completeMeasurementsForQuotation(
            admin,
            requestId,
            { id: auth.user.id, role: auth.role },
          )
            .then((data) => ({ data, error: null }))
            .catch((error: unknown) => ({
              data: null,
              error:
                error instanceof Error
                  ? { message: error.message }
                  : { message: "Unable to complete measurements." },
            }))
      : await admin.rpc("advance_measurement_workflow", {
          target_request_id: requestId,
          workflow_action: action,
          actor_user_id: auth.user.id,
          action_note: note,
        });
  const { data, error } = result;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data });
}
