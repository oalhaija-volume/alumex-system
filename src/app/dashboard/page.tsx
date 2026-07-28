import { AppDataProviders } from "@/components/AppDataProviders";
import { DashboardView } from "@/components/views/DashboardView";
import { normalizeDashboardPreviewRole } from "@/lib/dashboard/salesDashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string | string[] }>;
}) {
  const requestedView = (await searchParams).viewAs;
  const previewRole = normalizeDashboardPreviewRole(
    Array.isArray(requestedView) ? requestedView[0] : requestedView,
  );

  return (
    <AppDataProviders>
      <DashboardView previewRole={previewRole} />
    </AppDataProviders>
  );
}
