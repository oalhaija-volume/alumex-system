import { AppShell } from "@/components/AppShell";
import { WorkflowModule } from "@/components/workflow/WorkflowModule";

export default async function ProjectDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const from = Array.isArray(query.from) ? query.from[0] : query.from;

  return (
    <AppShell>
      <WorkflowModule
        projectId={projectId}
        detailEyebrow="Projects"
        detailFallbackTitle="Project details"
        detailDescription="Review project status, assignments, measurements, technical details, and commercial visibility."
        detailBackHref={from === "workflow" ? "/workflow" : "/projects"}
      />
    </AppShell>
  );
}
