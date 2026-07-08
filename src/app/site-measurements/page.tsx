import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function SiteMeasurementsQueuePage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Site Engineer Measurements"
        queueDescription="Select an assigned project and enter detailed opening measurements."
        queueTarget="measurements"
        showSummaryCards={false}
        focusStatuses={[
          "site_engineer_assigned",
          "measurement_pending",
        ]}
        emptyTitle="No measurement assignments"
        emptyDescription="No projects are currently assigned to you for site measurement."
      />
    </AppShell>
  );
}
