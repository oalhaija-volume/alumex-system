"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";
import { useI18n } from "@/components/i18n/I18nProvider";

const ContractGenerator = dynamic(
  () =>
    import("@/components/contracts/ContractGenerator").then(
      (module) => module.ContractGenerator,
    ),
  {
    loading: () => (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm font-semibold text-muted">
        Loading contracts…
      </div>
    ),
  },
);

export function QuotationContractWorkspace() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const activeView =
    searchParams.get("view") === "contracts" ? "contracts" : "quotations";

  return (
    <div className="space-y-6">
      <nav
        aria-label={t("quotations.workspaceTabs")}
        className="grid overflow-hidden rounded-lg border border-border bg-surface p-1 sm:inline-grid sm:grid-cols-2"
      >
        <Link
          href="/quotations"
          aria-current={activeView === "quotations" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-bold transition ${
            activeView === "quotations"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-strong hover:bg-surface-muted"
          }`}
        >
          {t("quotations.tabQuotations")}
        </Link>
        <Link
          href="/quotations?view=contracts"
          aria-current={activeView === "contracts" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-bold transition ${
            activeView === "contracts"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-strong hover:bg-surface-muted"
          }`}
        >
          {t("quotations.tabContracts")}
        </Link>
      </nav>

      {activeView === "contracts" ? <ContractGenerator /> : <QuotationBuilder />}
    </div>
  );
}
