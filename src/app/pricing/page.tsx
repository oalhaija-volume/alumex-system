"use client";

import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { ProductPricingSettings } from "@/components/settings/ProductPricingSettings";

export default function PricingPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Administration"
          title="Service & Product Pricing"
          description="Set the selling price and unit for services, systems, materials, variants, and add-ons."
        />
        <SectionCard title="Pricing catalog">
          <AppDataProviders>
            <ProductPricingSettings />
          </AppDataProviders>
        </SectionCard>
      </div>
    </AppShell>
  );
}
