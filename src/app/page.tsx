import { AppDataProviders } from "@/components/AppDataProviders";
import { DashboardView } from "@/components/views/DashboardView";

export default function Home() {
  return (
    <AppDataProviders>
      <DashboardView />
    </AppDataProviders>
  );
}
