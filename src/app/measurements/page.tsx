import { AppShell } from "@/components/AppShell";
import { MeasurementWorkspace } from "@/components/measurements/MeasurementWorkspace";

export default async function MeasurementsPage({ searchParams }: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const params = await searchParams;
  return <AppShell><MeasurementWorkspace initialProjectId={params.projectId} /></AppShell>;
}
