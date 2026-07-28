"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { calculateQuotationTotals, type QuotationDraft } from "@/components/quotations/quotationTypes";
import { loadSupabaseQuotations } from "@/components/quotations/supabaseQuotations";
import { SectionCard } from "@/components/SectionCard";
import { WorkflowList } from "@/components/WorkflowList";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import { canViewSalesPrices } from "@/lib/auth/roles";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { SalesRoleDashboard } from "@/components/dashboard/SalesRoleDashboard";
import { salesDashboardKind } from "@/lib/dashboard/salesDashboard";
import {
  dashboardPreviewRoles,
  type DashboardPreviewRole,
} from "@/lib/dashboard/salesDashboard";

export function DashboardView({
  previewRole = null,
}: {
  previewRole?: DashboardPreviewRole | null;
}) {
  const { formatCurrency, t, term } = useI18n();
  const { role } = useCurrentRole();
  const { projects } = useProjects();
  const showSalesPrices = canViewSalesPrices(role);
  const showSalesRoleDashboard = salesDashboardKind(role) !== null;
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [contractCount, setContractCount] = useState(0);
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
        value: String(contractCount),
        detail:
          contractCount > 0
            ? t("dashboard.stats.currentContractDetail")
            : t("dashboard.stats.noCurrentContractDetail"),
        tone: "red" as const,
      },
    ],
    [
      activeProjects.length,
      contractCount,
      projectsWithOpenings.length,
      savedQuotations.length,
      t,
    ],
  );

  useEffect(() => {
    if (showSalesRoleDashboard) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const supabase = createSupabaseClient();
        const [quotations, { count }] = await Promise.all([
          showSalesPrices
            ? loadSupabaseQuotations(projects)
            : Promise.resolve([]),
          supabase
            .from("contracts")
            .select("id", { count: "exact", head: true }),
        ]);

        setSavedQuotations(quotations);
        setContractCount(count ?? 0);
      } catch {
        setSavedQuotations([]);
        setContractCount(0);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [projects, showSalesPrices, showSalesRoleDashboard]);

  if (showSalesRoleDashboard) {
    return (
      <AppShell previewRole={previewRole}>
        <div className="space-y-6">
          {role === "Admin" ? (
            <section className="material-card border-material-primary p-4 sm:p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-material-primary">
                    {t("dashboard.preview.eyebrow")}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-foreground">
                    {t("dashboard.preview.title")}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {t("dashboard.preview.description")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/dashboard"
                    className={`material-button-outlined min-h-11 ${
                      !previewRole
                        ? "border-material-primary bg-material-primary-container"
                        : ""
                    }`}
                  >
                    {t("dashboard.preview.admin")}
                  </Link>
                  {dashboardPreviewRoles.map((preview) => (
                    <Link
                      key={preview}
                      href={`/dashboard?viewAs=${encodeURIComponent(preview)}`}
                      className={`material-button-outlined min-h-11 ${
                        previewRole === preview
                          ? "border-material-primary bg-material-primary-container"
                          : ""
                      }`}
                    >
                      {t(
                        preview === "Sales Manager"
                          ? "dashboard.preview.manager"
                          : preview === "Indoor Sales"
                            ? "dashboard.preview.indoor"
                            : "dashboard.preview.outdoor",
                      )}
                    </Link>
                  ))}
                </div>
              </div>
              {previewRole ? (
                <p className="mt-3 rounded-md bg-material-primary-container px-3 py-2 text-sm font-bold text-material-on-primary-container">
                  {t("dashboard.preview.active", { role: term(previewRole) })}
                </p>
              ) : null}
            </section>
          ) : null}
          <PageHeader
            eyebrow={t("dashboard.eyebrow")}
            title={t("dashboard.title")}
            description={t("dashboard.description")}
          />
          <SalesRoleDashboard previewRole={previewRole} />
        </div>
      </AppShell>
    );
  }

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
          {showSalesPrices ? (
            <SectionCard title={t("dashboard.quotationActivity")}>
              {savedQuotations.length > 0 ? (
              <WorkflowList
                items={savedQuotations.slice(0, 3).map((quotation) => ({
                  key: quotation.id ?? quotation.quotationNumber,
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
          ) : null}
          <SectionCard title={t("dashboard.upcomingDeadlines")}>
            {activeProjects.length > 0 ? (
              <WorkflowList
                items={activeProjects.slice(0, 3).map((project) => ({
                  key: project.id,
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
