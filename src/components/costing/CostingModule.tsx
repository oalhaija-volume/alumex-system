"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  loadProductPrices,
  productsForCatalog,
  type ProductPrice,
} from "@/lib/pricing/productPricing";

type CostingProject = {
  id: string;
  project_number: string;
  project_name: string;
  project_type: string | null;
  workflow_status: string | null;
};

type CostingRow = {
  id?: string;
  project_id: string;
  aluminum_system_name: string | null;
  aluminum_system_cost: number | string;
  installation_cost: number | string;
  fabrication_cost: number | string;
  glass_cost: number | string;
  shipping_cost: number | string;
  total_profit: number | string;
  total_project_cost: number | string;
  supplier_quotation_name: string | null;
  supplier_quotation_url?: string | null;
  notes: string | null;
  updated_at?: string;
};

type CostingDraft = {
  aluminumSystemName: string;
  aluminumSystemCost: number;
  installationCost: number;
  fabricationCost: number;
  glassCost: number;
  shippingCost: number;
  totalProfit: number;
  totalProjectCost: number;
  notes: string;
};

const emptyDraft: CostingDraft = {
  aluminumSystemName: "",
  aluminumSystemCost: 0,
  installationCost: 0,
  fabricationCost: 0,
  glassCost: 0,
  shippingCost: 0,
  totalProfit: 0,
  totalProjectCost: 0,
  notes: "",
};

const costFields: Array<{
  key: Exclude<keyof CostingDraft, "aluminumSystemName" | "notes">;
  label: string;
}> = [
  { key: "aluminumSystemCost", label: "Aluminum system cost" },
  { key: "installationCost", label: "Installation cost" },
  { key: "fabricationCost", label: "Fabrication cost" },
  { key: "glassCost", label: "Glass cost" },
  { key: "shippingCost", label: "Shipping cost" },
  { key: "totalProfit", label: "Total profit" },
  { key: "totalProjectCost", label: "Total project cost" },
];

function numberValue(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function draftFromRow(row?: CostingRow): CostingDraft {
  if (!row) return emptyDraft;

  return {
    aluminumSystemName: row.aluminum_system_name ?? "",
    aluminumSystemCost: numberValue(row.aluminum_system_cost),
    installationCost: numberValue(row.installation_cost),
    fabricationCost: numberValue(row.fabrication_cost),
    glassCost: numberValue(row.glass_cost),
    shippingCost: numberValue(row.shipping_cost),
    totalProfit: numberValue(row.total_profit),
    totalProjectCost: numberValue(row.total_project_cost),
    notes: row.notes ?? "",
  };
}

export function CostingModule() {
  const { formatCurrency, term } = useI18n();
  const [projects, setProjects] = useState<CostingProject[]>([]);
  const [costings, setCostings] = useState<CostingRow[]>([]);
  const [catalog, setCatalog] = useState<ProductPrice[]>([]);
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<CostingDraft>(emptyDraft);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedCosting = costings.find((costing) => costing.project_id === projectId);
  const systemOptions = useMemo(
    () => productsForCatalog(catalog, "aluminum_system", true),
    [catalog],
  );
  const calculatedTotal =
    draft.aluminumSystemCost +
    draft.installationCost +
    draft.fabricationCost +
    draft.glassCost +
    draft.shippingCost +
    draft.totalProfit;

  const loadCostings = useCallback(async (preferredProjectId?: string) => {
    setIsLoading(true);
    setError("");

    try {
      const [response, products] = await Promise.all([
        fetch("/api/costing", { cache: "no-store" }),
        loadProductPrices().catch(() => []),
      ]);
      const body = (await response.json().catch(() => null)) as
        | { projects?: CostingProject[]; costings?: CostingRow[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load project costings.");
      }

      const nextProjects = body?.projects ?? [];
      const nextCostings = body?.costings ?? [];
      setProjects(nextProjects);
      setCostings(nextCostings);
      setCatalog(products);
      const nextProjectId =
        preferredProjectId &&
        nextProjects.some((project) => project.id === preferredProjectId)
          ? preferredProjectId
          : nextProjects[0]?.id ?? "";
      setProjectId(nextProjectId);
      setDraft(
        draftFromRow(
          nextCostings.find((costing) => costing.project_id === nextProjectId),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load project costings.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCostings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCostings]);

  function selectProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setDraft(
      draftFromRow(
        costings.find((costing) => costing.project_id === nextProjectId),
      ),
    );
    setQuotationFile(null);
    setError("");
    setNotice("");
  }

  function updateMoney(key: keyof CostingDraft, value: number) {
    setDraft((current) => ({
      ...current,
      [key]: Math.max(Number(value) || 0, 0),
    }));
  }

  async function saveCosting() {
    if (!projectId || isSaving) return;

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/costing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...draft }),
      });
      const body = (await response.json().catch(() => null)) as
        | { costing?: CostingRow; error?: string }
        | null;

      if (!response.ok || !body?.costing) {
        throw new Error(body?.error ?? "Unable to save project costing.");
      }

      setCostings((current) => [
        ...current.filter((row) => row.project_id !== projectId),
        body.costing as CostingRow,
      ]);
      setNotice("Project costing saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save project costing.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadQuotation() {
    if (!projectId || !quotationFile || isUploading) return;

    setIsUploading(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("file", quotationFile);
      const response = await fetch("/api/costing", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as
        | { costing?: CostingRow; error?: string }
        | null;

      if (!response.ok || !body?.costing) {
        throw new Error(body?.error ?? "Unable to upload quotation.");
      }

      await loadCostings(projectId);
      setNotice("Supplier quotation uploaded.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload quotation.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Procurement"
        title="Project Costing"
        description="Record project-specific system, fabrication, installation, glass, shipping, profit, and supplier quotation costs."
      />

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      <SectionCard title="Select project">
        <select
          value={projectId}
          onChange={(event) => selectProject(event.target.value)}
          disabled={isLoading}
          className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground md:max-w-xl"
        >
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.project_number} — {term(project.project_name)}
            </option>
          ))}
        </select>
      </SectionCard>

      {selectedProject ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-bold uppercase text-muted">Project</p>
              <p className="mt-2 font-bold text-foreground">
                {selectedProject.project_number} — {term(selectedProject.project_name)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-bold uppercase text-muted">Calculated cost + profit</p>
              <p className="mt-2 text-xl font-bold text-primary">
                {formatCurrency(calculatedTotal)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-bold uppercase text-muted">Recorded project total</p>
              <p className="mt-2 text-xl font-bold text-foreground">
                {formatCurrency(draft.totalProjectCost)}
              </p>
            </div>
          </section>

          <SectionCard title="Cost breakdown">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-sm font-bold text-muted-strong">Aluminum system</span>
                <input
                  list="costing-system-options"
                  value={draft.aluminumSystemName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      aluminumSystemName: event.target.value,
                    }))
                  }
                  placeholder="Select or enter another system"
                  className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                />
                <datalist id="costing-system-options">
                  {systemOptions.map((system) => (
                    <option key={system.id ?? system.product_name} value={system.product_name} />
                  ))}
                </datalist>
              </label>
              {costFields.map((field) => (
                <label key={field.key}>
                  <span className="text-sm font-bold text-muted-strong">{field.label}</span>
                  <input
                    type="number"
                    min="0"
                    value={draft[field.key]}
                    onChange={(event) => updateMoney(field.key, Number(event.target.value))}
                    className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                  />
                </label>
              ))}
              <label className="md:col-span-2">
                <span className="text-sm font-bold text-muted-strong">Costing notes</span>
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-3 text-sm font-semibold text-foreground"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void saveCosting()}
              disabled={isSaving}
              className="mt-5 h-11 rounded-md bg-primary px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save costing"}
            </button>
          </SectionCard>

          <SectionCard title="Supplier quotation">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="min-w-0 flex-1">
                <span className="text-sm font-bold text-muted-strong">Quotation file</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                  onChange={(event) => setQuotationFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                onClick={() => void uploadQuotation()}
                disabled={!quotationFile || isUploading}
                className="h-11 rounded-md bg-primary px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Upload quotation"}
              </button>
            </div>
            {selectedCosting?.supplier_quotation_name ? (
              <p className="mt-4 text-sm font-semibold text-muted-strong">
                Current file:{" "}
                {selectedCosting.supplier_quotation_url ? (
                  <a
                    href={selectedCosting.supplier_quotation_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-primary hover:underline"
                  >
                    {selectedCosting.supplier_quotation_name}
                  </a>
                ) : (
                  selectedCosting.supplier_quotation_name
                )}
              </p>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
