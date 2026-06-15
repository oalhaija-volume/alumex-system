import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function ProjectEngineerPage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Project Engineer"
        queueDescription="Assign site engineers, complete measurements, prepare project descriptions, and track factory progress."
        showProjectStatusCards
        focusStatuses={[
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
        emptyTitle="No project engineer assignments"
        emptyDescription="No projects are currently assigned to this project engineer queue."
      />
    </AppShell>
  );
}
