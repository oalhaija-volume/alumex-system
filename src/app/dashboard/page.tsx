import { AppDataProviders } from "@/components/AppDataProviders";
import { DashboardView } from "@/components/views/DashboardView";

export default function DashboardPage() {
  return (
    <AppDataProviders>
      <DashboardView />
    </AppDataProviders>
  );
}
