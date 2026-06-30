import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { CommercialWorkspace } from "@/components/commercial/CommercialWorkspace";

export default function CommercialPage() {
  return (
    <AppDataProviders>
      <AppShell>
        <CommercialWorkspace />
      </AppShell>
    </AppDataProviders>
  );
}
