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
import {
  loadProductPrices,
  productsForCatalog,
} from "@/lib/pricing/productPricing";

export type StructuralOpeningValues = Omit<StructuralOpening, "id">;

const emptyOpening: StructuralOpeningValues = {
  floor: "",
  room: "",
  openingCode: "",
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
    key: "solidPanelHeight",
    labelKey: "projects.openings.fields.solidPanelHeight",
    widthClass: "w-32",
  },
  {
    key: "quantity",
    labelKey: "projects.openings.fields.quantity",
    widthClass: "w-24",
  },
  {
    key: "productSystem",
    labelKey: "projects.openings.fields.productSystem",
    widthClass: "w-48",
  },
  {
    key: "glassType",
    labelKey: "projects.openings.fields.glassType",
    widthClass: "w-48",
  },
  {
    key: "aluminumColor",
    labelKey: "projects.openings.fields.aluminumColor",
    widthClass: "w-40",
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
  productSystem: "aluminum_section",
  glassType: "glass_type",
  aluminumColor: "glass_color",
};

const numberFields = new Set<keyof StructuralOpeningValues>([
  "width",
  "height",
  "solidPanelHeight",
  "quantity",
]);

function calculateArea(opening: Pick<StructuralOpening, "width" | "height" | "quantity">) {
  const rawArea = (opening.width / 100) * (opening.height / 100) * opening.quantity;
  return Math.max(rawArea, 1);
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

function hasOpeningContent(opening: StructuralOpeningValues) {
  return Boolean(
    opening.floor.trim() ||
      opening.room.trim() ||
      opening.openingCode.trim() ||
      opening.productSystem.trim() ||
      opening.glassType.trim() ||
      opening.aluminumColor.trim() ||
      opening.notes.trim(),
  );
}

function isOpeningValid(opening: StructuralOpeningValues) {
  return Boolean(
    opening.openingCode &&
      opening.productSystem &&
      opening.glassType &&
      opening.aluminumColor &&
      opening.width > 0 &&
      opening.height > 0 &&
      opening.quantity > 0,
  );
}

function rows(count: number) {
  return Array.from({ length: count }, () => ({ ...emptyOpening }));
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
}: {
  field: keyof StructuralOpeningValues;
  value: StructuralOpeningValues;
  optionsByCategory: Record<OpeningOptionCategory, OpeningDropdownOption[]>;
  onChange: (value: string | number) => void;
}) {
  const { t } = useI18n();
  const commonClass =
    "h-10 w-full rounded-none border-0 bg-transparent px-2 text-sm font-semibold text-slate-900 outline-none transition focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-[var(--alumex-blue)]";
  const dropdownCategory = dropdownFieldCategories[field];

  if (dropdownCategory) {
    return (
      <select
        value={String(value[field])}
        onChange={(event) => onChange(event.target.value)}
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
        className={commonClass}
      />
    );
  }

  return (
    <input
      value={String(value[field])}
      onChange={(event) => onChange(event.target.value)}
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
  const [newOpenings, setNewOpenings] = useState<StructuralOpeningValues[]>(
    rows(5),
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
        const [loadedDropdownOptions, productPrices] = await Promise.all([
          loadOpeningDropdownOptions(),
          loadProductPrices().catch(() => []),
        ]);
        const existingSectionLabels = new Set(
          loadedDropdownOptions
            .filter((option) => option.category === "aluminum_section")
            .map((option) => option.label.toLowerCase()),
        );
        const pricedSections = productsForCatalog(
          productPrices,
          "aluminum_section",
          true,
        ).flatMap((product, index) =>
          existingSectionLabels.has(product.product_name.toLowerCase())
            ? []
            : [
                {
                  category: "aluminum_section" as const,
                  label: product.product_name,
                  sort_order: 1000 + index,
                  is_active: true,
                },
              ],
        );

        setDropdownOptions([...loadedDropdownOptions, ...pricedSections]);
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
    setNewOpenings((currentOpenings) =>
      currentOpenings.map((opening, openingIndex) =>
        openingIndex === index ? { ...opening, [field]: value } : opening,
      ),
    );
  }

  async function addOpeningRows() {
    setError("");
    const normalizedOpenings = newOpenings
      .filter(hasOpeningContent)
      .map(normalizeOpening);

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
      setNewOpenings(rows(5));
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

    const normalizedOpening = normalizeOpening(editingOpening);

    if (!isOpeningValid(normalizedOpening)) {
      setError(t("projects.openings.validationRequired"));
      return;
    }

    try {
      await onUpdate(editingId, normalizedOpening);
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
  }: {
    rowId: string;
    values: StructuralOpeningValues;
    onCellChange: (field: keyof StructuralOpeningValues, value: string | number) => void;
    actions: ReactNode;
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

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                {t("projects.openings.salesSpreadsheet")}
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {t("projects.openings.salesSpreadsheetDescription")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setNewOpenings((currentOpenings) => [
                    ...currentOpenings,
                    ...rows(3),
                  ])
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
              >
                {t("projects.openings.addRows")}
              </button>
              <button
                type="button"
                onClick={() => setNewOpenings(rows(5))}
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
            <table className="min-w-[1650px] table-fixed divide-y divide-slate-200 text-left text-sm">
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
                    rowId: `new-opening-${index}`,
                    values: opening,
                    onCellChange: (field, value) =>
                      updateNewOpening(index, field, value),
                    actions: (
                      <button
                        type="button"
                        onClick={() =>
                          setNewOpenings((currentOpenings) =>
                            currentOpenings.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {t("common.delete")}
                      </button>
                    ),
                  }),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-950">
              {t("projects.openings.savedOpenings")}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1650px] table-fixed divide-y divide-slate-200 text-left text-sm">
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
                {openings.map((opening) => {
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
                      <td className="px-2 py-3">
                        {t("common.cmValue", { value: opening.width })}
                      </td>
                      <td className="px-2 py-3">
                        {t("common.cmValue", { value: opening.height })}
                      </td>
                      <td className="px-2 py-3">
                        {t("common.cmValue", { value: opening.solidPanelHeight })}
                      </td>
                      <td className="px-2 py-3">{opening.quantity}</td>
                      <td className="px-2 py-3">
                        {opening.productSystem ? term(opening.productSystem) : "-"}
                      </td>
                      <td className="px-2 py-3">
                        {opening.glassType ? term(opening.glassType) : "-"}
                      </td>
                      <td className="px-2 py-3">
                        {opening.aluminumColor ? term(opening.aluminumColor) : "-"}
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

          {openings.length === 0 ? (
            <div className="border-t border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-bold text-slate-950">
                {t("projects.openings.noOpenings")}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {t("projects.openings.noOpeningsDescription")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
