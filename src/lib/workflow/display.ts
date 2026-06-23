import type { AppRole } from "@/lib/auth/roles";
import { canViewFinanceValues } from "@/lib/auth/roles";
import {
  projectWorkflowStatuses,
  type ProjectWorkflowStatus,
} from "@/lib/workflow/statuses";

export type CommercialVisibility = "full" | "finance" | "hidden";
export type WorkflowStage =
  | "Sales"
  | "Finance"
  | "Operations"
  | "Project Manager"
  | "Site Measurement"
  | "Audit"
  | "Branch Approval"
  | "Factory"
  | "Final Payment"
  | "Delivery"
  | "Installation";

export const workflowStages: WorkflowStage[] = [
  "Sales",
  "Finance",
  "Operations",
  "Project Manager",
  "Site Measurement",
  "Audit",
  "Branch Approval",
  "Factory",
  "Final Payment",
  "Delivery",
  "Installation",
];

export const workflowStatusLabels: Record<ProjectWorkflowStatus, string> = {
  sales_client_created: "Preparing Quotation",
  sales_opportunity_created: "Opportunity",
  sales_quotation_created: "Awaiting Contract",
  sales_contract_created: "Awaiting Finance Approval",
  finance_down_payment_pending: "Waiting For Down Payment",
  finance_down_payment_confirmed: "Ready For Operations",
  finance_payment_exception: "Finance Exception Approved",
  operations_manager_review: "Waiting for Operations Assignment",
  project_manager_assigned: "Waiting For Project Engineer",
  project_engineer_assigned: "Waiting For Site Engineer",
  site_engineer_assigned: "Ready For Site Measurement",
  measurement_pending: "Site Measurement Pending",
  project_description_draft: "Project Description In Progress",
  audit_pending: "Waiting For Audit",
  audit_rejected: "Audit Rework Required",
  audit_approved: "Audit Approved",
  finance_final_check: "Waiting For Finance Check",
  branch_manager_review: "Waiting For Branch Approval",
  approved_for_factory: "Approved For Factory",
  sent_to_factory: "Sent To Factory",
  factory_in_progress: "In Production",
  factory_completed: "Production Completed",
  glass_production: "Glass Production",
  assembly: "Assembly",
  final_payment_requested: "Waiting Final Payment",
  final_payment_received: "Ready For Delivery",
  delivery_pending: "Waiting Delivery",
  delivered: "Delivered To Site",
  installation_in_progress: "Installation In Progress",
  installation_completed: "Installation Completed",
  quality_control: "Quality Control",
  project_handover: "Project Handover",
  closed: "Closed",
};

export const workflowStatusStages: Record<ProjectWorkflowStatus, WorkflowStage> = {
  sales_client_created: "Sales",
  sales_opportunity_created: "Sales",
  sales_quotation_created: "Sales",
  sales_contract_created: "Finance",
  finance_down_payment_pending: "Finance",
  finance_down_payment_confirmed: "Operations",
  finance_payment_exception: "Operations",
  operations_manager_review: "Operations",
  project_manager_assigned: "Project Manager",
  project_engineer_assigned: "Project Manager",
  site_engineer_assigned: "Site Measurement",
  measurement_pending: "Site Measurement",
  project_description_draft: "Site Measurement",
  audit_pending: "Audit",
  audit_rejected: "Audit",
  audit_approved: "Finance",
  finance_final_check: "Finance",
  branch_manager_review: "Branch Approval",
  approved_for_factory: "Factory",
  sent_to_factory: "Factory",
  factory_in_progress: "Factory",
  factory_completed: "Final Payment",
  glass_production: "Factory",
  assembly: "Factory",
  final_payment_requested: "Final Payment",
  final_payment_received: "Delivery",
  delivery_pending: "Delivery",
  delivered: "Installation",
  installation_in_progress: "Installation",
  installation_completed: "Installation",
  quality_control: "Installation",
  project_handover: "Installation",
  closed: "Installation",
};

export const workflowNextActions: Record<ProjectWorkflowStatus, string> = {
  sales_client_created: "Sales creates quotation",
  sales_opportunity_created: "Sales qualifies opportunity",
  sales_quotation_created: "Sales creates contract",
  sales_contract_created: "Finance confirms down payment",
  finance_down_payment_pending: "Finance confirms payment or exception",
  finance_down_payment_confirmed: "Operations manager assigns project manager",
  finance_payment_exception: "Operations manager assigns project manager",
  operations_manager_review: "Operations manager assigns project manager",
  project_manager_assigned: "Project manager assigns project engineer",
  project_engineer_assigned: "Project engineer assigns site engineer",
  site_engineer_assigned: "Project engineer starts site measurement",
  measurement_pending: "Project engineer creates project description",
  project_description_draft: "Project engineer sends description to auditor",
  audit_pending: "Auditor approves or rejects",
  audit_rejected: "Project engineer updates project description",
  audit_approved: "Finance starts final check",
  finance_final_check: "Finance completes final check",
  branch_manager_review: "Branch manager approves factory release",
  approved_for_factory: "Project engineer marks sent to factory",
  sent_to_factory: "Factory progress is tracked",
  factory_in_progress: "Factory marks completion outside user access",
  factory_completed: "Finance requests final payment",
  glass_production: "Glass production is tracked",
  assembly: "Assembly is tracked",
  final_payment_requested: "Finance confirms final payment",
  final_payment_received: "Delivery head prepares delivery",
  delivery_pending: "Delivery head confirms delivery",
  delivered: "Project manager starts installation",
  installation_in_progress: "Project manager marks completion",
  installation_completed: "No further action required",
  quality_control: "QC inspects installation",
  project_handover: "Project handover is confirmed",
  closed: "Project is closed",
};

export function workflowStatusLabel(status: ProjectWorkflowStatus) {
  return workflowStatusLabels[status] ?? status;
}

export function workflowNextAction(status: ProjectWorkflowStatus) {
  return workflowNextActions[status] ?? "Review project";
}

export function workflowStageForStatus(status: ProjectWorkflowStatus) {
  return workflowStatusStages[status] ?? "Sales";
}

export function isWorkflowStatus(value: unknown): value is ProjectWorkflowStatus {
  return projectWorkflowStatuses.includes(value as ProjectWorkflowStatus);
}

export function commercialVisibilityForRole(
  role: AppRole | null,
): CommercialVisibility {
  if (canViewFinanceValues(role)) {
    return "full";
  }

  return "hidden";
}
