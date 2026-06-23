import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function SiteMeasurementsQueuePage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Site Measurements"
        queueDescription="Open assigned projects, capture structural openings on site, and complete detailed measurements."
        focusStatuses={[
          "site_engineer_assigned",
          "measurement_pending",
          "project_description_draft",
        ]}
        emptyTitle="No site measurement assignments"
        emptyDescription="No projects are currently assigned for site measurement."
      />
    </AppShell>
  );
}
