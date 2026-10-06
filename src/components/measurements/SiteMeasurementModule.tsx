"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { isInitialOpeningValid } from "@/lib/measurements/initialOpening";
import { centimetersToSquareMeters } from "@/lib/measurements/area";
import {
  isStructuralOpeningType,
  nextStructuralOpeningCode,
} from "@/lib/measurements/structuralOpenings";

type MeasurementProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  address: string;
  workflowStatus: string;
  salesStatus: string;
  structureReadiness: string;
  measurementRequest: {
    id: string;
    status: string;
    assignedTo: string | null;
    returnTo: string | null;
    instructions: string;
    preferredAt: string | null;
  } | null;
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
  siteReadiness: "ready" | "not_ready";
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
  siteReadiness: "ready",
  width: 0,
  height: 0,
  length: 0,
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

const numberFields = [
  { key: "width", label: "Width", suffix: "cm", step: "0.01" },
  { key: "height", label: "Height", suffix: "cm", step: "0.01" },
  { key: "quantity", label: "Quantity", suffix: "", step: "1" },
] as const;

function openingToDraft(opening: MeasurementOpening): OpeningDraft {
  return {
    floor: opening.floor,
    room: opening.room,
    openingCode: opening.openingCode,
    siteReadiness: opening.siteReadiness,
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
    ...opening,
    floor: opening.floor.trim(),
    room: opening.room.trim(),
    openingCode: opening.openingCode.trim(),
    width: opening.siteReadiness === "not_ready" ? 0 : Number(opening.width),
    height: opening.siteReadiness === "not_ready" ? 0 : Number(opening.height),
    length: opening.siteReadiness === "not_ready" ? 0 : Number(opening.height),
    quantity: Number(opening.quantity),
  };
}

function hasOpeningContent(opening: OpeningDraft) {
  return Boolean(opening.width || opening.height || opening.openingCode || opening.siteReadiness === "not_ready" || opening.quantity !== 1);
}

const isOpeningValid = isInitialOpeningValid;

function openingRows(count: number) {
  return Array.from({ length: count }, () => ({ ...emptyOpening }));
}

export function SiteMeasurementModule() {
  const { t, term } = useI18n();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [project, setProject] = useState<MeasurementProject | null>(null);
  const [openings, setOpenings] = useState<MeasurementOpening[]>([]);
  const [draft, setDraft] = useState<OpeningDraft>(emptyOpening);
  const [newOpenings, setNewOpenings] = useState<OpeningDraft[]>(
    openingRows(1),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const totalArea = useMemo(
    () =>
      openings.reduce(
        (sum, opening) =>
          opening.siteReadiness === "ready"
            ? sum +
              centimetersToSquareMeters({
                width: opening.width,
                height: opening.height,
                quantity: opening.quantity,
              })
            : sum,
        0,
      ),
    [openings],
  );
  const measurementRequest = project?.measurementRequest ?? null;
  const isPartialProject = project?.structureReadiness === "partially_ready";
  const hasNotReadyOpenings =
    openings.some((opening) => opening.siteReadiness === "not_ready") ||
    newOpenings.some(
      (opening) =>
        hasOpeningContent(opening) && opening.siteReadiness === "not_ready",
    );
  const canStart = Boolean(
    measurementRequest &&
      [
        "assigned",
        "appointment_scheduled",
        "employee_en_route",
        "correction_required",
      ].includes(
        measurementRequest.status,
      ),
  );
  const isEditable = Boolean(
    measurementRequest &&
      ["in_progress", "draft_saved"].includes(measurementRequest.status),
  );
  const canComplete = Boolean(
    isEditable &&
      (openings.length > 0 || newOpenings.some(hasOpeningContent)),
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
    const localDraftKey = `alumex:measurement-draft:${projectId}`;
    const savedDraft = window.localStorage.getItem(localDraftKey);
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft) as OpeningDraft[];
        setNewOpenings(
          Array.isArray(parsedDraft) && parsedDraft.length
            ? parsedDraft.map((opening) => ({
                ...emptyOpening,
                ...opening,
                siteReadiness:
                  opening.siteReadiness === "not_ready" ? "not_ready" : "ready",
              }))
            : openingRows(1),
        );
      } catch {
        setNewOpenings(openingRows(1));
      }
    } else {
      setNewOpenings(openingRows(1));
    }
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
    if (!isEditable || !projectId) return;

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        `alumex:measurement-draft:${projectId}`,
        JSON.stringify(newOpenings),
      );
      setDraftSavedAt(new Date());
    }, 600);

    return () => window.clearTimeout(timer);
  }, [isEditable, newOpenings, projectId]);

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
      ...(key === "openingType" && isStructuralOpeningType(value)
        ? {
            type: value,
            openingCode: nextStructuralOpeningCode(
              value,
              openings
                .filter((opening) => opening.id !== editingId)
                .map((opening) => opening.openingCode),
            ),
          }
        : {}),
      ...(key === "siteReadiness" && value === "not_ready"
        ? { width: 0, height: 0, length: 0 }
        : {}),
    }));
  }

  function updateNewOpening(
    index: number,
    key: keyof OpeningDraft,
    value: string,
  ) {
    setNewOpenings((currentOpenings) => {
      const existingCodes = [
        ...openings.map((opening) => opening.openingCode),
        ...currentOpenings
          .filter((_, openingIndex) => openingIndex !== index)
          .map((opening) => opening.openingCode),
      ];

      return currentOpenings.map((opening, openingIndex) =>
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
              ...(key === "openingType" && isStructuralOpeningType(value)
                ? {
                    type: value,
                    openingCode: nextStructuralOpeningCode(value, existingCodes),
                  }
                : {}),
              ...(key === "siteReadiness" && value === "not_ready"
                ? { width: 0, height: 0, length: 0 }
                : {}),
            }
          : opening,
      );
    });
  }

  async function runMeasurementAction(
    action: "en_route" | "start" | "save_draft" | "submit",
    options?: { quiet?: boolean },
  ) {
    if (!measurementRequest) return;
    setError("");
    if (!options?.quiet) setMessage("");
    setWorkflowSaving(action);

    try {
      const response = await fetch(`/api/measurements/${measurementRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? t("measurements.workflowUpdateError"));
      }

      if (action === "submit") {
        window.localStorage.removeItem(`alumex:measurement-draft:${projectId}`);
      }
      await loadMeasurements();
      if (!options?.quiet) {
        setMessage(
          action === "start"
            ? "Measurement visit started."
            : action === "en_route"
              ? "Marked as en route to the site."
            : action === "submit"
              ? "Measurements submitted to Indoor Sales for review."
              : "Measurement draft saved.",
        );
      }
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

      setOpenings((current) => [...current, ...savedOpenings]);
      setNewOpenings(openingRows(1));
      window.localStorage.removeItem(`alumex:measurement-draft:${projectId}`);
      await runMeasurementAction("save_draft", { quiet: true });
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
      await runMeasurementAction("save_draft", { quiet: true });
      setMessage(t("measurements.openingUpdated"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("measurements.saveOpeningError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function completeMeasurements() {
    if (!measurementRequest) return;

    setError("");
    setMessage("");

    const pendingOpenings = newOpenings
      .filter(hasOpeningContent)
      .map(normalizeDraft);
    if (pendingOpenings.some((opening) => !isOpeningValid(opening))) {
      setError(t("measurements.completeRequiredDetails"));
      return;
    }
    if (openings.length === 0 && pendingOpenings.length === 0) {
      setError(t("measurements.addOpeningBeforeSaving"));
      return;
    }

    setIsSaving(true);
    setWorkflowSaving("complete");

    try {
      const savedPendingOpenings: MeasurementOpening[] = [];
      for (const opening of pendingOpenings) {
        savedPendingOpenings.push(await saveOpeningPayload(opening));
      }
      if (savedPendingOpenings.length > 0) {
        setOpenings((current) => [...current, ...savedPendingOpenings]);
        setNewOpenings(openingRows(1));
        window.localStorage.removeItem(`alumex:measurement-draft:${projectId}`);
      }

      const visitOpenings = [...openings, ...savedPendingOpenings];
      if (
        visitOpenings.some(
          (opening) => opening.siteReadiness === "not_ready",
        )
      ) {
        await runMeasurementAction("save_draft", { quiet: true });
        setMessage(t("measurements.partialVisitSaved"));
        return;
      }

      const response = await fetch(`/api/measurements/${measurementRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? t("measurements.workflowUpdateError"));
      }

      window.localStorage.removeItem(`alumex:measurement-draft:${projectId}`);
      setNewOpenings(openingRows(1));
      await loadMeasurements();
      setMessage(t("measurements.savedAndReadyForQuotation"));
    } catch (completeError) {
      await loadMeasurements().catch(() => undefined);
      setError(
        completeError instanceof Error
          ? completeError.message
          : t("measurements.workflowUpdateError"),
      );
    } finally {
      setIsSaving(false);
      setWorkflowSaving(null);
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
    setDraft(emptyOpening);
    setError("");
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
    <div className="mx-auto w-full space-y-4 pb-4">
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
            {measurementRequest
              ? measurementRequest.status
                  .split("_")
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(" ")
              : term(project.salesStatus || project.workflowStatus)}
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
          {measurementRequest &&
          ["assigned", "appointment_scheduled"].includes(
            measurementRequest.status,
          ) ? (
            <button
              type="button"
              onClick={() => void runMeasurementAction("en_route")}
              disabled={Boolean(workflowSaving)}
              className="material-button-tonal min-h-12 w-full sm:w-auto"
            >
              {workflowSaving === "en_route" ? "Updating…" : "I’m en route"}
            </button>
          ) : null}
          {canStart ? (
            <button
              type="button"
              onClick={() => void runMeasurementAction("start")}
              disabled={Boolean(workflowSaving)}
              className="material-button-filled min-h-12 w-full sm:w-auto"
            >
              {workflowSaving === "start"
                ? "Starting…"
                : "Start measurement visit"}
            </button>
          ) : null}
          {isEditable ? (
            <button
              type="button"
              onClick={() => void completeMeasurements()}
              disabled={Boolean(workflowSaving) || !canComplete}
              className="material-button-filled hidden min-h-12 w-full xl:inline-flex xl:w-auto"
            >
              {workflowSaving === "complete"
                ? t("measurements.savingAndCompleting")
                : hasNotReadyOpenings
                  ? t("measurements.savePartialVisit")
                  : t("measurements.saveAndComplete")}
            </button>
          ) : null}
          <Link
            href="/dashboard"
            className="material-button-tonal min-h-12 w-full sm:w-auto"
          >
            Back to dashboard
          </Link>
        </div>
        {isEditable ? (
          <p className="mt-3 text-xs font-semibold text-muted">
            {draftSavedAt
              ? `Draft saved on this device at ${draftSavedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Draft persistence is active on this device."}
          </p>
        ) : null}
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
            <p className="mt-1 text-sm text-muted">
              {t("measurements.structuralOnlyHelp")}
            </p>
            {isPartialProject ? (
              <p className="mt-2 text-sm font-semibold text-amber-800">
                {t("measurements.partialOpeningHelp")}
              </p>
            ) : null}
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
            <p className="text-sm font-bold">Measurement assignment received</p>
            <p className="mt-1 text-sm">
              Start the visit to unlock field capture and draft saving.
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted">{t("measurements.dimensionsOnly")}</p>
          {(editingId ? [draft] : newOpenings).map((opening, index) => (
            <div key={editingId || index} className="material-card-muted p-4">
              <p className="mb-3 text-sm font-bold">{opening.openingCode || `${term("Opening")} ${index + 1}`}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {numberFields.map(field => (
                  <label key={field.key} className="block">
                    <span className="material-label">{term(field.label)} {field.suffix} *</span>
                    <input type="number" min={field.key === "quantity" ? "1" : "0.01"} step={field.step}
                      inputMode={field.key === "quantity" ? "numeric" : "decimal"}
                      value={opening[field.key] || ""}
                      onChange={event => editingId ? updateDraft(field.key, event.target.value) : updateNewOpening(index, field.key, event.target.value)}
                      disabled={!isEditable || isSaving || (field.key !== "quantity" && opening.siteReadiness === "not_ready")}
                      className="material-field mt-2 min-h-12 w-full" />
                  </label>
                ))}
                {isPartialProject ? (
                  <label className="block">
                    <span className="material-label">{t("measurements.openingReadiness")}</span>
                    <select value={opening.siteReadiness} disabled={!isEditable || isSaving}
                      onChange={event => editingId ? updateDraft("siteReadiness", event.target.value) : updateNewOpening(index, "siteReadiness", event.target.value)} className="material-field mt-2 min-h-12">
                      <option value="ready">{t("intake.readiness.ready")}</option>
                      <option value="not_ready">{t("intake.readiness.not_ready")}</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold">{t("measurements.areaEstimate")}: {centimetersToSquareMeters(opening).toFixed(2)} m²</p>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            {!editingId ? <button type="button" onClick={() => setNewOpenings(current => [...current, ...openingRows(1)])} disabled={!isEditable || isSaving} className="material-button-outlined min-h-12">{t("measurements.addRows")}</button> : null}
            <button type="button" onClick={() => void (editingId ? saveEditedOpening() : saveNewOpenings())} disabled={!isEditable || isSaving} className="material-button-tonal min-h-12">{isSaving ? t("measurements.saving") : t("measurements.saveStructuralOpenings")}</button>
            {!editingId ? <button type="button" onClick={() => void completeMeasurements()} disabled={!canComplete || isSaving || Boolean(workflowSaving)} className="material-button-filled min-h-12 sm:col-span-2">{workflowSaving === "complete" ? t("measurements.savingAndCompleting") : hasNotReadyOpenings ? t("measurements.savePartialVisit") : t("measurements.doneSendToIndoor")}</button> : null}
          </div>
        </div>

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
                  {opening.siteReadiness === "not_ready"
                    ? t("intake.readiness.not_ready")
                    : t("common.areaValue", {
                        value: centimetersToSquareMeters(opening).toFixed(2),
                      })}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Width")}</p>
                  <p className="text-sm font-bold text-foreground">
                    {opening.siteReadiness === "not_ready"
                      ? "—"
                      : t("common.cmValue", { value: opening.width })}
                  </p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Height")}</p>
                  <p className="text-sm font-bold text-foreground">
                    {opening.siteReadiness === "not_ready"
                      ? "—"
                      : t("common.cmValue", { value: opening.height })}
                  </p>
                </div>
                <div className="material-card-muted p-2">
                  <p className="text-[11px] font-bold uppercase text-muted">{term("Type")}</p>
                  <p className="text-sm font-bold text-foreground">
                    {opening.openingType || opening.type
                      ? term(opening.openingType || opening.type)
                      : t("measurements.typeNotAdded")}
                  </p>
                </div>
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

    </div>
  );
}
