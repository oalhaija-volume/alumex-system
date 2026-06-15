import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function OperationsManagerPage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Operations Manager"
        queueDescription="Assign project managers and monitor projects after finance handoff through delivery and installation."
        showProjectStatusCards
        focusStatuses={[
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
          "final_payment_requested",
          "final_payment_received",
          "delivery_pending",
          "delivered",
          "installation_in_progress",
          "installation_completed",
        ]}
        emptyTitle="No operations projects"
        emptyDescription="No projects are currently waiting in the operations manager queue."
      />
    </AppShell>
  );
}
