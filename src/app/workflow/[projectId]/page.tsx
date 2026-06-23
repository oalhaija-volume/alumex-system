import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <AppShell>
      <WorkflowModule
        projectId={projectId}
        detailEyebrow="Workflow"
        detailFallbackTitle="Project details"
        detailDescription="Review project status, assignments, measurements, technical details, and commercial visibility."
        detailBackHref="/workflow"
      />
    </AppShell>
  );
}
