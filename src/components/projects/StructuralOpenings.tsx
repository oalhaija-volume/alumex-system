"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SectionCard } from "@/components/SectionCard";
import type { StructuralOpening } from "@/data/ui";

export type StructuralOpeningValues = Omit<StructuralOpening, "id">;

const emptyOpening: StructuralOpeningValues = {
  floor: "",
  room: "",
  openingCode: "",
  width: 100,
  height: 100,
  quantity: 1,
  productSystem: "",
  glassType: "",
  aluminumColor: "",
  notes: "",
};

const textFields: Array<{
  key: keyof StructuralOpeningValues;
  labelKey: string;
}> = [
  { key: "floor", labelKey: "projects.openings.fields.floor" },
  { key: "room", labelKey: "projects.openings.fields.room" },
  { key: "openingCode", labelKey: "projects.openings.fields.openingCode" },
  { key: "productSystem", labelKey: "projects.openings.fields.productSystem" },
  { key: "glassType", labelKey: "projects.openings.fields.glassType" },
  { key: "aluminumColor", labelKey: "projects.openings.fields.aluminumColor" },
  { key: "notes", labelKey: "projects.openings.fields.notes" },
];

const numberFields: Array<{
  key: "width" | "height" | "quantity";
  labelKey: string;
  step: string;
}> = [
  { key: "width", labelKey: "projects.openings.fields.width", step: "0.01" },
  { key: "height", labelKey: "projects.openings.fields.height", step: "0.01" },
  { key: "quantity", labelKey: "projects.openings.fields.quantity", step: "1" },
];

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
    quantity: Number(opening.quantity) || 1,
    productSystem: opening.productSystem.trim(),
    glassType: opening.glassType.trim(),
    aluminumColor: opening.aluminumColor.trim(),
    notes: opening.notes.trim(),
  };
}

function OpeningForm({
  values,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  values: StructuralOpeningValues;
  submitLabel: string;
  onChange: (values: StructuralOpeningValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();

  function updateValue(key: keyof StructuralOpeningValues, value: string) {
    onChange({
      ...values,
      [key]:
        key === "width" || key === "height" || key === "quantity"
          ? Number(value)
          : value,
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {textFields.map((field) => (
        <label
          key={field.key}
          className={field.key === "notes" ? "md:col-span-2 xl:col-span-4" : ""}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t(field.labelKey)}
          </span>
          <input
            value={values[field.key]}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
          />
        </label>
      ))}
      {numberFields.map((field) => (
        <label key={field.key}>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t(field.labelKey)}
          </span>
          <input
            type="number"
            min="0"
            step={field.step}
            value={values[field.key]}
            onChange={(event) => updateValue(field.key, event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
          />
        </label>
      ))}
      <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
          {t("common.areaSqm")}
        </p>
        <p className="mt-1 text-lg font-bold text-[var(--alumex-blue)]">
          {formatArea(values, t)}
        </p>
      </div>
      <div className="flex flex-col gap-2 md:flex-row xl:col-span-4 xl:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="h-10 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
        >
          {submitLabel}
        </button>
      </div>
    </div>
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
  onAdd: (opening: StructuralOpeningValues) => void;
  onUpdate: (openingId: string, opening: StructuralOpeningValues) => void;
  onDelete: (openingId: string) => void;
  onDuplicate: (openingId: string) => void;
}) {
  const { t, term } = useI18n();
  const [error, setError] = useState("");
  const [newOpening, setNewOpening] =
    useState<StructuralOpeningValues>(emptyOpening);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOpening, setEditingOpening] =
    useState<StructuralOpeningValues>(emptyOpening);
  const totalArea = openings.reduce(
    (sum, opening) => sum + calculateArea(opening),
    0,
  );

  function beginEdit(opening: StructuralOpening) {
    setEditingId(opening.id);
    setEditingOpening({
      floor: opening.floor,
      room: opening.room,
      openingCode: opening.openingCode,
      width: opening.width,
      height: opening.height,
      quantity: opening.quantity,
      productSystem: opening.productSystem,
      glassType: opening.glassType,
      aluminumColor: opening.aluminumColor,
      notes: opening.notes,
    });
  }

  function addOpening() {
    setError("");
    const normalizedOpening = normalizeOpening(newOpening);

    if (
      !normalizedOpening.openingCode ||
      !normalizedOpening.productSystem ||
      !normalizedOpening.glassType ||
      !normalizedOpening.aluminumColor ||
      normalizedOpening.width <= 0 ||
      normalizedOpening.height <= 0 ||
      normalizedOpening.quantity <= 0
    ) {
      setError(t("projects.openings.validationRequired"));
      return;
    }

    onAdd(normalizedOpening);
    setNewOpening(emptyOpening);
  }

  function saveOpening() {
    if (!editingId) {
      return;
    }

    onUpdate(editingId, normalizeOpening(editingOpening));
    setEditingId(null);
    setEditingOpening(emptyOpening);
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

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-950">
            {t("projects.openings.addOpeningTitle")}
          </h3>
          {error ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-4">
            <OpeningForm
              values={newOpening}
              submitLabel={t("projects.openings.addOpening")}
              onChange={setNewOpening}
              onCancel={() => setNewOpening(emptyOpening)}
              onSubmit={addOpening}
            />
          </div>
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white xl:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">{t("projects.openings.caption")}</caption>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    t("projects.openings.fields.floor"),
                    t("projects.openings.fields.room"),
                    t("projects.openings.fields.openingCode"),
                    t("projects.openings.fields.width"),
                    t("projects.openings.fields.height"),
                    t("projects.openings.fields.quantity"),
                    t("projects.openings.fields.productSystem"),
                    t("projects.openings.fields.glassType"),
                    t("projects.openings.fields.aluminumColor"),
                    t("projects.openings.fields.notes"),
                    t("common.areaSqm"),
                    t("common.actions"),
                  ].map((column) => (
                    <th key={column} className="px-3 py-3">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openings.map((opening) => {
                  const isEditing = editingId === opening.id;
                  const rowValues = isEditing ? editingOpening : opening;

                  return (
                    <tr key={opening.id}>
                      {textFields.slice(0, 3).map((field) => (
                        <td key={field.key} className="px-3 py-3">
                          {isEditing ? (
                            <input
                              value={editingOpening[field.key]}
                              onChange={(event) =>
                                setEditingOpening((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                            />
                          ) : (
                            term(String(opening[field.key]))
                          )}
                        </td>
                      ))}
                      {numberFields.map((field) => (
                        <td key={field.key} className="px-3 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step={field.step}
                              value={editingOpening[field.key]}
                              onChange={(event) =>
                                setEditingOpening((current) => ({
                                  ...current,
                                  [field.key]: Number(event.target.value),
                                }))
                              }
                              className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                            />
                          ) : (
                            field.key === "width" || field.key === "height"
                              ? t("common.cmValue", { value: opening[field.key] })
                              : opening[field.key]
                          )}
                        </td>
                      ))}
                      {textFields.slice(3).map((field) => (
                        <td key={field.key} className="px-3 py-3">
                          {isEditing ? (
                            <input
                              value={editingOpening[field.key]}
                              onChange={(event) =>
                                setEditingOpening((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                            />
                          ) : (
                            opening[field.key] ? term(String(opening[field.key])) : "-"
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 font-bold text-[var(--alumex-blue)]">
                        {formatArea(rowValues, t)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={saveOpening}
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
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 xl:hidden">
          {openings.map((opening) => {
            const isEditing = editingId === opening.id;

            return (
              <article
                key={opening.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                {isEditing ? (
                  <OpeningForm
                    values={editingOpening}
                    submitLabel={t("projects.openings.saveOpening")}
                    onChange={setEditingOpening}
                    onCancel={() => setEditingId(null)}
                    onSubmit={saveOpening}
                  />
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {term(opening.floor)} - {term(opening.room)}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-950">
                          {opening.openingCode}
                        </h3>
                      </div>
                      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-bold text-[var(--alumex-blue)]">
                        {formatArea(opening, t)}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600">
                      <p>
                        {t("projects.openings.fields.width")}:{" "}
                        {t("common.cmValue", { value: opening.width })} ·{" "}
                        {t("projects.openings.fields.height")}:{" "}
                        {t("common.cmValue", { value: opening.height })} ·{" "}
                        {t("projects.openings.fields.quantity")}: {opening.quantity}
                      </p>
                      <p>{term(opening.productSystem)}</p>
                      <p>
                        {term(opening.glassType)} - {term(opening.aluminumColor)}
                      </p>
                      <p>
                        {opening.notes ? term(opening.notes) : t("projects.openings.noNotes")}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => beginEdit(opening)}
                        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicate(opening.id)}
                        className="h-10 rounded-md border border-blue-100 bg-blue-50 px-3 text-sm font-bold text-[var(--alumex-blue)]"
                      >
                        {t("projects.openings.duplicateOpening")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOpening(opening)}
                        className="h-10 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {openings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
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
