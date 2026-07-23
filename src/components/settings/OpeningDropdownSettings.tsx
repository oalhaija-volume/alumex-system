"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  defaultOpeningDropdownOptions,
  invalidateOpeningDropdownOptionsCache,
  loadOpeningDropdownOptions,
  openingOptionCategories,
  type OpeningDropdownOption,
  type OpeningOptionCategory,
} from "@/lib/openings/dropdownOptions";

type OptionDraft = OpeningDropdownOption;

const emptyOption = (
  category: OpeningOptionCategory = "room",
  sortOrder = 1,
): OptionDraft => ({
  category,
  label: "",
  sort_order: sortOrder,
  is_active: true,
});

async function saveOpeningDropdownOptions(options: OptionDraft[]) {
  const response = await fetch("/api/settings/opening-dropdown-options", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options }),
  });
  const body = (await response.json().catch(() => null)) as {
    options?: OpeningDropdownOption[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to save opening dropdown options.");
  }

  invalidateOpeningDropdownOptionsCache();
  return body?.options ?? [];
}

export function OpeningDropdownSettings() {
  const { t } = useI18n();
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [newOption, setNewOption] = useState<OptionDraft>(emptyOption());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const nextSortOrderByCategory = useMemo(() => {
    return openingOptionCategories.reduce<Record<OpeningOptionCategory, number>>(
      (map, category) => {
        const maxSortOrder = options
          .filter((option) => option.category === category.category)
          .reduce(
            (max, option) => Math.max(max, Number(option.sort_order) || 0),
            0,
          );
        map[category.category] = maxSortOrder + 1;
        return map;
      },
      {
        room: 1,
        aluminum_section: 1,
        glass_type: 1,
        glass_color: 1,
      },
    );
  }, [options]);

  const loadOptions = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const loadedOptions = await loadOpeningDropdownOptions();
      setOptions(loadedOptions);
    } catch (loadError) {
      setOptions(defaultOpeningDropdownOptions);
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("settings.openingDropdownLoadError"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOptions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOptions]);

  function updateOption(
    index: number,
    key: keyof OptionDraft,
    value: string | number | boolean,
  ) {
    setOptions((currentOptions) =>
      currentOptions.map((option, optionIndex) =>
        optionIndex === index
          ? {
              ...option,
              [key]: key === "sort_order" ? Number(value) || 1 : value,
            }
          : option,
      ),
    );
  }

  function updateNewOption(
    key: keyof OptionDraft,
    value: string | number | boolean,
  ) {
    setNewOption((currentOption) => ({
      ...currentOption,
      [key]: key === "sort_order" ? Number(value) || 1 : value,
    }));
  }

  function addOption() {
    setError("");
    setNotice("");

    if (!newOption.label.trim()) {
      setError(t("settings.openingDropdownLabelRequired"));
      return;
    }

    const option = {
      ...newOption,
      label: newOption.label.trim(),
      sort_order:
        Number(newOption.sort_order) ||
        nextSortOrderByCategory[newOption.category],
    };

    setOptions((currentOptions) => [...currentOptions, option]);
    setNewOption(
      emptyOption(
        newOption.category,
        nextSortOrderByCategory[newOption.category] + 1,
      ),
    );
  }

  async function handleSave() {
    setError("");
    setNotice("");

    const validOptions = options
      .map((option) => ({
        ...option,
        label: option.label.trim(),
        sort_order: Number(option.sort_order) || 1,
      }))
      .filter((option) => option.label);

    if (validOptions.length === 0) {
      setError(t("settings.openingDropdownLabelRequired"));
      return;
    }

    setIsSaving(true);

    try {
      const savedOptions = await saveOpeningDropdownOptions(validOptions);
      setOptions(savedOptions.length ? savedOptions : validOptions);
      setNotice(t("settings.openingDropdownSaved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("settings.openingDropdownSaveError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-strong">
        {t("settings.openingDropdownDescription")}
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

      <div className="grid gap-3 rounded-lg border border-border bg-surface-muted p-4 lg:grid-cols-[180px_1fr_120px_auto] lg:items-end">
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.openingDropdownCategory")}
          </span>
          <select
            value={newOption.category}
            onChange={(event) => {
              const category = event.target.value as OpeningOptionCategory;
              setNewOption(emptyOption(category, nextSortOrderByCategory[category]));
            }}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          >
            {openingOptionCategories.map((category) => (
              <option key={category.category} value={category.category}>
                {t(category.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.openingDropdownLabel")}
          </span>
          <input
            value={newOption.label}
            onChange={(event) => updateNewOption("label", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          />
        </label>
        <label>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("settings.openingDropdownSortOrder")}
          </span>
          <input
            type="number"
            min="1"
            value={newOption.sort_order}
            onChange={(event) =>
              updateNewOption("sort_order", Number(event.target.value))
            }
            className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          />
        </label>
        <button
          type="button"
          onClick={addOption}
          className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white"
        >
          {t("settings.openingDropdownAdd")}
        </button>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] divide-y divide-border text-left text-sm">
              <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">{t("settings.openingDropdownCategory")}</th>
                  <th className="px-3 py-3">{t("settings.openingDropdownLabel")}</th>
                  <th className="px-3 py-3">{t("settings.openingDropdownSortOrder")}</th>
                  <th className="px-3 py-3">{t("settings.openingDropdownActive")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {options.map((option, index) => (
                  <tr key={`${option.id ?? "new"}-${option.category}-${index}`}>
                    <td className="px-3 py-3">
                      <select
                        value={option.category}
                        onChange={(event) =>
                          updateOption(
                            index,
                            "category",
                            event.target.value as OpeningOptionCategory,
                          )
                        }
                        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                      >
                        {openingOptionCategories.map((category) => (
                          <option key={category.category} value={category.category}>
                            {t(category.labelKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={option.label}
                        onChange={(event) =>
                          updateOption(index, "label", event.target.value)
                        }
                        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="1"
                        value={option.sort_order}
                        onChange={(event) =>
                          updateOption(
                            index,
                            "sort_order",
                            Number(event.target.value),
                          )
                        }
                        className="h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-muted-strong">
                        <input
                          type="checkbox"
                          checked={option.is_active}
                          onChange={(event) =>
                            updateOption(index, "is_active", event.target.checked)
                          }
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        {t("settings.openingDropdownActive")}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? t("common.saving") : t("common.saveChanges")}
        </button>
      </div>
    </div>
  );
}
