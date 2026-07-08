"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
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
  length: number;
  shape: string;
  type: string;
  openingType: string;
  bottomFrame: string;
  openingDirection: string;
  glassColor: string;
  solidPanelHeight: number;
  fixedHeight: number;
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
  length: 100,
  shape: "",
  type: "",
  openingType: "",
  bottomFrame: "",
  openingDirection: "",
  glassColor: "",
  solidPanelHeight: 0,
  fixedHeight: 0,
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
  { key: "floor", label: "Floor", placeholder: "Ground floor", required: true },
  {
    key: "openingCode",
    label: "Opening code",
    placeholder: "W-01",
    required: true,
  },
];

const numberFields: Array<{
  key: "width" | "height";
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "width", label: "Width", suffix: "cm", step: "0.01" },
  { key: "height", label: "Length", suffix: "cm", step: "0.01" },
];

const measurementNumberFields: Array<{
  key: "solidPanelHeight" | "fixedHeight";
  label: string;
  suffix: string;
  step: string;
}> = [
  {
    key: "solidPanelHeight",
    label: "Solid panel height",
    suffix: "cm",
    step: "0.01",
  },
  { key: "fixedHeight", label: "Fixed height", suffix: "cm", step: "0.01" },
];

const shapeOptions = ["Rectangle", "Arched", "Triangle", "Circle", "Custom"];
const typeOptions = ["Window", "Door", "Sliding", "Fixed", "Curtain Wall", "Skylight"];
const bottomFrameOptions = ["With bottom frame", "Without bottom frame", "Low threshold", "Flush"];
const openingDirectionOptions = ["Left", "Right", "Inside", "Outside", "Sliding left", "Sliding right", "Fixed"];
const mobileWizardSteps = ["Location", "Dimensions", "Details", "Review"];

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
    length: opening.length || opening.height,
    shape: opening.shape,
    type: opening.openingType || opening.type,
    openingType: opening.openingType || opening.type,
    bottomFrame: opening.bottomFrame,
    openingDirection: opening.openingDirection,
    glassColor: opening.glassColor || opening.aluminumColor,
    solidPanelHeight: opening.solidPanelHeight,
    fixedHeight: opening.fixedHeight,
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
    length: Number(opening.height) || 0,
    shape: opening.shape.trim(),
    type: (opening.openingType || opening.type).trim(),
    openingType: (opening.openingType || opening.type).trim(),
    bottomFrame: opening.bottomFrame.trim(),
    openingDirection: opening.openingDirection.trim(),
    glassColor: (opening.glassColor || opening.aluminumColor).trim(),
    solidPanelHeight: Math.min(
      Math.max(Number(opening.solidPanelHeight) || 0, 0),
      Number(opening.height) || 0,
    ),
    fixedHeight: Math.min(
      Math.max(Number(opening.fixedHeight) || 0, 0),
      Number(opening.height) || 0,
    ),
    quantity: Math.max(1, Math.round(Number(opening.quantity) || 1)),
    productSystem: (opening.productSystem || opening.openingType || opening.type).trim(),
    glassType: (opening.glassType || opening.openingType || opening.type).trim(),
    aluminumColor: (opening.aluminumColor || opening.glassColor).trim(),
    notes: opening.notes.trim(),
  };
}

function hasOpeningContent(opening: OpeningDraft) {
  return Boolean(
    opening.floor.trim() ||
      opening.room.trim() ||
      opening.openingCode.trim() ||
      opening.shape.trim() ||
      opening.openingType.trim() ||
      opening.type.trim() ||
      opening.bottomFrame.trim() ||
      opening.openingDirection.trim() ||
      opening.glassColor.trim() ||
      opening.notes.trim(),
  );
}

function isOpeningValid(opening: OpeningDraft) {
  return Boolean(
    opening.floor &&
      opening.room &&
      opening.openingCode &&
      opening.width > 0 &&
      opening.height > 0 &&
      opening.shape &&
      (opening.openingType || opening.type) &&
      opening.bottomFrame &&
      opening.openingDirection &&
      opening.glassColor,
  );
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
  const { t, term } = useI18n();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [project, setProject] = useState<MeasurementProject | null>(null);
  const [openings, setOpenings] = useState<MeasurementOpening[]>([]);
  const [draft, setDraft] = useState<OpeningDraft>(emptyOpening);
  const [newOpenings, setNewOpenings] = useState<OpeningDraft[]>(
    openingRows(1, 0),
  );
  const [wizardIndex, setWizardIndex] = useState(0);
  const [mobileWizardStep, setMobileWizardStep] = useState(0);
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
      throw new Error(body?.error ?? t("measurements.loadError"));
    }

    setProject(body?.project ?? null);
    const loadedOpenings = body?.openings ?? [];
    setOpenings(loadedOpenings);
    setDraft((current) =>
      current.openingCode
        ? current
        : { ...current, openingCode: nextOpeningCode(loadedOpenings) },
    );
    setNewOpenings(openingRows(1, loadedOpenings.length));
    setWizardIndex(0);
    setMobileWizardStep(0);
    setIsLoading(false);
  }, [projectId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMeasurements().catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("measurements.loadError"),
        );
        setIsLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMeasurements, t]);

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
        key === "solidPanelHeight" ||
        key === "fixedHeight"
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
                key === "solidPanelHeight" ||
                key === "fixedHeight"
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
        throw new Error(body?.error ?? t("measurements.workflowUpdateError"));
      }

      await loadMeasurements();
      setMessage(
        workflowAction === "startMeasurement"
          ? t("measurements.startSuccess")
          : t("measurements.completeSuccess"),
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("measurements.workflowUpdateError"),
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
      throw new Error(body?.error ?? t("measurements.saveOpeningError"));
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
      setError(t("measurements.addOpeningBeforeSaving"));
      return;
    }

    if (normalizedOpenings.some((opening) => !isOpeningValid(opening))) {
      setError(t("measurements.completeRequiredDetails"));
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
      setNewOpenings(openingRows(1, nextCount));
      setWizardIndex(0);
      setMobileWizardStep(0);
      setMessage(
        savedOpenings.length === 1
          ? t("measurements.openingSaved")
          : t("measurements.openingsSaved", { count: savedOpenings.length }),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("measurements.saveOpeningError"));
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
      setError(t("measurements.completeRequiredDetails"));
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
      setMessage(t("measurements.openingUpdated"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("measurements.saveOpeningError"));
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
        throw new Error(body?.error ?? t("measurements.deleteOpeningError"));
      }

      setOpenings((current) => current.filter((opening) => opening.id !== openingId));
      if (editingId === openingId) {
        setEditingId(null);
        setDraft(emptyOpening);
      }
      setMessage(t("measurements.openingRemoved"));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("measurements.deleteOpeningError"),
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

  function canContinueMobileStep(opening: OpeningDraft, step: number) {
    const normalized = normalizeDraft(opening);

    if (step === 0) {
      return Boolean(normalized.floor && normalized.room && normalized.openingCode);
    }

    if (step === 1) {
      return normalized.width > 0 && normalized.height > 0 && normalized.quantity > 0;
    }

    if (step === 2) {
      return Boolean(
        normalized.shape &&
          normalized.openingType &&
          normalized.bottomFrame &&
          normalized.openingDirection &&
          normalized.glassColor,
      );
    }

    return isOpeningValid(normalized);
  }

  function goToNextMobileStep(opening: OpeningDraft) {
    setError("");
    setMessage("");

    if (!canContinueMobileStep(opening, mobileWizardStep)) {
      setError(t("measurements.completeStep"));
      return;
    }

    setMobileWizardStep((currentStep) =>
      Math.min(currentStep + 1, mobileWizardSteps.length - 1),
    );
  }

  function goToPreviousMobileStep() {
    setError("");
    setMobileWizardStep((currentStep) => Math.max(currentStep - 1, 0));
  }

  if (isLoading) {
    return (
      <div className="material-card p-5">
        <p className="text-sm font-bold text-muted-strong">{t("measurements.loading")}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="material-alert-error">
        {error || t("measurements.projectNotFound")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full space-y-4 pb-28 sm:pb-4">
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
              {project.client.name || t("common.notAdded")}
            </p>
            {project.address ? (
              <p className="mt-1 text-sm text-muted">{project.address}</p>
            ) : null}
          </div>
          <span className="material-status self-start">
            {term(project.workflowStatus)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="material-card-muted p-3">
            <p className="text-xs font-bold uppercase text-muted">{t("measurements.openings")}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {openings.length}
            </p>
          </div>
          <div className="material-card-muted p-3">
            <p className="text-xs font-bold uppercase text-muted">{t("measurements.billableArea")}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {t("common.areaValue", { value: totalArea.toFixed(2) })}
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
                ? t("measurements.starting")
                : t("measurements.startSiteMeasurement")}
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
                ? t("measurements.completing")
                : t("measurements.completeMeasurements")}
            </button>
          ) : null}
          <Link
            href={`/workflow/${project.id}`}
            className="material-button-tonal min-h-12 w-full sm:w-auto"
          >
            {t("measurements.workflowDetails")}
          </Link>
        </div>
      </div>

      {message ? <div className="material-alert-success">{message}</div> : null}
      {error ? <div className="material-alert-error">{error}</div> : null}

      <section className="material-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted">
              {editingId ? t("measurements.editOpening") : t("measurements.newOpenings")}
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              {t("measurements.structuralOpenings")}
            </h2>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="material-button-outlined h-11 px-3"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>

        {canStart ? (
          <div className="mt-4 rounded-lg border border-material-outline-variant bg-material-primary-container p-4 text-material-on-primary-container">
            <p className="text-sm font-bold">{t("measurements.receivedBySiteEngineer")}</p>
            <p className="mt-1 text-sm">
              {t("measurements.startToUnlock")}
            </p>
          </div>
        ) : null}

        {editingId ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {textFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="material-label">
                    {term(field.label)}
                    {field.required ? " *" : ""}
                  </span>
                  <input
                    value={String(draft[field.key])}
                    onChange={(event) => updateDraft(field.key, event.target.value)}
                    placeholder={term(field.placeholder)}
                    disabled={!isEditable}
                    className="material-field mt-2 min-h-12"
                  />
                </label>
              ))}

              <label className="block">
                <span className="material-label">{term("Room")}</span>
                <select
                  value={draft.room}
                  onChange={(event) => updateDraft("room", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectRoom")}</option>
                  {optionLabels(roomOptions, draft.room).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              {numberFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="material-label">{term(field.label)}</span>
                  <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container">
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      step={field.step}
                      value={draft[field.key]}
                      onChange={(event) => updateDraft(field.key, event.target.value)}
                      disabled={!isEditable}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                    />
                    <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                      {term(field.suffix)}
                    </span>
                  </div>
                </label>
              ))}

              <label className="block">
                <span className="material-label">{term("Quantity")}</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  step="1"
                  value={draft.quantity}
                  onChange={(event) => updateDraft("quantity", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                />
              </label>

              <label className="block">
                <span className="material-label">{term("Shape")} *</span>
                <select
                  value={draft.shape}
                  onChange={(event) => updateDraft("shape", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectShape")}</option>
                  {optionLabels(
                    shapeOptions.map((label, index) => ({
                      category: "room" as const,
                      label,
                      sort_order: index + 1,
                      is_active: true,
                    })),
                    draft.shape,
                  ).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">{term("Type")} *</span>
                <select
                  value={draft.openingType || draft.type}
                  onChange={(event) => updateDraft("openingType", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectType")}</option>
                  {optionLabels(
                    typeOptions.map((label, index) => ({
                      category: "room" as const,
                      label,
                      sort_order: index + 1,
                      is_active: true,
                    })),
                    draft.openingType || draft.type,
                  ).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">{term("Bottom frame")} *</span>
                <select
                  value={draft.bottomFrame}
                  onChange={(event) => updateDraft("bottomFrame", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectBottomFrame")}</option>
                  {optionLabels(
                    bottomFrameOptions.map((label, index) => ({
                      category: "room" as const,
                      label,
                      sort_order: index + 1,
                      is_active: true,
                    })),
                    draft.bottomFrame,
                  ).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">{term("Opening direction")} *</span>
                <select
                  value={draft.openingDirection}
                  onChange={(event) =>
                    updateDraft("openingDirection", event.target.value)
                  }
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectDirection")}</option>
                  {optionLabels(
                    openingDirectionOptions.map((label, index) => ({
                      category: "room" as const,
                      label,
                      sort_order: index + 1,
                      is_active: true,
                    })),
                    draft.openingDirection,
                  ).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="material-label">{term("Glass color")} *</span>
                <select
                  value={draft.glassColor}
                  onChange={(event) => updateDraft("glassColor", event.target.value)}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-12"
                >
                  <option value="">{t("measurements.selectColor")}</option>
                  {optionLabels(glassColorOptions, draft.glassColor).map((option) => (
                    <option key={option} value={option}>
                      {term(option)}
                    </option>
                  ))}
                </select>
              </label>

              {measurementNumberFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="material-label">{term(field.label)}</span>
                <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container">
                  <input
                    type="number"
                    min="0"
                    max={draft.height}
                    inputMode="decimal"
                    step={field.step}
                    value={draft[field.key]}
                    onChange={(event) =>
                      updateDraft(field.key, event.target.value)
                    }
                    disabled={!isEditable}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                  />
                  <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                    {term(field.suffix)}
                  </span>
                </div>
                </label>
              ))}

              <label className="block sm:col-span-2">
                <span className="material-label">{t("measurements.siteNotes")}</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                  rows={3}
                  disabled={!isEditable}
                  className="material-field mt-2 min-h-24 py-3"
                  placeholder={t("measurements.siteNotesPlaceholder")}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="material-card-muted p-3">
                <p className="text-xs font-bold uppercase text-muted">{t("measurements.areaEstimate")}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {t("common.areaValue", { value: calculateArea(draft).toFixed(2) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveEditedOpening()}
                disabled={!isEditable || isSaving}
                className="material-button-filled min-h-12 w-full sm:w-auto"
              >
                {isSaving ? t("measurements.saving") : t("measurements.saveOpening")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 hidden justify-end gap-2 sm:flex">
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
                  {t("measurements.addRows")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewOpenings(openingRows(1, openings.length));
                    setWizardIndex(0);
                    setMobileWizardStep(0);
                  }}
                  disabled={!isEditable || isSaving}
                  className="material-button-outlined min-h-11 px-3"
                >
                  {t("measurements.clear")}
                </button>
            </div>

            <div className="mt-4 hidden overflow-hidden rounded-lg border border-material-outline-variant sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-[1720px] table-fixed divide-y divide-material-outline-variant text-left text-sm">
                  <thead className="bg-material-surface-container-lowest text-xs font-bold uppercase text-muted">
                    <tr>
                      {[
                        "Floor",
                        "Room",
                        "Opening code",
                        "Width",
                        "Length",
                        "Qty",
                        "Shape",
                        "Type",
                        "Bottom frame",
                        "Opening direction",
                        "Glass color",
                        "Solid panel height",
                        "Fixed height",
                        "Notes",
                        "Area",
                        "Actions",
                      ].map((heading) => (
                        <th key={heading} className="px-2 py-3">
                          {term(heading)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-material-outline-variant">
                    {newOpenings.map((opening, index) => (
                      <tr key={`desktop-opening-${index}`}>
                        <td className="w-32 px-2 py-2">
                          <input
                            value={opening.floor}
                            onChange={(event) =>
                              updateNewOpening(index, "floor", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          />
                        </td>
                        <td className="w-40 px-2 py-2">
                          <select
                            value={opening.room}
                            onChange={(event) =>
                              updateNewOpening(index, "room", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          >
                            <option value="">{t("measurements.selectRoom")}</option>
                            {optionLabels(roomOptions, opening.room).map((option) => (
                              <option key={option} value={option}>
                                {term(option)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="w-32 px-2 py-2">
                          <input
                            value={opening.openingCode}
                            onChange={(event) =>
                              updateNewOpening(index, "openingCode", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          />
                        </td>
                        {numberFields.map((field) => (
                          <td key={field.key} className="w-28 px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step={field.step}
                              value={opening[field.key]}
                              onChange={(event) =>
                                updateNewOpening(index, field.key, event.target.value)
                              }
                              disabled={!isEditable}
                              className="material-field h-10 px-2"
                            />
                          </td>
                        ))}
                        <td className="w-24 px-2 py-2">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={opening.quantity}
                            onChange={(event) =>
                              updateNewOpening(index, "quantity", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          />
                        </td>
                        {[
                          ["shape", t("measurements.selectShape"), shapeOptions, opening.shape],
                          [
                            "openingType",
                            t("measurements.selectType"),
                            typeOptions,
                            opening.openingType || opening.type,
                          ],
                          [
                            "bottomFrame",
                            t("measurements.selectBottomFrame"),
                            bottomFrameOptions,
                            opening.bottomFrame,
                          ],
                          [
                            "openingDirection",
                            t("measurements.selectDirection"),
                            openingDirectionOptions,
                            opening.openingDirection,
                          ],
                        ].map(([key, placeholder, options, value]) => (
                          <td key={String(key)} className="w-40 px-2 py-2">
                            <select
                              value={String(value)}
                              onChange={(event) =>
                                updateNewOpening(
                                  index,
                                  key as keyof OpeningDraft,
                                  event.target.value,
                                )
                              }
                              disabled={!isEditable}
                              className="material-field h-10 px-2"
                            >
                              <option value="">{String(placeholder)}</option>
                              {(options as string[]).map((option) => (
                                <option key={option} value={option}>
                                  {term(option)}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                        <td className="w-36 px-2 py-2">
                          <select
                            value={opening.glassColor}
                            onChange={(event) =>
                              updateNewOpening(index, "glassColor", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          >
                            <option value="">{t("measurements.selectColor")}</option>
                            {optionLabels(glassColorOptions, opening.glassColor).map((option) => (
                              <option key={option} value={option}>
                                {term(option)}
                              </option>
                            ))}
                          </select>
                        </td>
                        {measurementNumberFields.map((field) => (
                          <td key={field.key} className="w-32 px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step={field.step}
                              value={opening[field.key]}
                              onChange={(event) =>
                                updateNewOpening(index, field.key, event.target.value)
                              }
                              disabled={!isEditable}
                              className="material-field h-10 px-2"
                            />
                          </td>
                        ))}
                        <td className="w-56 px-2 py-2">
                          <input
                            value={opening.notes}
                            onChange={(event) =>
                              updateNewOpening(index, "notes", event.target.value)
                            }
                            disabled={!isEditable}
                            className="material-field h-10 px-2"
                          />
                        </td>
                        <td className="w-28 bg-material-primary-container px-2 py-2 text-sm font-bold text-material-on-primary-container">
                          {t("common.areaValue", { value: calculateArea(opening).toFixed(2) })}
                        </td>
                        <td className="w-28 px-2 py-2">
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
                            {t("common.delete")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 space-y-4 sm:hidden">
              {newOpenings.map((opening, index) => (
                <div
                  key={`new-opening-${index}`}
                  className={`material-card-muted p-3 sm:p-4 ${
                    index === wizardIndex ? "" : "hidden"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-muted">
                        {t("measurements.openingProgress", {
                          index: index + 1,
                          total: newOpenings.length,
                        })}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {opening.openingCode || t("measurements.newStructuralOpening")}
                      </p>
                    </div>
                    <span className="material-status">
                      {t("common.areaValue", { value: calculateArea(opening).toFixed(2) })}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-1">
                    {mobileWizardSteps.map((step, stepIndex) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          if (stepIndex <= mobileWizardStep) {
                            setMobileWizardStep(stepIndex);
                          }
                        }}
                        className={`min-h-10 rounded-md px-1 text-[10px] font-black ${
                          stepIndex === mobileWizardStep
                            ? "bg-material-primary text-material-on-primary"
                            : stepIndex < mobileWizardStep
                              ? "bg-material-primary-container text-material-on-primary-container"
                              : "bg-material-surface-container text-muted"
                        }`}
                      >
                        {stepIndex + 1}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase text-muted">
                    {term(mobileWizardSteps[mobileWizardStep])}
                  </p>

                  {mobileWizardStep === 0 ? (
                    <div className="mt-4 grid gap-3">
                      {textFields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="material-label">
                            {term(field.label)}
                            {field.required ? " *" : ""}
                          </span>
                          <input
                            value={String(opening[field.key])}
                            onChange={(event) =>
                              updateNewOpening(index, field.key, event.target.value)
                            }
                            placeholder={term(field.placeholder)}
                            disabled={!isEditable}
                            className="material-field mt-2 min-h-12"
                          />
                        </label>
                      ))}

                      <label className="block">
                        <span className="material-label">{term("Room")} *</span>
                        <select
                          value={opening.room}
                          onChange={(event) =>
                            updateNewOpening(index, "room", event.target.value)
                          }
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-12"
                        >
                          <option value="">{t("measurements.selectRoom")}</option>
                          {optionLabels(roomOptions, opening.room).map((option) => (
                            <option key={option} value={option}>
                              {term(option)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {mobileWizardStep === 1 ? (
                    <div className="mt-4 grid gap-3">
                      {numberFields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="material-label">{term(field.label)}</span>
                          <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container-low">
                            <input
                              type="number"
                              min="0"
                              inputMode="decimal"
                              step={field.step}
                              value={opening[field.key]}
                              onChange={(event) =>
                                updateNewOpening(index, field.key, event.target.value)
                              }
                              disabled={!isEditable}
                              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                            />
                            <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                              {term(field.suffix)}
                            </span>
                          </div>
                        </label>
                      ))}

                      <label className="block">
                        <span className="material-label">{term("Quantity")}</span>
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          step="1"
                          value={opening.quantity}
                          onChange={(event) =>
                            updateNewOpening(index, "quantity", event.target.value)
                          }
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-12"
                        />
                      </label>

                      {measurementNumberFields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="material-label">{term(field.label)}</span>
                          <div className="mt-2 flex min-h-12 overflow-hidden rounded-md border border-material-outline-variant bg-material-surface-container-low">
                            <input
                              type="number"
                              min="0"
                              max={opening.height}
                              inputMode="decimal"
                              step={field.step}
                              value={opening[field.key]}
                              onChange={(event) =>
                                updateNewOpening(index, field.key, event.target.value)
                              }
                              disabled={!isEditable}
                              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-foreground outline-none disabled:text-muted"
                            />
                            <span className="flex w-14 items-center justify-center border-l border-material-outline-variant text-xs font-bold text-muted">
                              {term(field.suffix)}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {mobileWizardStep === 2 ? (
                    <div className="mt-4 grid gap-3">
                      <label className="block">
                        <span className="material-label">{term("Shape")} *</span>
                        <select
                          value={opening.shape}
                          onChange={(event) =>
                            updateNewOpening(index, "shape", event.target.value)
                          }
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-12"
                        >
                          <option value="">{t("measurements.selectShape")}</option>
                          {shapeOptions.map((option) => (
                            <option key={option} value={option}>
                              {term(option)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {[
                        ["openingType", `${term("Type")} *`, t("measurements.selectType"), typeOptions, opening.openingType || opening.type],
                        ["bottomFrame", `${term("Bottom frame")} *`, t("measurements.selectBottomFrame"), bottomFrameOptions, opening.bottomFrame],
                        ["openingDirection", `${term("Opening direction")} *`, t("measurements.selectDirection"), openingDirectionOptions, opening.openingDirection],
                      ].map(([key, label, placeholder, options, value]) => (
                        <label key={String(key)} className="block">
                          <span className="material-label">{String(label)}</span>
                          <select
                            value={String(value)}
                            onChange={(event) =>
                              updateNewOpening(
                                index,
                                key as keyof OpeningDraft,
                                event.target.value,
                              )
                            }
                            disabled={!isEditable}
                            className="material-field mt-2 min-h-12"
                          >
                            <option value="">{String(placeholder)}</option>
                            {(options as string[]).map((option) => (
                              <option key={option} value={option}>
                                {term(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}

                      <label className="block">
                        <span className="material-label">{term("Glass color")} *</span>
                        <select
                          value={opening.glassColor}
                          onChange={(event) =>
                            updateNewOpening(index, "glassColor", event.target.value)
                          }
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-12"
                        >
                          <option value="">{t("measurements.selectColor")}</option>
                          {optionLabels(glassColorOptions, opening.glassColor).map((option) => (
                            <option key={option} value={option}>
                              {term(option)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {mobileWizardStep === 3 ? (
                    <div className="mt-4 grid gap-3">
                      <div className="material-card p-3 shadow-none">
                        <p className="text-xs font-bold uppercase text-muted">{term("Review")}</p>
                        <p className="mt-2 text-sm font-bold text-foreground">
                          {[opening.openingCode, opening.floor, opening.room]
                            .filter(Boolean)
                            .join(" - ") || t("measurements.openingDetails")}
                        </p>
                        <p className="mt-1 text-sm text-muted-strong">
                          {t("measurements.dimensionSummary", {
                            width: opening.width,
                            height: opening.height,
                            quantity: opening.quantity,
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-strong">
                          {[opening.shape, opening.openingType || opening.type, opening.glassColor]
                            .filter(Boolean)
                            .map((value) => term(value))
                            .join(" - ") || t("measurements.specificationsIncomplete")}
                        </p>
                        <p className="mt-2 text-xl font-bold text-foreground">
                          {t("common.areaValue", { value: calculateArea(opening).toFixed(2) })}
                        </p>
                      </div>

                      <label className="block">
                        <span className="material-label">{t("measurements.siteNotes")}</span>
                        <textarea
                          value={opening.notes}
                          onChange={(event) =>
                            updateNewOpening(index, "notes", event.target.value)
                          }
                          rows={3}
                          disabled={!isEditable}
                          className="material-field mt-2 min-h-24 py-3"
                          placeholder={t("measurements.siteNotesPlaceholder")}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={
                        mobileWizardStep === 0
                          ? () => setWizardIndex((currentIndex) => Math.max(currentIndex - 1, 0))
                          : goToPreviousMobileStep
                      }
                      disabled={(mobileWizardStep === 0 && wizardIndex === 0) || isSaving}
                      className="material-button-outlined min-h-11"
                    >
                      {t("common.back")}
                    </button>
                    {mobileWizardStep < mobileWizardSteps.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => goToNextMobileStep(opening)}
                        disabled={!isEditable || isSaving}
                        className="material-button-tonal min-h-11"
                      >
                        {t("measurements.next")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void saveNewOpenings()}
                        disabled={!isEditable || isSaving}
                        className="material-button-filled min-h-11"
                      >
                        {isSaving ? t("measurements.saving") : t("measurements.saveOpening")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void saveNewOpenings()}
              disabled={!isEditable || isSaving}
              className="material-button-filled mt-4 hidden min-h-12 w-full sm:block"
            >
              {isSaving ? t("measurements.saving") : t("measurements.saveStructuralOpenings")}
            </button>
          </>
        )}

        {!isEditable ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            {t("measurements.startBeforeEntering")}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">{t("measurements.savedOpenings")}</h2>
          <span className="material-status">{t("measurements.totalOpenings", { count: openings.length })}</span>
        </div>

        {openings.length ? (
          openings.map((opening, index) => (
            <article key={opening.id} className="material-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-muted">
                    {t("measurements.openingNumber", { index: index + 1 })}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-foreground">
                    {opening.openingCode}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-muted-strong">
                    {[opening.floor, opening.room].filter(Boolean).join(" - ") ||
                      t("measurements.locationNotAdded")}
                  </p>
                </div>
                <span className="material-status">
                  {t("common.areaValue", { value: calculateArea(opening).toFixed(2) })}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Width")}</p>
                  <p className="text-sm font-bold text-foreground">{t("common.cmValue", { value: opening.width })}</p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Length")}</p>
                  <p className="text-sm font-bold text-foreground">{t("common.cmValue", { value: opening.height })}</p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Solid panel height")}</p>
                  <p className="text-sm font-bold text-foreground">
                    {t("common.cmValue", { value: opening.solidPanelHeight })}
                  </p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Fixed height")}</p>
                  <p className="text-sm font-bold text-foreground">{t("common.cmValue", { value: opening.fixedHeight })}</p>
                </div>
              </div>

              <div className="mt-3 text-sm font-semibold text-muted-strong">
                <p>{opening.shape ? term(opening.shape) : t("measurements.shapeNotAdded")}</p>
                <p>{opening.openingType || opening.type ? term(opening.openingType || opening.type) : t("measurements.typeNotAdded")}</p>
                <p>{opening.bottomFrame ? term(opening.bottomFrame) : t("measurements.bottomFrameNotAdded")}</p>
                <p>{opening.openingDirection ? term(opening.openingDirection) : t("measurements.openingDirectionNotAdded")}</p>
                <p>{opening.glassColor ? term(opening.glassColor) : t("measurements.glassColorNotAdded")}</p>
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
                  {t("common.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteOpening(opening.id)}
                  disabled={!isEditable || isSaving}
                  className="material-button-danger"
                >
                  {t("common.delete")}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="material-card-muted p-5 text-center">
            <p className="text-sm font-bold text-foreground">
              {t("measurements.noSavedOpenings")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("measurements.noSavedOpeningsDescription")}
            </p>
          </div>
        )}
      </section>

      {editingId ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-material-outline-variant bg-material-surface-container-low p-3 shadow-[var(--md-elevation-2)] sm:hidden">
          <button
            type="button"
            onClick={() => void saveEditedOpening()}
            disabled={!isEditable || isSaving}
            className="material-button-filled min-h-12 w-full"
          >
            {isSaving ? t("measurements.saving") : t("measurements.saveOpening")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
