import type { AppRole } from "@/lib/auth/roles";
import {
  allowedProjectSalesTransitions,
  type ProjectSalesStatus,
} from "@/lib/workflow/salesStatuses";

const outdoorSalesTransitions = new Set<string>([
  "new_lead:client_registered",
  "client_registered:structure_not_ready",
  "client_registered:measurement_required",
  "client_registered:measurement_in_progress",
  "structure_not_ready:waiting_for_follow_up",
  "measurement_assigned:measurement_in_progress",
  "measurement_in_progress:measurements_submitted",
  "measurement_in_progress:ready_for_quotation",
  "measurements_need_correction:measurement_in_progress",
]);

const reasonRequiredStatuses = new Set<ProjectSalesStatus>([
  "measurements_need_correction",
  "quotation_rejected",
  "client_postponed",
  "client_not_interested",
  "lost",
  "cancelled",
]);

export function transitionRequiresReason(targetStatus: ProjectSalesStatus) {
  return reasonRequiredStatuses.has(targetStatus);
}

export function canRoleTransitionProjectSalesStatus(
  role: AppRole | null,
  fromStatus: ProjectSalesStatus,
  toStatus: ProjectSalesStatus,
) {
  if (!role || !allowedProjectSalesTransitions(fromStatus).includes(toStatus)) {
    return false;
  }

  if (role === "Admin" || role === "Sales Manager") {
    return true;
  }

  if (role === "Outdoor Sales") {
    return outdoorSalesTransitions.has(`${fromStatus}:${toStatus}`);
  }

  return role === "Indoor Sales" || role === "Sales Rep";
}
