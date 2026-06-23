import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";

export type LifecycleStageKey =
  | "lead"
  | "opportunity"
  | "quotation"
  | "contract"
  | "advance_payment_received"
  | "operations_assignment"
  | "project_manager_assignment"
  | "project_engineer_assignment"
  | "site_measurements"
  | "engineering_definition"
  | "audit_approval"
  | "production"
  | "glass_production"
  | "assembly"
  | "final_payment_collection"
  | "delivery"
  | "installation"
  | "quality_control"
  | "project_handover"
  | "closed";

export type LifecycleStage = {
  key: LifecycleStageKey;
  sequence: number;
  label: string;
  defaultSlaDays: number | null;
};

export const lifecycleStages: LifecycleStage[] = [
  { key: "lead", sequence: 1, label: "Lead", defaultSlaDays: 2 },
  { key: "opportunity", sequence: 2, label: "Opportunity", defaultSlaDays: 3 },
  { key: "quotation", sequence: 3, label: "Quotation", defaultSlaDays: 3 },
  { key: "contract", sequence: 4, label: "Contract", defaultSlaDays: 5 },
  {
    key: "advance_payment_received",
    sequence: 5,
    label: "Advance Payment Received",
    defaultSlaDays: 3,
  },
  {
    key: "operations_assignment",
    sequence: 6,
    label: "Operations Assignment",
    defaultSlaDays: 1,
  },
  {
    key: "project_manager_assignment",
    sequence: 7,
    label: "Project Manager Assignment",
    defaultSlaDays: 1,
  },
  {
    key: "project_engineer_assignment",
    sequence: 8,
    label: "Project Engineer Assignment",
    defaultSlaDays: 1,
  },
  {
    key: "site_measurements",
    sequence: 9,
    label: "Site Measurements",
    defaultSlaDays: 3,
  },
  {
    key: "engineering_definition",
    sequence: 10,
    label: "Engineering Definition",
    defaultSlaDays: 5,
  },
  {
    key: "audit_approval",
    sequence: 11,
    label: "Audit Approval",
    defaultSlaDays: 2,
  },
  { key: "production", sequence: 12, label: "Production", defaultSlaDays: 10 },
  {
    key: "glass_production",
    sequence: 13,
    label: "Glass Production",
    defaultSlaDays: 5,
  },
  { key: "assembly", sequence: 14, label: "Assembly", defaultSlaDays: 4 },
  {
    key: "final_payment_collection",
    sequence: 15,
    label: "Final Payment Collection",
    defaultSlaDays: 3,
  },
  { key: "delivery", sequence: 16, label: "Delivery", defaultSlaDays: 2 },
  { key: "installation", sequence: 17, label: "Installation", defaultSlaDays: 7 },
  { key: "quality_control", sequence: 18, label: "Quality Control", defaultSlaDays: 2 },
  { key: "project_handover", sequence: 19, label: "Project Handover", defaultSlaDays: 1 },
  { key: "closed", sequence: 20, label: "Closed", defaultSlaDays: null },
];

export const lifecycleStageByKey = new Map(
  lifecycleStages.map((stage) => [stage.key, stage]),
);

export const workflowStatusLifecycleStages: Record<
  ProjectWorkflowStatus,
  LifecycleStageKey
> = {
  sales_client_created: "lead",
  sales_opportunity_created: "opportunity",
  sales_quotation_created: "quotation",
  sales_contract_created: "contract",
  finance_down_payment_pending: "contract",
  finance_down_payment_confirmed: "advance_payment_received",
  finance_payment_exception: "advance_payment_received",
  operations_manager_review: "operations_assignment",
  project_manager_assigned: "project_manager_assignment",
  project_engineer_assigned: "project_engineer_assignment",
  site_engineer_assigned: "site_measurements",
  measurement_pending: "site_measurements",
  project_description_draft: "engineering_definition",
  audit_pending: "audit_approval",
  audit_rejected: "engineering_definition",
  audit_approved: "audit_approval",
  finance_final_check: "final_payment_collection",
  branch_manager_review: "final_payment_collection",
  approved_for_factory: "production",
  sent_to_factory: "production",
  factory_in_progress: "production",
  factory_completed: "assembly",
  glass_production: "glass_production",
  assembly: "assembly",
  final_payment_requested: "final_payment_collection",
  final_payment_received: "delivery",
  delivery_pending: "delivery",
  delivered: "installation",
  installation_in_progress: "installation",
  installation_completed: "quality_control",
  quality_control: "quality_control",
  project_handover: "project_handover",
  closed: "closed",
};

export function lifecycleStageForWorkflowStatus(status: ProjectWorkflowStatus) {
  return lifecycleStageByKey.get(workflowStatusLifecycleStages[status]);
}
