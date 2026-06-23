import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default function QualityControlPage() {
  return (
    <AppShell>
      <WorkflowModule
        queueTitle="Quality Control"
        queueDescription="Review projects after installation completion and prepare QC checks."
        focusStatuses={["installation_completed"]}
        emptyTitle="No projects ready for QC"
        emptyDescription="Completed installations will appear here for quality control review."
      />
    </AppShell>
  );
}
