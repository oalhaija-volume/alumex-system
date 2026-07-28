"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SectionCard } from "@/components/SectionCard";
import type { StructuralOpening } from "@/data/ui";
import {
  defaultOpeningDropdownOptions,
  loadOpeningDropdownOptions,
  optionsForCategory,
  type OpeningDropdownOption,
  type OpeningOptionCategory,
} from "@/lib/openings/dropdownOptions";
import { centimetersToSquareMeters } from "@/lib/measurements/area";
import {
  isStructuralOpeningType,
  nextStructuralOpeningCode,
  structuralOpeningTypes,
  type StructuralOpeningType,
} from "@/lib/measurements/structuralOpenings";

export type StructuralOpeningValues = Omit<StructuralOpening, "id">;

type OpeningFamilyKey =
  | "window"
  | "door"
  | "curtainWall"
  | "skylight"
  | "other";

type OpeningFamily = {
  key: OpeningFamilyKey;
  openingType: StructuralOpeningType | "";
  labelKey: string;
};

const openingFamilies: OpeningFamily[] = [
  {
    key: "window",
    openingType: "Window",
    labelKey: "projects.openings.families.window",
  },
  {
    key: "door",
    openingType: "Door",
    labelKey: "projects.openings.families.door",
  },
  {
    key: "curtainWall",
    openingType: "Curtain Wall",
    labelKey: "projects.openings.families.curtainWall",
  },
  {
    key: "skylight",
    openingType: "Skylight",
    labelKey: "projects.openings.families.skylight",
  },
];

const otherOpeningFamily: OpeningFamily = {
  key: "other",
  openingType: "",
  labelKey: "projects.openings.families.other",
};

const emptyOpening: StructuralOpeningValues = {
  floor: "",
  room: "",
  openingCode: "",
  openingType: "",
  width: 100,
  height: 100,
  solidPanelHeight: 0,
  quantity: 1,
  productSystem: "",
  glassType: "",
  aluminumColor: "",
  notes: "",
};

const spreadsheetColumns: Array<{
  key:
    | keyof StructuralOpeningValues
    | "area"
    | "actions";
  labelKey: string;
  widthClass: string;
}> = [
  {
    key: "floor",
    labelKey: "projects.openings.fields.floor",
    widthClass: "w-28",
  },
  {
    key: "room",
    labelKey: "projects.openings.fields.room",
    widthClass: "w-44",
  },
  {
    key: "openingCode",
    labelKey: "projects.openings.fields.openingCode",
    widthClass: "w-36",
  },
  {
    key: "openingType",
    labelKey: "projects.openings.fields.openingType",
    widthClass: "w-36",
  },
  {
    key: "width",
    labelKey: "projects.openings.fields.width",
    widthClass: "w-28",
  },
  {
    key: "height",
    labelKey: "projects.openings.fields.height",
    widthClass: "w-28",
  },
  {
    key: "notes",
    labelKey: "projects.openings.fields.notes",
    widthClass: "w-56",
  },
  {
    key: "area",
    labelKey: "common.areaSqm",
    widthClass: "w-28",
  },
  {
    key: "actions",
    labelKey: "common.actions",
    widthClass: "w-52",
  },
];

const dropdownFieldCategories: Partial<
  Record<keyof StructuralOpeningValues, OpeningOptionCategory>
> = {
  room: "room",
};

const numberFields = new Set<keyof StructuralOpeningValues>([
  "width",
  "height",
  "solidPanelHeight",
  "quantity",
]);

function calculateArea(opening: Pick<StructuralOpening, "width" | "height" | "quantity">) {
  return centimetersToSquareMeters(opening);
}

function formatArea(
  opening: Pick<StructuralOpening, "width" | "height" | "quantity">,
  t: (key: string, replacements?: Record<string, string | number>) => string,
) {
  return t("common.areaValue", { value: calculateArea(opening).toFixed(2) });
}

function normalizeOpening(opening: StructuralOpeningValues) {
  return {
    ...opening,
    floor: opening.floor.trim(),
    room: opening.room.trim(),
    openingCode: opening.openingCode.trim(),
    openingType: opening.openingType?.trim() ?? "",
    width: Number(opening.width) || 0,
    height: Number(opening.height) || 0,
    solidPanelHeight: Math.min(
      Math.max(Number(opening.solidPanelHeight) || 0, 0),
      Number(opening.height) || 0,
    ),
    quantity: Number(opening.quantity) || 1,
    productSystem: opening.productSystem.trim(),
    glassType: opening.glassType.trim(),
    aluminumColor: opening.aluminumColor.trim(),
    notes: opening.notes.trim(),
  };
}

function hasOpeningContent(
  opening: StructuralOpeningValues,
) {
  return Boolean(
      opening.floor.trim() ||
      opening.room.trim() ||
      opening.openingCode.trim() ||
      opening.notes.trim() ||
      Number(opening.width) !== emptyOpening.width ||
      Number(opening.height) !== emptyOpening.height ||
      Number(opening.solidPanelHeight) !== emptyOpening.solidPanelHeight ||
      Number(opening.quantity) !== emptyOpening.quantity,
  );
}

function isOpeningValid(opening: StructuralOpeningValues) {
  return Boolean(
    opening.floor &&
      opening.room &&
    opening.openingCode &&
      isStructuralOpeningType(opening.openingType ?? "") &&
      opening.width > 0 &&
      opening.height > 0 &&
      opening.quantity > 0,
  );
}

function rows(count: number, openingType: StructuralOpeningType | "" = "") {
  return Array.from({ length: count }, () => ({
    ...emptyOpening,
    openingType,
  }));
}

function createOpeningRowsByFamily() {
  return {
    window: rows(5, "Window"),
    door: rows(5, "Door"),
    curtainWall: rows(5, "Curtain Wall"),
    skylight: rows(5, "Skylight"),
    other: rows(5),
  } satisfies Record<OpeningFamilyKey, StructuralOpeningValues[]>;
}

function openingFamilyKeyForOpening(
  opening: Pick<StructuralOpening, "openingType" | "productSystem" | "openingCode">,
): OpeningFamilyKey {
  if (opening.openingType === "Window") return "window";
  if (opening.openingType === "Door") return "door";
  if (opening.openingType === "Curtain Wall") return "curtainWall";
  if (opening.openingType === "Skylight") return "skylight";

  const code = opening.openingCode.trim().toUpperCase();
  if (code.startsWith("CW-")) return "curtainWall";
  if (code.startsWith("SK-")) return "skylight";
  if (code.startsWith("D-")) return "door";
  if (code.startsWith("W-")) return "window";

  const productSystem = opening.productSystem;
  const normalizedSystem = productSystem.trim().toLowerCase();

  if (normalizedSystem.includes("sliding")) {
    return "window";
  }

  if (normalizedSystem.includes("hinge")) {
    return "door";
  }

  if (normalizedSystem.includes("curtain")) {
    return "curtainWall";
  }

  if (normalizedSystem.includes("skylight")) {
    return "skylight";
  }

  return "other";
}

function optionLabels(
  optionsByCategory: Record<OpeningOptionCategory, OpeningDropdownOption[]>,
  category: OpeningOptionCategory,
  currentValue: string,
) {
  const labels = optionsByCategory[category].map((option) => option.label);

  return currentValue && !labels.includes(currentValue)
    ? [currentValue, ...labels]
    : labels;
}

function OpeningCell({
  field,
  value,
  optionsByCategory,
  onChange,
  disabled = false,
}: {
  field: keyof StructuralOpeningValues;
  value: StructuralOpeningValues;
  optionsByCategory: Record<OpeningOptionCategory, OpeningDropdownOption[]>;
  onChange: (value: string | number) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const commonClass =
    "h-10 w-full rounded-none border-0 bg-transparent px-2 text-sm font-semibold text-slate-900 outline-none transition focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-[var(--alumex-blue)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";
  const dropdownCategory = dropdownFieldCategories[field];

  if (field === "openingType") {
    return (
      <select
        value={value.openingType}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={commonClass}
      >
        <option value="">{t("projects.openings.selectOption")}</option>
        {structuralOpeningTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    );
  }

  if (dropdownCategory) {
    return (
      <select
        value={String(value[field])}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={commonClass}
      >
        <option value="">{t("projects.openings.selectOption")}</option>
        {optionLabels(
          optionsByCategory,
          dropdownCategory,
          String(value[field]),
        ).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (numberFields.has(field)) {
    return (
      <input
        type="number"
        min="0"
        step={field === "quantity" ? "1" : "0.01"}
        value={Number(value[field])}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className={commonClass}
      />
    );
  }

  return (
    <input
      value={String(value[field])}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={commonClass}
    />
  );
}

export function StructuralOpenings({
  openings,
  onAdd,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  openings: StructuralOpening[];
  onAdd: (opening: StructuralOpeningValues) => Promise<void> | void;
  onUpdate: (
    openingId: string,
    opening: StructuralOpeningValues,
  ) => Promise<void> | void;
  onDelete: (openingId: string) => void;
  onDuplicate: (openingId: string) => void;
}) {
  const { t, term } = useI18n();
  const [error, setError] = useState("");
  const [activeFamilyKey, setActiveFamilyKey] =
    useState<OpeningFamilyKey>("window");
  const [newOpeningsByFamily, setNewOpeningsByFamily] = useState(
    createOpeningRowsByFamily,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOpening, setEditingOpening] =
    useState<StructuralOpeningValues>(emptyOpening);
  const [dropdownOptions, setDropdownOptions] = useState<OpeningDropdownOption[]>(
    defaultOpeningDropdownOptions,
  );
  const [isSavingRows, setIsSavingRows] = useState(false);
  const totalArea = openings.reduce(
    (sum, opening) => sum + calculateArea(opening),
    0,
  );
  const openingsByFamily = useMemo(() => {
    const groupedOpenings: Record<OpeningFamilyKey, StructuralOpening[]> = {
      window: [],
      door: [],
      curtainWall: [],
      skylight: [],
      other: [],
    };

    openings.forEach((opening) => {
      groupedOpenings[openingFamilyKeyForOpening(opening)].push(opening);
    });

    return groupedOpenings;
  }, [openings]);
  const activeFamily =
    activeFamilyKey === "other"
      ? otherOpeningFamily
      : openingFamilies.find((family) => family.key === activeFamilyKey) ??
        openingFamilies[0];
  const newOpenings = newOpeningsByFamily[activeFamilyKey];
  const activeOpenings = openingsByFamily[activeFamilyKey];
  const displayedFamilies =
    openingsByFamily.other.length > 0 || activeFamilyKey === "other"
      ? [...openingFamilies, otherOpeningFamily]
      : openingFamilies;

  const optionsByCategory = useMemo(
    () => ({
      room: optionsForCategory(dropdownOptions, "room"),
      aluminum_section: optionsForCategory(dropdownOptions, "aluminum_section"),
      glass_type: optionsForCategory(dropdownOptions, "glass_type"),
      glass_color: optionsForCategory(dropdownOptions, "glass_color"),
    }),
    [dropdownOptions],
  );

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setDropdownOptions(await loadOpeningDropdownOptions());
      } catch {
        setDropdownOptions(defaultOpeningDropdownOptions);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function beginEdit(opening: StructuralOpening) {
    setError("");
    setEditingId(opening.id);
    setEditingOpening({
      floor: opening.floor,
      room: opening.room,
      openingCode: opening.openingCode,
      openingType: opening.openingType ?? "",
      width: opening.width,
      height: opening.height,
      solidPanelHeight: opening.solidPanelHeight,
      quantity: opening.quantity,
      productSystem: opening.productSystem,
      glassType: opening.glassType,
      aluminumColor: opening.aluminumColor,
      notes: opening.notes,
    });
  }

  function updateNewOpening(
    index: number,
    field: keyof StructuralOpeningValues,
    value: string | number,
  ) {
    setNewOpeningsByFamily((currentRows) => ({
      ...currentRows,
      [activeFamilyKey]: currentRows[activeFamilyKey].map(
        (opening, openingIndex) =>
          openingIndex === index ? { ...opening, [field]: value } : opening,
      ),
    }));
  }

  async function addOpeningRows() {
    setError("");
    const usedOpeningCodes = openings.map((opening) => opening.openingCode);
    const normalizedOpenings = newOpenings
      .filter(hasOpeningContent)
      .map(normalizeOpening)
      .map((opening) => {
        const openingCode =
          opening.openingCode ||
          (isStructuralOpeningType(opening.openingType)
            ? nextStructuralOpeningCode(
                opening.openingType,
                usedOpeningCodes,
              )
            : "");
        usedOpeningCodes.push(openingCode);
        return { ...opening, openingCode };
      });

    if (normalizedOpenings.length === 0) {
      setError(t("projects.openings.addRowsRequired"));
      return;
    }

    if (normalizedOpenings.some((opening) => !isOpeningValid(opening))) {
      setError(t("projects.openings.validationRequired"));
      return;
    }

    setIsSavingRows(true);

    try {
      for (const opening of normalizedOpenings) {
        await onAdd(opening);
      }
      setNewOpeningsByFamily((currentRows) => ({
        ...currentRows,
        [activeFamilyKey]: rows(5, activeFamily.openingType),
      }));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("projects.openings.saveError"),
      );
    } finally {
      setIsSavingRows(false);
    }
  }

  async function saveOpening() {
    if (!editingId) {
      return;
    }

    const originalOpening = openings.find((opening) => opening.id === editingId);
    const normalizedOpening = normalizeOpening(editingOpening);
    const openingToSave =
      isStructuralOpeningType(normalizedOpening.openingType) &&
      originalOpening?.openingType !== normalizedOpening.openingType
        ? {
            ...normalizedOpening,
            openingCode: nextStructuralOpeningCode(
              normalizedOpening.openingType,
              openings
                .filter((opening) => opening.id !== editingId)
                .map((opening) => opening.openingCode),
            ),
          }
        : normalizedOpening;

    if (!isOpeningValid(openingToSave)) {
      setError(t("projects.openings.validationRequired"));
      return;
    }

    try {
      await onUpdate(editingId, openingToSave);
      setEditingId(null);
      setEditingOpening(emptyOpening);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("projects.openings.saveError"),
      );
    }
  }

  function deleteOpening(opening: StructuralOpening) {
    const confirmed = window.confirm(
      t("projects.openings.deleteOpeningConfirm", {
        code: opening.openingCode,
      }),
    );

    if (confirmed) {
      onDelete(opening.id);
    }
  }

  function renderEditableRow({
    rowId,
    values,
    onCellChange,
    actions,
    lockOpeningType,
  }: {
    rowId: string;
    values: StructuralOpeningValues;
    onCellChange: (field: keyof StructuralOpeningValues, value: string | number) => void;
    actions: ReactNode;
    lockOpeningType: boolean;
  }) {
    return (
      <tr key={rowId} className="divide-x divide-slate-200">
        {spreadsheetColumns.map((column) => {
          if (column.key === "area") {
            return (
              <td
                key={column.key}
                className="bg-blue-50 px-2 py-2 text-sm font-bold text-[var(--alumex-blue)]"
              >
                {formatArea(values, t)}
              </td>
            );
          }

          if (column.key === "actions") {
            return (
              <td key={column.key} className="px-2 py-2">
                {actions}
              </td>
            );
          }

          const field = column.key as keyof StructuralOpeningValues;

          return (
            <td key={column.key} className="p-0">
              <OpeningCell
                field={field}
                value={values}
                optionsByCategory={optionsByCategory}
                onChange={(value) => onCellChange(field, value)}
                disabled={field === "openingType" && lockOpeningType}
              />
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <SectionCard title={t("projects.openings.title")}>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950">
              {t("projects.openings.openingsCount", { count: openings.length })}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t("projects.openings.totalBillableArea", {
                area: t("common.areaValue", { value: totalArea.toFixed(2) }),
              })}
            </p>
          </div>
          <p className="text-xs font-semibold leading-5 text-slate-500">
            {t("projects.openings.areaRule")}
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <section aria-labelledby="opening-family-heading">
          <div>
            <h3
              id="opening-family-heading"
              className="text-sm font-bold text-slate-950"
            >
              {t("projects.openings.familySelectorTitle")}
            </h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {t("projects.openings.familySelectorDescription")}
            </p>
          </div>
          <div
            role="tablist"
            aria-label={t("projects.openings.familySelectorTitle")}
            className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          >
            {displayedFamilies.map((family) => {
              const isActive = activeFamilyKey === family.key;
              const familyOpenings = openingsByFamily[family.key];
              const familyArea = familyOpenings.reduce(
                (sum, opening) => sum + calculateArea(opening),
                0,
              );

              return (
                <button
                  key={family.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveFamilyKey(family.key);
                    setEditingId(null);
                    setError("");
                  }}
                  className={`min-h-20 rounded-lg border px-3 py-3 text-start transition ${
                    isActive
                      ? "border-[var(--alumex-blue)] bg-blue-50 shadow-sm ring-1 ring-[var(--alumex-blue)]"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`block text-sm font-bold ${
                      isActive
                        ? "text-[var(--alumex-blue)]"
                        : "text-slate-900"
                    }`}
                  >
                    {t(family.labelKey)}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {t("projects.openings.familySummary", {
                      count: familyOpenings.length,
                      area: familyArea.toFixed(2),
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                {t("projects.openings.familySheet", {
                  family: t(activeFamily.labelKey),
                })}
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {activeFamily.key === "other"
                  ? t("projects.openings.otherFamilySheetDescription")
                  : t("projects.openings.familySheetDescription", {
                      family: t(activeFamily.labelKey),
                    })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setNewOpeningsByFamily((currentRows) => ({
                    ...currentRows,
                    [activeFamilyKey]: [
                      ...currentRows[activeFamilyKey],
                      ...rows(3, activeFamily.openingType),
                    ],
                  }))
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                {t("projects.openings.addRows")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setNewOpeningsByFamily((currentRows) => ({
                    ...currentRows,
                    [activeFamilyKey]: rows(5, activeFamily.openingType),
                  }))
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void addOpeningRows()}
                disabled={isSavingRows}
                className="h-10 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("projects.openings.saveRows")}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] table-fixed divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">{t("projects.openings.caption")}</caption>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr className="divide-x divide-slate-200">
                  {spreadsheetColumns.map((column) => (
                    <th key={column.key} className={`${column.widthClass} px-2 py-3`}>
                      {t(column.labelKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {newOpenings.map((opening, index) =>
                  renderEditableRow({
                    rowId: `new-opening-${activeFamilyKey}-${index}`,
                    values: opening,
                    onCellChange: (field, value) =>
                      updateNewOpening(index, field, value),
                    actions: (
                      <button
                        type="button"
                        onClick={() =>
                          setNewOpeningsByFamily((currentRows) => ({
                            ...currentRows,
                            [activeFamilyKey]: currentRows[activeFamilyKey].filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          }))
                        }
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {t("common.delete")}
                      </button>
                    ),
                    lockOpeningType: activeFamily.key !== "other",
                  }),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-950">
              {t("projects.openings.savedFamilyOpenings", {
                family: t(activeFamily.labelKey),
              })}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] table-fixed divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">{t("projects.openings.caption")}</caption>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr className="divide-x divide-slate-200">
                  {spreadsheetColumns.map((column) => (
                    <th key={column.key} className={`${column.widthClass} px-2 py-3`}>
                      {t(column.labelKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeOpenings.map((opening) => {
                  const isEditing = editingId === opening.id;
                  const rowValues = isEditing ? editingOpening : opening;

                  if (isEditing) {
                    return renderEditableRow({
                      rowId: opening.id,
                      values: editingOpening,
                      onCellChange: (field, value) =>
                        setEditingOpening((current) => ({
                          ...current,
                          [field]: value,
                        })),
                      actions: (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveOpening()}
                            className="rounded-md bg-[var(--alumex-blue)] px-3 py-2 text-xs font-bold text-white"
                          >
                            {t("common.saveChanges")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      ),
                      lockOpeningType: activeFamily.key !== "other",
                    });
                  }

                  return (
                    <tr key={opening.id} className="divide-x divide-slate-200">
                      <td className="px-2 py-3 font-semibold text-slate-900">
                        {opening.floor ? term(opening.floor) : "-"}
                      </td>
                      <td className="px-2 py-3 font-semibold text-slate-900">
                        {opening.room ? term(opening.room) : "-"}
                      </td>
                      <td className="px-2 py-3 font-bold text-slate-950">
                        {opening.openingCode}
                      </td>
                      <td className="px-2 py-3 font-semibold text-slate-900">
                        {opening.openingType ? term(opening.openingType) : "-"}
                      </td>
                      <td className="px-2 py-3">
                        {t("common.cmValue", { value: opening.width })}
                      </td>
                      <td className="px-2 py-3">
                        {t("common.cmValue", { value: opening.height })}
                      </td>
                      <td className="px-2 py-3">
                        {opening.notes ? term(opening.notes) : "-"}
                      </td>
                      <td className="bg-blue-50 px-2 py-3 font-bold text-[var(--alumex-blue)]">
                        {formatArea(rowValues, t)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(opening)}
                            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicate(opening.id)}
                            className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[var(--alumex-blue)]"
                          >
                            {t("projects.openings.duplicateOpening")}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteOpening(opening)}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeOpenings.length === 0 ? (
            <div className="border-t border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-bold text-slate-950">
                {t("projects.openings.noFamilyOpenings", {
                  family: t(activeFamily.labelKey),
                })}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {t("projects.openings.noFamilyOpeningsDescription")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
