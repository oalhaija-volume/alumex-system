"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  defaultOpeningDropdownOptions,
  loadOpeningDropdownOptions,
  optionsForCategory,
  type OpeningDropdownOption,
} from "@/lib/openings/dropdownOptions";

type MeasurementProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  address: string;
  workflowStatus: string;
  client: {
    name: string;
    mobile: string;
    email: string;
  };
};

type MeasurementOpening = {
  id: string;
  floor: string;
  room: string;
  openingCode: string;
  width: number;
  height: number;
  solidPanelHeight: number;
  quantity: number;
  areaSqm: number;
  productSystem: string;
  glassType: string;
  aluminumColor: string;
  notes: string;
};

type OpeningDraft = Omit<MeasurementOpening, "id" | "areaSqm">;

const emptyOpening: OpeningDraft = {
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

const textFields: Array<{
  key: keyof OpeningDraft;
  label: string;
  placeholder: string;
  required?: boolean;
}> = [
  { key: "floor", label: "Floor", placeholder: "Ground floor" },
  {
    key: "openingCode",
    label: "Opening code",
    placeholder: "W-01",
    required: true,
  },
];

const numberFields: Array<{
  key: "width" | "height" | "quantity";
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "width", label: "Width", suffix: "cm", step: "0.01" },
  { key: "height", label: "Height", suffix: "cm", step: "0.01" },
  { key: "quantity", label: "Quantity", suffix: "pcs", step: "1" },
];

const panelField = {
  key: "solidPanelHeight" as const,
  label: "Solid panel (برطاشة)",
  suffix: "cm",
  step: "0.01",
};

function calculateArea(opening: Pick<OpeningDraft, "width" | "height" | "quantity">) {
  return Math.max((opening.width / 100) * (opening.height / 100) * opening.quantity, 1);
}

function openingToDraft(opening: MeasurementOpening): OpeningDraft {
  return {
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
  };
}

function normalizeDraft(opening: OpeningDraft): OpeningDraft {
  return {
    floor: opening.floor.trim(),
    room: opening.room.trim(),
    openingCode: opening.openingCode.trim(),
    width: Number(opening.width) || 0,
    height: Number(opening.height) || 0,
    solidPanelHeight: Math.min(
      Math.max(Number(opening.solidPanelHeight) || 0, 0),
      Number(opening.height) || 0,
    ),
    quantity: Math.max(1, Math.round(Number(opening.quantity) || 1)),
    productSystem: opening.productSystem.trim(),
    glassType: opening.glassType.trim(),
    aluminumColor: opening.aluminumColor.trim(),
    notes: opening.notes.trim(),
  };
}

function hasOpeningContent(opening: OpeningDraft) {
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

function isOpeningValid(opening: OpeningDraft) {
  return Boolean(
    opening.openingCode &&
      opening.width > 0 &&
      opening.height > 0 &&
      opening.quantity > 0 &&
      opening.productSystem &&
      opening.glassType &&
      opening.aluminumColor,
  );
}

function workflowLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function nextOpeningCode(openings: MeasurementOpening[]) {
  return `W-${String(openings.length + 1).padStart(2, "0")}`;
}

function openingRows(count: number, startIndex: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...emptyOpening,
    openingCode: `W-${String(startIndex + index + 1).padStart(2, "0")}`,
  }));
}

function optionLabels(options: OpeningDropdownOption[], currentValue: string) {
  const labels = options.map((option) => option.label);

  return currentValue && !labels.includes(currentValue)
    ? [currentValue, ...labels]
    : labels;
}

export function SiteMeasurementModule() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [project, setProject] = useState<MeasurementProject | null>(null);
  const [openings, setOpenings] = useState<MeasurementOpening[]>([]);
  const [draft, setDraft] = useState<OpeningDraft>(emptyOpening);
  const [newOpenings, setNewOpenings] = useState<OpeningDraft[]>(
    openingRows(5, 0),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openingOptions, setOpeningOptions] = useState<OpeningDropdownOption[]>(
    defaultOpeningDropdownOptions,
  );

  const totalArea = useMemo(
    () =>
      openings.reduce(
        (sum, opening) =>
          sum + calculateArea({ width: opening.width, height: opening.height, quantity: opening.quantity }),
        0,
      ),
    [openings],
  );
  const canStart = project?.workflowStatus === "site_engineer_assigned";
  const canComplete = project?.workflowStatus === "measurement_pending";
  const isEditable = canStart || canComplete;
  const roomOptions = useMemo(
    () => optionsForCategory(openingOptions, "room"),
    [openingOptions],
  );
  const systemOptions = useMemo(
    () => optionsForCategory(openingOptions, "aluminum_section"),
    [openingOptions],
  );
  const glassTypeOptions = useMemo(
    () => optionsForCategory(openingOptions, "glass_type"),
    [openingOptions],
  );
  const glassColorOptions = useMemo(
    () => optionsForCategory(openingOptions, "glass_color"),
    [openingOptions],
  );

  const loadMeasurements = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const response = await fetch(`/api/site-measurements/${projectId}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | {
          project?: MeasurementProject;
          openings?: MeasurementOpening[];
          error?: string;
        }
      | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Unable to load measurements.");
    }

    setProject(body?.project ?? null);
    const loadedOpenings = body?.openings ?? [];
    setOpenings(loadedOpenings);
    setDraft((current) =>
      current.openingCode
        ? current
        : { ...current, openingCode: nextOpeningCode(loadedOpenings) },
    );
    setNewOpenings(openingRows(5, loadedOpenings.length));
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMeasurements().catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load measurements.",
        );
        setIsLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMeasurements]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOpeningDropdownOptions()
        .then(setOpeningOptions)
        .catch(() => setOpeningOptions(defaultOpeningDropdownOptions));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function updateDraft(key: keyof OpeningDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]:
        key === "width" ||
        key === "height" ||
        key === "quantity" ||
        key === "solidPanelHeight"
          ? Number(value)
          : value,
    }));
  }

  function updateNewOpening(
    index: number,
    key: keyof OpeningDraft,
    value: string,
  ) {
    setNewOpenings((currentOpenings) =>
      currentOpenings.map((opening, openingIndex) =>
        openingIndex === index
          ? {
              ...opening,
              [key]:
                key === "width" ||
                key === "height" ||
                key === "quantity" ||
                key === "solidPanelHeight"
                  ? Number(value)
                  : value,
            }
          : opening,
      ),
    );
  }

  async function runWorkflowAction(workflowAction: "startMeasurement" | "completeMeasurement") {
    setError("");
    setMessage("");
    setWorkflowSaving(workflowAction);

    try {
      const response = await fetch("/api/workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, workflowAction }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to update measurement workflow.");
      }

      await loadMeasurements();
      setMessage(
        workflowAction === "startMeasurement"
          ? "Detailed measurement is now open for site entry."
          : "Detailed measurements are completed and ready for project description.",
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update measurement workflow.",
      );
    } finally {
      setWorkflowSaving(null);
    }
  }

  async function saveOpeningPayload(opening: OpeningDraft, openingId?: string) {
    const response = await fetch(`/api/site-measurements/${projectId}`, {
      method: openingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(openingId ? { ...opening, id: openingId } : opening),
    });
    const body = (await response.json().catch(() => null)) as
      | { opening?: MeasurementOpening; error?: string }
      | null;

    if (!response.ok || !body?.opening) {
      throw new Error(body?.error ?? "Unable to save opening.");
    }

    return body.opening;
  }

  async function saveNewOpenings() {
    setError("");
    setMessage("");

    const normalizedOpenings = newOpenings
      .filter(hasOpeningContent)
      .map(normalizeDraft);

    if (normalizedOpenings.length === 0) {
      setError("Add at least one structural opening before saving.");
      return;
    }

    if (normalizedOpenings.some((opening) => !isOpeningValid(opening))) {
      setError("Complete the required opening details before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const savedOpenings: MeasurementOpening[] = [];
      for (const opening of normalizedOpenings) {
        savedOpenings.push(await saveOpeningPayload(opening));
      }

      const nextCount = openings.length + savedOpenings.length;
      setOpenings((current) => [...current, ...savedOpenings]);
      setNewOpenings(openingRows(5, nextCount));
      setMessage(
        savedOpenings.length === 1
          ? "Opening saved."
          : `${savedOpenings.length} openings saved.`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save opening.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEditedOpening() {
    if (!editingId) {
      return;
    }

    setError("");
    setMessage("");

    const normalized = normalizeDraft(draft);
    if (!isOpeningValid(normalized)) {
      setError("Complete the required opening details before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const savedOpening = await saveOpeningPayload(normalized, editingId);
      setOpenings((current) =>
        current.map((opening) =>
          opening.id === savedOpening.id ? savedOpening : opening,
        ),
      );
      setDraft(emptyOpening);
      setEditingId(null);
      setMessage("Opening updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save opening.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteOpening(openingId: string) {
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/site-measurements/${projectId}?openingId=${encodeURIComponent(openingId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to delete opening.");
      }

      setOpenings((current) => current.filter((opening) => opening.id !== openingId));
      if (editingId === openingId) {
        setEditingId(null);
        setDraft(emptyOpening);
      }
      setMessage("Opening removed.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete opening.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function editOpening(opening: MeasurementOpening) {
    setEditingId(opening.id);
    setDraft(openingToDraft(opening));
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({ ...emptyOpening, openingCode: nextOpeningCode(openings) });
    setError("");
  }

  if (isLoading) {
    return (
      <div className="material-card p-5">
        <p className="text-sm font-bold text-muted-strong">Loading measurements...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="material-alert-error">
        {error || "Measurement project was not found."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28 sm:pb-4">
      <div className="material-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">
              {project.projectNumber}
            </p>
            <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
              {project.projectName}
            </h1>
            <p className="mt-2 text-sm font-semibold text-muted-strong">
              {project.client.name || "Client not added"}
            </p>
            {project.address ? (
              <p className="mt-1 text-sm text-muted">{project.address}</p>
            ) : null}
          </div>
          <span className="material-status self-start">
            {workflowLabel(project.workflowStatus)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="material-card-muted p-3">
            <p className="text-xs font-bold uppercase text-muted">Openings</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {openings.length}
            </p>
          </div>
          <div className="material-card-muted p-3">
            <p className="text-xs font-bold uppercase text-muted">Billable area</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {totalArea.toFixed(2)} m2
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_1fr]">
          {canStart ? (
            <button
              type="button"
              onClick={() => void runWorkflowAction("startMeasurement")}
              disabled={Boolean(workflowSaving)}
              className="material-button-filled min-h-12 w-full sm:w-auto"
            >
              {workflowSaving === "startMeasurement"
                ? "Starting..."
                : "Start site measurement"}
            </button>
          ) : null}
          {canComplete ? (
            <button
              type="button"
              onClick={() => void runWorkflowAction("completeMeasurement")}
              disabled={Boolean(workflowSaving) || openings.length === 0}
              className="material-button-filled min-h-12 w-full sm:w-auto"
            >
              {workflowSaving === "completeMeasurement"
                ? "Completing..."
                : "Complete measurements"}
            </button>
          ) : null}
          <Link
            href={`/workflow/${project.id}`}
            className="material-button-tonal min-h-12 w-full sm:w-auto"
          >
            Workflow details
          </Link>
        </div>
      </div>

      {message ? <div className="material-alert-success">{message}</div> : null}
      {error ? <div className="material-alert-error">{error}</div> : null}

      <section className="material-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted">
              {editingId ? "Edit opening" : "New openings"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              Structural openings
            </h2>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="material-button-outlined h-11 px-3"
            >
              Cancel
            </button>
          ) : null}
        </div>

        {canStart ? (
          <div className="mt-4 rounded-lg border border-material-outline-variant bg-material-primary-container p-4 text-material-on-primary-container">
            <p className="text-sm font-bold">Project received by site engineer.</p>
            <p className="mt-1 text-sm">
              Start the site measurement to unlock structural opening entry.
            </p>
          </div>
        ) : null}

        {editingId ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {textFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="material-label">
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  <input
                    value={String(draft[field.key])}
                    onChange={(event) => updateDraft(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    disabled={!isEditable}
                    className="material-field mt-2 min-h-12"
                  />
                </label>
              ))}

              <label className="block">
                <span className="material-label">Room</span>
                <select
                  value={draft.room}
                  onChange={(event) => updateDraft("room", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">Select room</option>
                  {optionLabels(roomOptions, draft.room).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              {numberFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="material-label">{field.label}</span>
                  <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container">
                    <input
                      type="number"
                      min="0"
                      inputMode={field.key === "quantity" ? "numeric" : "decimal"}
                      step={field.step}
                      value={draft[field.key]}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      disabled={!isEditable}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                    />
                    <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                      {field.suffix}
                    </span>
                  </div>
                </label>
              ))}

              <label className="block">
                <span className="material-label">{panelField.label}</span>
                <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container">
                  <input
                    type="number"
                    min="0"
                    max={draft.height}
                    inputMode="decimal"
                    step={panelField.step}
                    value={draft.solidPanelHeight}
                    onChange={(event) =>
                      updateDraft(panelField.key, event.target.value)
                    }
                    disabled={!isEditable}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                  />
                  <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                    {panelField.suffix}
                  </span>
                </div>
              </label>

              <label className="block">
                <span className="material-label">Aluminum section *</span>
                <select
                  value={draft.productSystem}
                  onChange={(event) => updateDraft("productSystem", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">Select section</option>
                  {optionLabels(systemOptions, draft.productSystem).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">Glass type *</span>
                <select
                  value={draft.glassType}
                  onChange={(event) => updateDraft("glassType", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">Select glass type</option>
                  {optionLabels(glassTypeOptions, draft.glassType).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">Glass color *</span>
                <select
                  value={draft.aluminumColor}
                  onChange={(event) => updateDraft("aluminumColor", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">Select color</option>
                  {optionLabels(glassColorOptions, draft.aluminumColor).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="material-label">Site notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                  rows={3}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-24 py-3"
                  placeholder="Threshold, side clearance, wall condition, access notes"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="material-card-muted p-3">
                <p className="text-xs font-bold uppercase text-muted">Area estimate</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {calculateArea(draft).toFixed(2)} m2
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveEditedOpening()}
                disabled={!isEditable || isSaving}
                className="material-button-filled min-h-12 w-full sm:w-auto"
              >
                {isSaving ? "Saving..." : "Save opening"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-muted-strong">
                Add all site-measured structural openings, then save them together.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() =>
                    setNewOpenings((currentOpenings) => [
                      ...currentOpenings,
                      ...openingRows(3, openings.length + currentOpenings.length),
                    ])
                  }
                  disabled={!isEditable || isSaving}
                  className="material-button-tonal min-h-11 px-3"
                >
                  Add rows
                </button>
                <button
                  type="button"
                  onClick={() => setNewOpenings(openingRows(5, openings.length))}
                  disabled={!isEditable || isSaving}
                  className="material-button-outlined min-h-11 px-3"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {newOpenings.map((opening, index) => (
                <div
                  key={`new-opening-${index}`}
                  className="material-card-muted p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-muted">
                        Opening {index + 1}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {opening.openingCode || "New structural opening"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNewOpenings((currentOpenings) =>
                          currentOpenings.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                      disabled={!isEditable || isSaving || newOpenings.length === 1}
                      className="material-button-outlined h-10 px-3"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {textFields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="material-label">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        <input
                          value={String(opening[field.key])}
                          onChange={(event) =>
                            updateNewOpening(index, field.key, event.target.value)
                          }
                          placeholder={field.placeholder}
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-12"
                        />
                      </label>
                    ))}

                    <label className="block">
                      <span className="material-label">Room</span>
                      <select
                        value={opening.room}
                        onChange={(event) =>
                          updateNewOpening(index, "room", event.target.value)
                        }
                        disabled={!isEditable}
                        className="material-field mt-2 min-h-12"
                      >
                        <option value="">Select room</option>
                        {optionLabels(roomOptions, opening.room).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    {numberFields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="material-label">{field.label}</span>
                        <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container-low">
                          <input
                            type="number"
                            min="0"
                            inputMode={field.key === "quantity" ? "numeric" : "decimal"}
                            step={field.step}
                            value={opening[field.key]}
                            onChange={(event) =>
                              updateNewOpening(index, field.key, event.target.value)
                            }
                            disabled={!isEditable}
                            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                          />
                          <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                            {field.suffix}
                          </span>
                        </div>
                      </label>
                    ))}

                    <label className="block">
                      <span className="material-label">{panelField.label}</span>
                      <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container-low">
                        <input
                          type="number"
                          min="0"
                          max={opening.height}
                          inputMode="decimal"
                          step={panelField.step}
                          value={opening.solidPanelHeight}
                          onChange={(event) =>
                            updateNewOpening(index, panelField.key, event.target.value)
                          }
                          disabled={!isEditable}
                          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                        />
                        <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                          {panelField.suffix}
                        </span>
                      </div>
                    </label>

                    <label className="block">
                      <span className="material-label">Aluminum section *</span>
                      <select
                        value={opening.productSystem}
                        onChange={(event) =>
                          updateNewOpening(index, "productSystem", event.target.value)
                        }
                        disabled={!isEditable}
                        className="material-field mt-2 min-h-12"
                      >
                        <option value="">Select section</option>
                        {optionLabels(systemOptions, opening.productSystem).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="material-label">Glass type *</span>
                      <select
                        value={opening.glassType}
                        onChange={(event) =>
                          updateNewOpening(index, "glassType", event.target.value)
                        }
                        disabled={!isEditable}
                        className="material-field mt-2 min-h-12"
                      >
                        <option value="">Select glass type</option>
                        {optionLabels(glassTypeOptions, opening.glassType).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="material-label">Glass color *</span>
                      <select
                        value={opening.aluminumColor}
                        onChange={(event) =>
                          updateNewOpening(index, "aluminumColor", event.target.value)
                        }
                        disabled={!isEditable}
                        className="material-field mt-2 min-h-12"
                      >
                        <option value="">Select color</option>
                        {optionLabels(glassColorOptions, opening.aluminumColor).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="material-label">Site notes</span>
                      <textarea
                        value={opening.notes}
                        onChange={(event) =>
                          updateNewOpening(index, "notes", event.target.value)
                        }
                        rows={2}
                        disabled={!isEditable}
                        className="material-field mt-2 min-h-20 py-3"
                        placeholder="Threshold, side clearance, wall condition, access notes"
                      />
                    </label>
                  </div>

                  <div className="mt-3 material-card p-3 shadow-none">
                    <p className="text-xs font-bold uppercase text-muted">Area estimate</p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {calculateArea(opening).toFixed(2)} m2
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void saveNewOpenings()}
              disabled={!isEditable || isSaving}
              className="material-button-filled mt-4 min-h-12 w-full"
            >
              {isSaving ? "Saving..." : "Save structural openings"}
            </button>
          </>
        )}

        {!isEditable ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            Start site measurement before entering structural openings.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">Saved openings</h2>
          <span className="material-status">{openings.length} total</span>
        </div>

        {openings.length ? (
          openings.map((opening, index) => (
            <article key={opening.id} className="material-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-muted">
                    Opening {index + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-foreground">
                    {opening.openingCode}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-muted-strong">
                    {[opening.floor, opening.room].filter(Boolean).join(" - ") ||
                      "Location not added"}
                  </p>
                </div>
                <span className="material-status">
                  {calculateArea(opening).toFixed(2)} m2
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">W</p>
                  <p className="text-sm font-bold text-foreground">{opening.width} cm</p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">H</p>
                  <p className="text-sm font-bold text-foreground">{opening.height} cm</p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">برطاشة</p>
                  <p className="text-sm font-bold text-foreground">
                    {opening.solidPanelHeight} cm
                  </p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">Qty</p>
                  <p className="text-sm font-bold text-foreground">{opening.quantity}</p>
                </div>
              </div>

              <div className="mt-3 text-sm font-semibold text-muted-strong">
                <p>{opening.productSystem}</p>
                <p>{opening.glassType}</p>
                <p>{opening.aluminumColor}</p>
                {opening.notes ? (
                  <p className="mt-2 font-normal text-muted">{opening.notes}</p>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => editOpening(opening)}
                  disabled={!isEditable || isSaving}
                  className="material-button-tonal"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteOpening(opening.id)}
                  disabled={!isEditable || isSaving}
                  className="material-button-danger"
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="material-card-muted p-5 text-center">
            <p className="text-sm font-bold text-foreground">
              No structural openings saved yet.
            </p>
            <p className="mt-1 text-sm text-muted">
              Add structural openings after starting detailed measurement.
            </p>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-material-outline-variant bg-material-surface-container-low p-3 shadow-[var(--md-elevation-2)] sm:hidden">
        <button
          type="button"
          onClick={() =>
            void (editingId ? saveEditedOpening() : saveNewOpenings())
          }
          disabled={!isEditable || isSaving}
          className="material-button-filled min-h-12 w-full"
        >
          {isSaving
            ? "Saving..."
            : editingId
              ? "Save opening"
              : "Save structural openings"}
        </button>
      </div>
    </div>
  );
}
