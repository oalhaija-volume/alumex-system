import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

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
  "begin_review",
  "return",
  "approve",
  "assign",
] as const;

type MeasurementAction = (typeof actions)[number];

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
