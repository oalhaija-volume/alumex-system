import { AppShell } from "@/components/AppShell";
import { ContractGenerator } from "@/components/contracts/ContractGenerator";

export default function ContractsPage() {
  return (
    <AppShell>
      <ContractGenerator />
    </AppShell>
  );
}
