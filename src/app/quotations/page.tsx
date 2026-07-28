import { Suspense } from "react";
import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { QuotationContractWorkspace } from "@/components/quotations/QuotationContractWorkspace";

export default function QuotationsPage() {
  return (
    <AppDataProviders>
      <AppShell>
        <Suspense fallback={null}>
          <QuotationContractWorkspace />
        </Suspense>
      </AppShell>
    </AppDataProviders>
  );
}
