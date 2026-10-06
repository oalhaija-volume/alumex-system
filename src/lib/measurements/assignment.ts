import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createInternalNotification } from "@/lib/notifications/server";

export async function validateOutdoorAssignee(
  admin: ReturnType<typeof createAdminClient>,
  assigneeId: string | null,
) {
  if (!assigneeId) return "Select an Outdoor Sales employee.";
  const { data, error } = await admin.from("profiles")
    .select("id, role, is_active, status").eq("id", assigneeId).maybeSingle();
  if (error || !data || data.role !== "Outdoor Sales" ||
      !data.is_active || data.status === "Inactive") {
    return "Select an active Outdoor Sales employee.";
  }
  return null;
}

export async function notifyMeasurementAssignment(request: {
  id: string;
  project_id: string;
  assigned_to: string | null;
  assigned_at?: string | null;
}) {
  if (!request.assigned_to) return undefined;
  try {
    await createInternalNotification({
      recipientId: request.assigned_to,
      kind: "action_required",
      eventType: "measurement_assigned",
      entityType: "project",
      entityId: request.project_id,
      titleKey: "notifications.measurementAssigned",
      messageKey: "notifications.collectInitialMeasurements",
      linkPath: `/site-measurements/${request.project_id}`,
      payload: { measurement_request_id: request.id },
      deduplicationKey: `measurement-assigned:${request.id}:${request.assigned_to}:${request.assigned_at ?? "initial"}`,
    });
    return undefined;
  } catch {
    return "The measurement request was saved, but its notification could not be delivered. Reassign the request to retry.";
  }
}
