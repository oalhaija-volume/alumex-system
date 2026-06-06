"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { calculateQuotationTotals, savedQuotationsStorageKey, type QuotationDraft } from "@/components/quotations/quotationTypes";
import { SectionCard } from "@/components/SectionCard";
import { WorkflowList } from "@/components/WorkflowList";
import { contractStorageKey } from "@/components/contracts/contractTypes";
import { useI18n } from "@/components/i18n/I18nProvider";

export function DashboardView() {
  const { formatCurrency, t, term } = useI18n();
  const { projects } = useProjects();
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [hasCurrentContract, setHasCurrentContract] = useState(false);
  const activeProjects = projects.filter(
    (project) => project.status !== "Completed",
  );
  const projectsWithOpenings = projects.filter(
    (project) => project.structuralOpenings.length > 0,
  );
  const dashboardStats = useMemo(
    () => [
      {
        label: t("dashboard.stats.savedQuotations"),
        value: String(savedQuotations.length),
        detail: t("dashboard.stats.savedQuotationsDetail", {
          count: savedQuotations.length,
        }),
        tone: "blue" as const,
      },
      {
        label: t("dashboard.stats.activeProjects"),
        value: String(activeProjects.length),
        detail: t("dashboard.stats.activeProjectsDetail", {
          count: activeProjects.length,
        }),
        tone: "green" as const,
      },
      {
        label: t("dashboard.stats.projectsReadyForQuotation"),
        value: String(projectsWithOpenings.length),
        detail: t("dashboard.stats.projectsReadyForQuotationDetail", {
          count: projectsWithOpenings.length,
        }),
        tone: "amber" as const,
      },
      {
        label: t("dashboard.stats.currentContract"),
        value: hasCurrentContract ? "1" : "0",
        detail: hasCurrentContract
          ? t("dashboard.stats.currentContractDetail")
          : t("dashboard.stats.noCurrentContractDetail"),
        tone: "red" as const,
      },
    ],
    [
      activeProjects.length,
      hasCurrentContract,
      projectsWithOpenings.length,
      savedQuotations.length,
      t,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedQuotations = window.localStorage.getItem(
        savedQuotationsStorageKey,
      );

      setSavedQuotations(
        storedQuotations
          ? (JSON.parse(storedQuotations) as QuotationDraft[])
          : [],
      );
      setHasCurrentContract(Boolean(window.localStorage.getItem(contractStorageKey)));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("dashboard.eyebrow")}
          title={t("dashboard.title")}
          description={t("dashboard.description")}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => (
            <MetricCard key={stat.label} stat={stat} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <SectionCard title={t("dashboard.quotationActivity")}>
            {savedQuotations.length > 0 ? (
              <WorkflowList
                items={savedQuotations.slice(0, 3).map((quotation) => ({
                  title: quotation.quotationNumber,
                  meta: term(quotation.project.projectName),
                  value: formatCurrency(
                    calculateQuotationTotals(
                      quotation.lines,
                      quotation.discountPercent,
                    ).grandTotal,
                  ),
                }))}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
                {t("dashboard.noQuotationActivity")}
              </p>
            )}
          </SectionCard>
          <SectionCard title={t("dashboard.upcomingDeadlines")}>
            {activeProjects.length > 0 ? (
              <WorkflowList
                items={activeProjects.slice(0, 3).map((project) => ({
                  title: term(project.projectName),
                  meta: `${term(project.client)} - ${term(project.salesEngineer)}`,
                  value: term(project.status),
                }))}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
                {t("dashboard.noActiveProjects")}
              </p>
            )}
          </SectionCard>
        </section>
      </div>
    </AppShell>
  );
}
