"use client";

import { AppDataProviders } from "@/components/AppDataProviders";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { ContractTemplateSettings } from "@/components/settings/ContractTemplateSettings";
import { DiscountPolicySettings } from "@/components/settings/DiscountPolicySettings";
import { ProductPricingSettings } from "@/components/settings/ProductPricingSettings";
import { OpeningDropdownSettings } from "@/components/settings/OpeningDropdownSettings";
import { UsersSettings } from "@/components/settings/UsersSettings";
import { VehiclesSettings } from "@/components/settings/VehiclesSettings";
import { DriversSettings } from "@/components/settings/DriversSettings";
import { InstallationTeamsSettings } from "@/components/settings/InstallationTeamsSettings";

const settings = [
  ["settings.companyProfile", "settings.companyProfileValue"],
  ["settings.quotationNumbering", "Q-YYYY-0000"],
  ["settings.contractNumbering", "CT-YYYY-0000"],
  ["settings.currency", "settings.currencyValue"],
  ["settings.defaultTaxDisplay", "settings.defaultTaxDisplayValue"],
  ["settings.approvalReminder", "settings.approvalReminderValue"],
];

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("settings.eyebrow")}
          title={t("settings.title")}
          description={t("settings.description")}
        />
        <SectionCard title={t("settings.generalSettings")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {settings.map(([labelKey, valueKey]) => (
              <div
                key={labelKey}
                className="rounded-lg border border-border bg-surface-muted p-4"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {t(labelKey)}
                </p>
                <p className="mt-2 text-sm font-bold text-foreground">
                  {valueKey.startsWith("settings.") ? t(valueKey) : valueKey}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title={t("settings.users")}>
          <UsersSettings />
        </SectionCard>
        <SectionCard title={t("settings.productPricing")}>
          <AppDataProviders>
            <ProductPricingSettings />
          </AppDataProviders>
        </SectionCard>
        <SectionCard title={t("settings.openingDropdowns")}>
          <OpeningDropdownSettings />
        </SectionCard>
        <SectionCard title={t("settings.discountPolicies")}>
          <DiscountPolicySettings />
        </SectionCard>
        <SectionCard title={t("settings.contractTemplate")}>
          <ContractTemplateSettings />
        </SectionCard>
        <SectionCard title="Vehicles">
          <VehiclesSettings />
        </SectionCard>
        <SectionCard title="Drivers">
          <DriversSettings />
        </SectionCard>
        <SectionCard title="Installation Teams">
          <InstallationTeamsSettings />
        </SectionCard>
      </div>
    </AppShell>
  );
}
