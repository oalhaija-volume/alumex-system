import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function ProjectManagerPage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Project Manager"
        queueDescription="Assign project engineers, follow assigned projects, and manage delivery-to-installation progress."
        showProjectStatusCards
        focusStatuses={[
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
        emptyTitle="No project manager assignments"
        emptyDescription="No projects are currently assigned to this project manager queue."
      />
    </AppShell>
  );
}
