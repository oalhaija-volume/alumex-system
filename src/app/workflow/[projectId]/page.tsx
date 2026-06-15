import { redirect } from "next/navigation";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  redirect(`/projects/${projectId}?from=workflow`);
}
