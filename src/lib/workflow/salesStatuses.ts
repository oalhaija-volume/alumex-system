export const projectSalesStatuses = [
  "new_lead",
  "client_registered",
  "structure_not_ready",
  "waiting_for_follow_up",
  "measurement_required",
  "measurement_scheduled",
  "measurement_assigned",
  "measurement_in_progress",
  "measurements_submitted",
  "measurements_under_review",
  "measurements_need_correction",
  "ready_for_quotation",
  "quotation_in_progress",
  "quotation_ready",
  "quotation_presented",
  "quotation_sent",
  "quotation_follow_up",
  "negotiation",
  "quotation_approved",
  "quotation_rejected",
  "client_postponed",
  "client_not_interested",
  "lost",
  "cancelled",
  "contract_preparation",
  "contract_generated",
  "contract_sent",
  "contract_signed",
  "transferred_to_operations",
] as const;

export type ProjectSalesStatus = (typeof projectSalesStatuses)[number];

export const terminalProjectSalesStatuses = [
  "quotation_rejected",
  "client_postponed",
  "client_not_interested",
  "lost",
  "cancelled",
  "transferred_to_operations",
] as const satisfies readonly ProjectSalesStatus[];

const terminalProjectSalesStatusSet = new Set<ProjectSalesStatus>(
  terminalProjectSalesStatuses,
);

const canBecomeLost = new Set<ProjectSalesStatus>([
  "new_lead",
  "client_registered",
  "structure_not_ready",
  "waiting_for_follow_up",
  "measurement_required",
  "measurement_scheduled",
  "measurement_assigned",
  "measurement_in_progress",
  "measurements_submitted",
  "measurements_under_review",
  "measurements_need_correction",
  "ready_for_quotation",
  "quotation_in_progress",
  "quotation_ready",
  "quotation_presented",
  "quotation_sent",
  "quotation_follow_up",
  "negotiation",
]);

const canBeCancelled = new Set<ProjectSalesStatus>([
  ...canBecomeLost,
  "quotation_approved",
  "contract_preparation",
  "contract_generated",
  "contract_sent",
]);

const coreProjectTransitions: Readonly<
  Partial<Record<ProjectSalesStatus, readonly ProjectSalesStatus[]>>
> = {
  new_lead: ["client_registered"],
  client_registered: [
    "structure_not_ready",
    "measurement_required",
    "measurement_in_progress",
  ],
  structure_not_ready: [
    "waiting_for_follow_up",
    "client_postponed",
    "client_not_interested",
  ],
  waiting_for_follow_up: [
    "structure_not_ready",
    "measurement_required",
    "client_postponed",
    "client_not_interested",
  ],
  measurement_required: ["measurement_scheduled", "measurement_assigned"],
  measurement_scheduled: ["measurement_assigned"],
  measurement_assigned: ["measurement_in_progress"],
  measurement_in_progress: ["measurements_submitted", "ready_for_quotation"],
  measurements_submitted: ["measurements_under_review"],
  measurements_under_review: [
    "measurements_need_correction",
    "ready_for_quotation",
  ],
  measurements_need_correction: ["measurement_in_progress"],
  ready_for_quotation: ["quotation_in_progress"],
  quotation_in_progress: ["quotation_ready"],
  quotation_ready: ["quotation_presented", "quotation_sent"],
  quotation_presented: ["quotation_follow_up"],
  quotation_sent: ["quotation_follow_up"],
  quotation_follow_up: [
    "negotiation",
    "quotation_approved",
    "quotation_rejected",
    "client_postponed",
  ],
  negotiation: [
    "quotation_follow_up",
    "quotation_approved",
    "quotation_rejected",
    "client_postponed",
  ],
  quotation_approved: ["contract_preparation"],
  contract_preparation: ["contract_generated"],
  contract_generated: ["contract_sent", "contract_signed"],
  contract_sent: ["contract_signed"],
  contract_signed: ["transferred_to_operations"],
};

export function isProjectSalesStatus(
  value: unknown,
): value is ProjectSalesStatus {
  return projectSalesStatuses.includes(value as ProjectSalesStatus);
}

export function isTerminalProjectSalesStatus(status: ProjectSalesStatus) {
  return terminalProjectSalesStatusSet.has(status);
}

export function allowedProjectSalesTransitions(
  status: ProjectSalesStatus,
): readonly ProjectSalesStatus[] {
  if (isTerminalProjectSalesStatus(status)) {
    return [];
  }

  const terminalTransitions: ProjectSalesStatus[] = [];

  if (canBecomeLost.has(status)) {
    terminalTransitions.push("lost");
  }

  if (canBeCancelled.has(status)) {
    terminalTransitions.push("cancelled");
  }

  return Array.from(
    new Set<ProjectSalesStatus>([
      ...(coreProjectTransitions[status] ?? []),
      ...terminalTransitions,
    ]),
  );
}

export function canTransitionProjectSalesStatus(
  fromStatus: ProjectSalesStatus,
  toStatus: ProjectSalesStatus,
) {
  return allowedProjectSalesTransitions(fromStatus).includes(toStatus);
}

export const measurementStatuses = [
  "not_required_yet",
  "requested",
  "unassigned",
  "assigned",
  "appointment_scheduled",
  "employee_en_route",
  "in_progress",
  "draft_saved",
  "submitted",
  "under_review",
  "correction_required",
  "approved",
  "cancelled",
  "client_unavailable",
  "postponed",
] as const;

export type MeasurementStatus = (typeof measurementStatuses)[number];

export const quotationLifecycleStatuses = [
  "draft",
  "under_preparation",
  "ready_for_review",
  "approved_internally",
  "presented_to_client",
  "printed",
  "sent_to_client",
  "follow_up",
  "under_negotiation",
  "revised",
  "approved_by_client",
  "rejected",
  "expired",
  "cancelled",
  "converted_to_contract",
] as const;

export type QuotationLifecycleStatus =
  (typeof quotationLifecycleStatuses)[number];

export const followUpTaskTypes = [
  "structure_readiness",
  "quotation",
] as const;

export type FollowUpTaskType = (typeof followUpTaskTypes)[number];

export const followUpTaskStatuses = ["open", "completed", "cancelled"] as const;

export type FollowUpTaskStatus = (typeof followUpTaskStatuses)[number];

export const appointmentStatuses = [
  "proposed",
  "confirmed",
  "assigned",
  "completed",
  "postponed",
  "cancelled",
  "client_unavailable",
  "no_show",
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];
