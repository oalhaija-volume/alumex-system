import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { ContractGenerator } from "@/components/contracts/ContractGenerator";

export default function ContractsPage() {
  return (
    <AppDataProviders>
      <AppShell>
        <ContractGenerator />
      </AppShell>
    </AppDataProviders>
  );
}
