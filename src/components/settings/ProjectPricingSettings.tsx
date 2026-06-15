"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useProjects } from "@/components/projects/ProjectsProvider";
import {
  defaultUnitPrice,
  loadProjectPrices,
  type ProjectPrice,
} from "@/lib/pricing/projectPricing";

function priceKey(projectId: string, openingId: string) {
  return `${projectId}:${openingId}`;
}

async function saveProjectPrices(prices: ProjectPrice[]) {
  const response = await fetch("/api/settings/project-prices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices }),
  });
  const body = (await response.json().catch(() => null)) as {
    prices?: ProjectPrice[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to save project prices.");
  }

  return body?.prices ?? [];
}

export function ProjectPricingSettings() {
  const { formatCurrency, t, term } = useI18n();
  const { projects } = useProjects();
  const [pricesByOpening, setPricesByOpening] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const openings = useMemo(
    () =>
      projects.flatMap((project) =>
        project.structuralOpenings.map((opening) => ({
          project,
          opening,
          key: priceKey(project.id, opening.id),
        })),
      ),
    [projects],
  );

  const applyPrices = useCallback(
    (prices: ProjectPrice[]) => {
      const savedPrices = new Map(
        prices.map((price) => [price.opening_id, Number(price.unit_price)]),
      );
      const nextPrices: Record<string, number> = {};

      openings.forEach(({ opening, key }) => {
        nextPrices[key] =
          savedPrices.get(opening.id) ?? defaultUnitPrice(opening.productSystem);
      });

      setPricesByOpening(nextPrices);
    },
    [openings],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPrices() {
      setError("");
      setIsLoading(true);

      try {
        const prices = await loadProjectPrices();

        if (isMounted) {
          applyPrices(prices);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("settings.loadProjectPricesError"),
          );
          applyPrices([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPrices();

    return () => {
      isMounted = false;
    };
  }, [applyPrices, t]);

  function updatePrice(key: string, value: number) {
    setPricesByOpening((current) => ({
      ...current,
      [key]: Number.isFinite(value) ? Math.max(value, 0) : 0,
    }));
  }

  async function handleSave() {
    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const payload = openings.map(({ project, opening, key }) => ({
        project_id: project.id,
        opening_id: opening.id,
        unit_price:
          pricesByOpening[key] ?? defaultUnitPrice(opening.productSystem),
      }));
      const savedPrices = await saveProjectPrices(payload);
      applyPrices(savedPrices);
      setNotice(t("settings.projectPricesSaved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("settings.saveProjectPricesError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-strong">
        {t("settings.projectPricingDescription")}
      </p>

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

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("common.loading")}
        </p>
      ) : openings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("settings.noProjectOpeningsForPricing")}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] divide-y divide-border text-left text-sm">
                <caption className="sr-only">
                  {t("settings.projectPricing")}
                </caption>
                <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">{t("projects.fields.projectNumber")}</th>
                    <th className="px-3 py-3">{t("projects.fields.projectName")}</th>
                    <th className="px-3 py-3">{t("projects.openings.fields.openingCode")}</th>
                    <th className="px-3 py-3">{t("common.system")}</th>
                    <th className="px-3 py-3">{t("quotations.unitPricePerSqm")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {openings.map(({ project, opening, key }) => (
                    <tr key={key}>
                      <td className="px-3 py-3 font-bold text-primary">
                        {project.projectNumber}
                      </td>
                      <td className="px-3 py-3 font-semibold text-foreground">
                        {term(project.projectName)}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.openingCode}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {term(opening.productSystem)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          value={
                            pricesByOpening[key] ??
                            defaultUnitPrice(opening.productSystem)
                          }
                          onChange={(event) =>
                            updatePrice(key, Number(event.target.value))
                          }
                          className="h-10 w-36 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {openings.map(({ project, opening, key }) => (
              <article
                key={key}
                className="rounded-lg border border-border bg-surface-muted p-4"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {project.projectNumber}
                </p>
                <h3 className="mt-1 text-base font-bold text-foreground">
                  {term(project.projectName)}
                </h3>
                <p className="mt-2 text-sm font-semibold text-muted-strong">
                  {opening.openingCode} - {term(opening.productSystem)}
                </p>
                <label className="mt-3 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t("quotations.unitPricePerSqm")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={
                      pricesByOpening[key] ??
                      defaultUnitPrice(opening.productSystem)
                    }
                    onChange={(event) =>
                      updatePrice(key, Number(event.target.value))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                  />
                </label>
                <p className="mt-2 text-xs font-semibold text-muted">
                  {formatCurrency(
                    pricesByOpening[key] ?? defaultUnitPrice(opening.productSystem),
                  )}
                </p>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? t("common.loading") : t("settings.saveProjectPrices")}
          </button>
        </>
      )}
    </div>
  );
}
