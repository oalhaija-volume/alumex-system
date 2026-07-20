import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function OperationsManagerPage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Operations Manager"
        queueDescription="Review projects handed over by Finance. The active workflow currently ends in this queue."
        showProjectStatusCards
        focusStatuses={[
          "finance_down_payment_confirmed",
          "finance_payment_exception",
          "operations_manager_review",
        ]}
        emptyTitle="No operations projects"
        emptyDescription="No projects are currently waiting in the operations manager queue."
      />
    </AppShell>
  );
}
