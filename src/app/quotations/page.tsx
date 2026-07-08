import { Suspense } from "react";
import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";

export default function QuotationsPage() {
  return (
    <AppDataProviders>
      <AppShell>
        <Suspense fallback={null}>
          <QuotationBuilder />
        </Suspense>
      </AppShell>
    </AppDataProviders>
  );
}
