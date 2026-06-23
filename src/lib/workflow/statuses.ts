export type ProjectWorkflowStatus =
  | "sales_client_created"
  | "sales_opportunity_created"
  | "sales_quotation_created"
  | "sales_contract_created"
  | "finance_down_payment_pending"
  | "finance_down_payment_confirmed"
  | "finance_payment_exception"
  | "operations_manager_review"
  | "project_manager_assigned"
  | "project_engineer_assigned"
  | "site_engineer_assigned"
  | "measurement_pending"
  | "project_description_draft"
  | "audit_pending"
  | "audit_rejected"
  | "audit_approved"
  | "finance_final_check"
  | "branch_manager_review"
  | "approved_for_factory"
  | "sent_to_factory"
  | "factory_in_progress"
  | "factory_completed"
  | "glass_production"
  | "assembly"
  | "final_payment_requested"
  | "final_payment_received"
  | "delivery_pending"
  | "delivered"
  | "installation_in_progress"
  | "installation_completed"
  | "quality_control"
  | "project_handover"
  | "closed";

export const projectWorkflowStatuses: ProjectWorkflowStatus[] = [
  "sales_client_created",
  "sales_opportunity_created",
  "sales_quotation_created",
  "sales_contract_created",
  "finance_down_payment_pending",
  "finance_down_payment_confirmed",
  "finance_payment_exception",
  "operations_manager_review",
  "project_manager_assigned",
  "project_engineer_assigned",
  "site_engineer_assigned",
  "measurement_pending",
  "project_description_draft",
  "audit_pending",
  "audit_rejected",
  "audit_approved",
  "finance_final_check",
  "branch_manager_review",
  "approved_for_factory",
  "sent_to_factory",
  "factory_in_progress",
  "factory_completed",
  "glass_production",
  "assembly",
  "final_payment_requested",
  "final_payment_received",
  "delivery_pending",
  "delivered",
  "installation_in_progress",
  "installation_completed",
  "quality_control",
  "project_handover",
  "closed",
];
