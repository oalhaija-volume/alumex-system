"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { SectionCard } from "@/components/SectionCard";
import {
  calculateLineTotal,
  calculateQuotationTotals,
  quotationStorageKey,
  type QuotationDraft,
  type QuotationLine,
} from "@/components/quotations/quotationTypes";
import {
  deleteSupabaseQuotation,
  loadSupabaseQuotations,
} from "@/components/quotations/supabaseQuotations";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Project } from "@/data/ui";

function defaultUnitPrice(system: string) {
  const lowerSystem = system.toLowerCase();

  if (lowerSystem.includes("curtain")) {
    return 165;
  }

  if (lowerSystem.includes("sliding")) {
    return 95;
  }

  return 120;
}

function createQuotationLines(projectId: string, projects: Project[]): QuotationLine[] {
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return [];
  }

  return project.structuralOpenings.map((opening) => ({
    ...opening,
    unitPrice: defaultUnitPrice(opening.productSystem),
    discountPercent: 0,
  }));
}

export function QuotationBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatCurrency, t, term } = useI18n();
  const { isAdmin } = useCurrentRole();
  const { clients } = useClients();
  const { projects } = useProjects();
  const requestedProjectId = searchParams.get("projectId") ?? "";
  const initialProjectId =
    projects.find((project) => project.id === requestedProjectId)?.id ??
    projects[0]?.id ??
    "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const [quotationNumber, setQuotationNumber] = useState("Q-2026-0150");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(() => t("quotations.defaultNotes"));
  const [preparedBy, setPreparedBy] = useState(() =>
    t("quotations.defaultPreparedBy"),
  );
  const [clientRepresentative, setClientRepresentative] = useState("");
  const [savedQuotations, setSavedQuotations] = useState<QuotationDraft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<QuotationDraft | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lines, setLines] = useState<QuotationLine[]>(() =>
    createQuotationLines(initialProjectId, projects),
  );
  const selectedProject = projects.find((project) => project.id === projectId);
  const hasClients = clients.length > 0;
  const hasProjects = projects.length > 0;
  const hasProjectsWithOpenings = projects.some(
    (project) => project.structuralOpenings.length > 0,
  );
  const canCreateQuotation =
    hasClients && hasProjects && hasProjectsWithOpenings;
  const totals = useMemo(
    () => calculateQuotationTotals(lines, discountPercent),
    [lines, discountPercent],
  );

  const loadProject = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
    setLines(createQuotationLines(nextProjectId, projects));
    setError("");
  }, [projects]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextProjectId =
        projects.find((project) => project.id === requestedProjectId)?.id ??
        (projectId && projects.some((project) => project.id === projectId)
          ? projectId
          : projects[0]?.id ?? "");

      if (nextProjectId !== projectId) {
        loadProject(nextProjectId);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProject, projectId, projects, requestedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setSavedQuotations(await loadSupabaseQuotations(projects));
      } catch {
        setSavedQuotations([]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [projects]);

  function updateLine(
    lineId: string,
    key: "unitPrice" | "discountPercent",
    value: number,
  ) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [key]: Number.isFinite(value) ? value : 0,
            }
          : line,
      ),
    );
  }

  async function openPreview() {
    setError("");

    if (!selectedProject || lines.length === 0) {
      setError(t("quotations.validationRequired"));
      return;
    }

    if (!selectedProject.clientId) {
      setError(t("quotations.missingClient"));
      return;
    }

    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: quotationRow, error: quotationError } = await supabase
      .from("quotations")
      .insert({
        quotation_number: quotationNumber,
        project_id: selectedProject.id,
        client_id: selectedProject.clientId,
        status: "Draft",
        quotation_discount_percent: discountPercent,
        subtotal: totals.subtotal,
        line_discount_total: totals.lineDiscountTotal,
        quotation_discount_total: totals.quotationDiscount,
        grand_total: totals.grandTotal,
        notes,
        prepared_by_text: preparedBy || null,
        client_representative: clientRepresentative || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (quotationError || !quotationRow) {
      setError(quotationError?.message ?? t("quotations.saveError"));
      return;
    }

    const { error: itemsError } = await supabase.from("quotation_items").insert(
      lines.map((line) => ({
        quotation_id: quotationRow.id,
        opening_id: line.id,
        opening_code: line.openingCode,
        floor: line.floor || null,
        room: line.room || null,
        width: line.width,
        height: line.height,
        quantity: line.quantity,
        product_system: line.productSystem || null,
        glass_type: line.glassType || null,
        aluminum_color: line.aluminumColor || null,
        unit_price: line.unitPrice,
        discount_percent: line.discountPercent,
        notes: line.notes || null,
      })),
    );

    if (itemsError) {
      setError(itemsError.message);
      return;
    }

    const draft: QuotationDraft = {
      id: quotationRow.id,
      quotationNumber,
      project: selectedProject,
      lines,
      discountPercent,
      notes,
      preparedBy,
      clientRepresentative,
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(quotationStorageKey, JSON.stringify(draft));
    setSavedQuotations(await loadSupabaseQuotations(projects));
    router.push("/quotations/preview");
  }

  async function confirmDeleteQuotation() {
    if (!deleteTarget?.id) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await deleteSupabaseQuotation(deleteTarget.id);
      setSavedQuotations(await loadSupabaseQuotations(projects));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("quotations.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("quotations.eyebrow")}
        title={t("quotations.builder")}
        description={t("quotations.builderDescription")}
      />

      <SectionCard title={t("quotations.savedQuotations")}>
        {savedQuotations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            {t("quotations.noSavedQuotations")}
          </p>
        ) : (
          <div className="grid gap-3">
            {savedQuotations.map((quotation) => {
              const quotationTotals = calculateQuotationTotals(
                quotation.lines,
                quotation.discountPercent,
              );

              return (
                <div
                  key={quotation.id ?? quotation.quotationNumber}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {quotation.quotationNumber}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {term(quotation.project.projectName)} -{" "}
                      {formatCurrency(quotationTotals.grandTotal)}
                    </p>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(quotation)}
                      className="h-10 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                    >
                      {t("common.delete")}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {!canCreateQuotation ? (
        <SectionCard title={t("quotations.beforeCreateQuotation")}>
          <div className="space-y-4 rounded-lg border border-dashed border-border bg-surface-muted p-5">
            <p className="text-sm font-bold text-foreground">
              {t("quotations.prerequisitesTitle")}
            </p>
            <p className="text-sm leading-6 text-muted">
              {!hasClients
                ? t("quotations.noClientsPrerequisite")
                : !hasProjects
                  ? t("quotations.noProjectsPrerequisite")
                  : t("quotations.noOpeningsPrerequisite")}
            </p>
            <div className="flex flex-wrap gap-2">
              {!hasClients ? (
                <Link
                  href="/clients"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("clients.newClient")}
                </Link>
              ) : null}
              {!hasProjects ? (
                <Link
                  href="/projects"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("projects.newProject")}
                </Link>
              ) : null}
              {hasProjects && !hasProjectsWithOpenings ? (
                <Link
                  href="/projects"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
                >
                  {t("projects.openings.addOpening")}
                </Link>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {canCreateQuotation ? (
        <>
      <SectionCard title={t("quotations.projectSelection")}>
        {error ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("quotations.selectProject")}
            </span>
            <select
              value={projectId}
              onChange={(event) => loadProject(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectNumber} - {term(project.projectName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold text-slate-700">
              {t("quotations.quotationNumber")}
            </span>
            <input
              value={quotationNumber}
              onChange={(event) => setQuotationNumber(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={openPreview}
            disabled={!selectedProject || lines.length === 0}
            className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--alumex-blue-dark)] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t("quotations.createQuotation")}
          </button>
        </div>
      </SectionCard>

      {selectedProject ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.clientInformation")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.client)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {term(selectedProject.address)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("quotations.projectInformation")}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {term(selectedProject.projectName)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {term(selectedProject.projectType)} - {term(selectedProject.salesEngineer)}
            </p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              {t("quotations.totals")}
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--alumex-blue)]">
              {formatCurrency(totals.grandTotal)}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              {t("quotations.billableArea", {
                area: t("common.areaValue", {
                  value: totals.totalArea.toFixed(2),
                }),
              })}
            </p>
          </div>
        </section>
      ) : null}

      <SectionCard title={t("quotations.openingsAndPricing")}>
        <div className="hidden overflow-hidden rounded-lg border border-slate-200 xl:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1360px] divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">
                {t("quotations.openingsAndPricing")}
              </caption>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t("projects.openings.fields.openingCode")}</th>
                  <th className="px-3 py-3">{t("common.location")}</th>
                  <th className="px-3 py-3">{t("common.system")}</th>
                  <th className="px-3 py-3">{t("quotations.glass")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.width")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.height")}</th>
                  <th className="px-3 py-3">{t("projects.openings.fields.quantity")}</th>
                  <th className="px-3 py-3">{t("common.areaSqm")}</th>
                  <th className="px-3 py-3">{t("quotations.unitPricePerSqm")}</th>
                  <th className="px-3 py-3">{t("common.discount")}</th>
                  <th className="px-3 py-3">{t("quotations.lineTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const lineTotal = calculateLineTotal(line);

                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-4 font-bold text-slate-950">
                        {line.openingCode}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {term(line.floor)} - {term(line.room)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {term(line.productSystem)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {term(line.glassType)}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {t("common.cmValue", { value: line.width })}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {t("common.cmValue", { value: line.height })}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-4 font-semibold text-slate-950">
                        {t("common.areaValue", { value: lineTotal.area.toFixed(2) })}
                      </td>
                      <td className="px-3 py-4">
                        <input
                          type="number"
                          min="0"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              "unitPrice",
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-28 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-4">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.discountPercent}
                          onChange={(event) =>
                            updateLine(
                              line.id,
                              "discountPercent",
                              Number(event.target.value),
                            )
                          }
                          className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-4 font-bold text-[var(--alumex-blue)]">
                        {formatCurrency(lineTotal.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 xl:hidden">
          {lines.map((line) => {
            const lineTotal = calculateLineTotal(line);

            return (
              <article
                key={line.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {line.floor} - {line.room}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">
                      {line.openingCode}
                    </h3>
                  </div>
                  <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-bold text-[var(--alumex-blue)]">
                    {formatCurrency(lineTotal.net)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-xs font-bold uppercase text-slate-500">
                      {t("quotations.unitPricePerSqm")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          "unitPrice",
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                    />
                  </label>
                  <label>
                    <span className="text-xs font-bold uppercase text-slate-500">
                      {t("quotations.discountPercent")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={line.discountPercent}
                      onChange={(event) =>
                        updateLine(
                          line.id,
                          "discountPercent",
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {term(line.productSystem)} - {term(line.glassType)} -{" "}
                  {t("common.cmValue", { value: line.width })} ×{" "}
                  {t("common.cmValue", { value: line.height })} ×{" "}
                  {line.quantity} -{" "}
                  {t("common.areaValue", { value: lineTotal.area.toFixed(2) })}
                </p>
              </article>
            );
          })}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-bold text-slate-950">
              {t("quotations.noOpeningsLoaded")}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {t("quotations.noOpeningsLoadedDescription")}
            </p>
          </div>
        ) : null}
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <SectionCard title={t("quotations.notesAndSignatures")}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t("common.notes")}
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="text-sm font-bold text-slate-700">
                {t("contracts.preparedBy")}
              </span>
              <input
                value={preparedBy}
                onChange={(event) => setPreparedBy(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="text-sm font-bold text-slate-700">
                {t("quotations.clientRepresentative")}
              </span>
              <input
                value={clientRepresentative}
                onChange={(event) => setClientRepresentative(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("quotations.totals")}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.subtotal")}</span>
              <span className="font-bold text-slate-950">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.lineDiscounts")}</span>
              <span className="font-bold text-red-700">
                -{formatCurrency(totals.lineDiscountTotal)}
              </span>
            </div>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("quotations.quotationDiscountPercent")}
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(event) =>
                  setDiscountPercent(Number(event.target.value))
                }
                className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              />
            </label>
            <div className="flex justify-between">
              <span className="text-slate-500">{t("common.quotationDiscount")}</span>
              <span className="font-bold text-red-700">
                -{formatCurrency(totals.quotationDiscount)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex justify-between text-lg">
                <span className="font-bold text-slate-950">
                  {t("common.grandTotal")}
                </span>
                <span className="font-bold text-[var(--alumex-blue)]">
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </section>
        </>
      ) : null}

      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-quotation-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 id="delete-quotation-title" className="text-lg font-bold text-foreground">
              {t("quotations.deleteQuotation")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("quotations.deleteConfirm")}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteQuotation}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("quotations.deleteQuotation")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
