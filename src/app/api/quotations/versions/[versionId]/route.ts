import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const quotationWorkflowRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;

const allowedActions = new Set([
  "mark_ready",
  "present",
  "send",
  "approve",
  "record_print",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const authCheck = await requireRole(quotationWorkflowRoles);

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

  const { versionId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (!allowedActions.has(action)) {
    return NextResponse.json(
      { error: "Select a valid quotation action." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transition_quotation_version", {
    target_version_id: versionId,
    transition_action: action,
    actor_user_id: authCheck.user.id,
  });

  if (error) {
    console.error("[api/quotations/versions/[versionId]] workflow error", {
      versionId,
      action,
      error,
    });
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to update the quotation version.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ version: data });
}
