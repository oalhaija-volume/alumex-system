import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";

export default function QuotationsPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <QuotationBuilder />
      </Suspense>
    </AppShell>
  );
}
