"use client";

import { Suspense, useState } from "react";
import { ContractGenerator } from "@/components/contracts/ContractGenerator";
import { PageHeader } from "@/components/PageHeader";
import { QuotationBuilder } from "@/components/quotations/QuotationBuilder";

type CommercialTab = "quotation" | "contract";

const tabs: Array<{
  id: CommercialTab;
  label: string;
  description: string;
}> = [
  {
    id: "quotation",
    label: "Quotation",
    description: "Price openings and prepare the commercial offer.",
  },
  {
    id: "contract",
    label: "Contract",
    description: "Convert approved quotation data into the client contract.",
  },
];

export function CommercialWorkspace() {
  const [activeTab, setActiveTab] = useState<CommercialTab>("quotation");
  const activeTabDetails = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="Quotation & Contract"
        description="One workspace for offer preparation and contract generation."
      />

      <div className="material-card p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-material-primary text-material-on-primary shadow-[var(--md-elevation-1)]"
                    : "bg-material-surface-container text-muted-strong hover:bg-material-primary-container hover:text-material-on-primary-container"
                }`}
              >
                <span className="block text-sm font-bold">{tab.label}</span>
                <span className="mt-1 block text-xs font-semibold opacity-80">
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="material-card-muted px-4 py-3">
        <p className="text-xs font-bold uppercase text-muted">Current step</p>
        <p className="mt-1 text-sm font-semibold text-muted-strong">
          {activeTabDetails.description}
        </p>
      </div>

      {activeTab === "quotation" ? (
        <Suspense fallback={null}>
          <QuotationBuilder />
        </Suspense>
      ) : (
        <ContractGenerator />
      )}
    </div>
  );
}
