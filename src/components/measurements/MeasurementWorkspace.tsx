"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Person = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type MeasurementQueueItem = {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  address: string;
  clientName: string;
  clientMobile: string;
  projectStatus: string;
  status: string;
  instructions: string;
  preferredAt: string | null;
  requestedAt: string;
  updatedAt: string;
  assignedTo: Person | null;
  returnTo: Person | null;
  submission: {
    id: string;
    version: number;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
    review_note: string | null;
  } | null;
  openingCount: number;
};

type AvailableProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  address: string;
  clientName: string;
};

type WorkspacePayload = {
  role: string;
  currentUserId: string;
  queue: MeasurementQueueItem[];
  availableProjects: AvailableProject[];
  assignees: Person[];
  error?: string;
};

const fieldStatuses = new Set([
  "assigned",
  "appointment_scheduled",
  "employee_en_route",
  "in_progress",
  "draft_saved",
  "correction_required",
]);
const reviewStatuses = new Set(["submitted", "under_review"]);

function friendlyStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function personName(person: Person | null) {
  return person?.full_name?.trim() || person?.email || "Unassigned";
}

export function MeasurementWorkspace() {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [queueAssignee, setQueueAssignee] = useState("");
  const [queueVisitAt, setQueueVisitAt] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadWorkspace = useCallback(async () => {
    const response = await fetch("/api/measurements", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | WorkspacePayload
      | null;
    if (!response.ok || !body) {
      throw new Error(body?.error ?? "Unable to load measurement work.");
    }
    setPayload(body);
    setSelectedId((current) =>
      current && body.queue.some((item) => item.id === current)
        ? current
        : body.queue[0]?.id ?? "",
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace()
        .catch((loadError) =>
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load measurement work.",
          ),
        )
        .finally(() => setIsLoading(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  const selected = useMemo(
    () => payload?.queue.find((item) => item.id === selectedId) ?? null,
    [payload, selectedId],
  );
  const canRequest =
    payload?.role === "Admin" ||
    payload?.role === "Sales Manager" ||
    payload?.role === "Indoor Sales";
  const canReview = canRequest;
  const fieldQueue = payload?.queue.filter((item) =>
    fieldStatuses.has(item.status),
  );
  const reviewQueue = payload?.queue.filter((item) =>
    reviewStatuses.has(item.status),
  );

  async function createRequest() {
    if (!projectId) {
      setError("Select a project.");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          assignedTo: assignedTo || null,
          preferredAt: preferredAt || null,
          instructions,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to create the request.");
      }
      setProjectId("");
      setAssignedTo("");
      setPreferredAt("");
      setInstructions("");
      await loadWorkspace();
      setMessage("Measurement request created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create the request.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(
    requestId: string,
    action: "begin_review" | "return" | "approve",
  ) {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/measurements/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: reviewNote }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to update this submission.");
      }
      setReviewNote("");
      await loadWorkspace();
      setMessage(
        action === "approve"
          ? "Measurements approved and ready for quotation."
          : action === "return"
            ? "Measurements returned for correction."
            : "Review started.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update this submission.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function assignSelectedRequest() {
    if (!selected || !queueAssignee) {
      setError("Select a field assignee.");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/measurements/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          assignedTo: queueAssignee,
          preferredAt: queueVisitAt || null,
          note: reviewNote,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to assign this request.");
      }
      setQueueAssignee("");
      setQueueVisitAt("");
      setReviewNote("");
      await loadWorkspace();
      setMessage("Measurement request assigned.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to assign this request.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="material-card p-5 text-sm font-bold">Loading measurements…</div>;
  }

  if (!payload) {
    return <div className="material-alert-error">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-material-primary">
            Sales workflow · Phase 4
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            Measurements
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Request, capture, submit, and review site measurements with a clear
            handoff between Indoor and Outdoor Sales.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="material-status">
            {fieldQueue?.length ?? 0} field
          </span>
          <span className="material-status">
            {reviewQueue?.length ?? 0} review
          </span>
        </div>
      </header>

      {message ? <div className="material-alert-success">{message}</div> : null}
      {error ? <div className="material-alert-error">{error}</div> : null}

      {canRequest ? (
        <section className="material-card p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                New measurement request
              </h2>
              <p className="text-sm text-muted">
                Assign now, or leave unassigned for the sales manager.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block xl:col-span-2">
              <span className="material-label">Project *</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">Select a project</option>
                {payload.availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectNumber} · {project.projectName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="material-label">Field assignee</span>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">Leave unassigned</option>
                {payload.assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personName(person)} · {person.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="material-label">Preferred visit</span>
              <input
                type="datetime-local"
                value={preferredAt}
                onChange={(event) => setPreferredAt(event.target.value)}
                className="material-field mt-2 min-h-12"
              />
            </label>
            <label className="block md:col-span-2 xl:col-span-3">
              <span className="material-label">Site instructions</span>
              <input
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Access notes, client availability, measurement scope…"
                className="material-field mt-2 min-h-12"
              />
            </label>
            <button
              type="button"
              onClick={() => void createRequest()}
              disabled={isSaving || !projectId}
              className="material-button-filled min-h-12 self-end"
            >
              {isSaving ? "Saving…" : "Create request"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="material-card overflow-hidden">
          <div className="border-b border-material-outline-variant p-4">
            <h2 className="font-bold text-foreground">Measurement queue</h2>
            <p className="mt-1 text-sm text-muted">
              {payload.queue.length} request{payload.queue.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="divide-y divide-material-outline-variant">
            {payload.queue.length === 0 ? (
              <div className="p-6 text-center">
                <p className="font-bold text-foreground">Queue is clear</p>
                <p className="mt-1 text-sm text-muted">
                  New measurement requests will appear here.
                </p>
              </div>
            ) : (
              payload.queue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full p-4 text-left transition ${
                    selectedId === item.id
                      ? "bg-material-primary-container"
                      : "hover:bg-material-surface-container-lowest"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-muted">
                        {item.projectNumber}
                      </p>
                      <p className="mt-1 truncate font-bold text-foreground">
                        {item.projectName}
                      </p>
                    </div>
                    <span className="material-status shrink-0">
                      {friendlyStatus(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm text-muted">
                    {item.clientName || "Client not added"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-muted">
                    {item.openingCount} openings · {personName(item.assignedTo)}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="material-card min-w-0 p-4 sm:p-5">
          {!selected ? (
            <div className="py-12 text-center text-sm text-muted">
              Select a measurement request to view it.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-muted">
                    {selected.projectNumber}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-foreground">
                    {selected.projectName}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {selected.clientName || "Client not added"}
                    {selected.clientMobile ? ` · ${selected.clientMobile}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {selected.address || "Site address not added"}
                  </p>
                </div>
                <span className="material-status self-start">
                  {friendlyStatus(selected.status)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Assignee", personName(selected.assignedTo)],
                  ["Openings", String(selected.openingCount)],
                  [
                    "Version",
                    selected.submission
                      ? `v${selected.submission.version}`
                      : "Not submitted",
                  ],
                  [
                    "Visit",
                    selected.preferredAt
                      ? new Date(selected.preferredAt).toLocaleString()
                      : "Not scheduled",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="material-card-muted p-3">
                    <p className="text-xs font-bold uppercase text-muted">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {selected.instructions ? (
                <div className="rounded-lg border border-material-outline-variant p-4">
                  <p className="text-xs font-bold uppercase text-muted">
                    Site instructions
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {selected.instructions}
                  </p>
                </div>
              ) : null}

              {canRequest &&
              ["requested", "unassigned", "assigned", "appointment_scheduled", "postponed"].includes(
                selected.status,
              ) ? (
                <div className="grid gap-3 rounded-lg border border-material-outline-variant bg-material-surface-container-lowest p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                  <label className="block">
                    <span className="material-label">Field assignee *</span>
                    <select
                      value={queueAssignee}
                      onChange={(event) => setQueueAssignee(event.target.value)}
                      className="material-field mt-2 min-h-12"
                    >
                      <option value="">Select assignee</option>
                      {payload.assignees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {personName(person)} · {person.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="material-label">Visit date and time</span>
                    <input
                      type="datetime-local"
                      value={queueVisitAt}
                      onChange={(event) => setQueueVisitAt(event.target.value)}
                      className="material-field mt-2 min-h-12"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void assignSelectedRequest()}
                    disabled={isSaving || !queueAssignee}
                    className="material-button-filled min-h-12 self-end"
                  >
                    Assign visit
                  </button>
                </div>
              ) : null}

              {fieldStatuses.has(selected.status) ? (
                <div className="flex flex-col gap-3 rounded-lg border border-material-outline-variant bg-material-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-foreground">Field capture</p>
                    <p className="mt-1 text-sm text-muted">
                      Open the mobile wizard to start or continue this visit.
                    </p>
                  </div>
                  <Link
                    href={`/site-measurements/${selected.projectId}`}
                    className="material-button-filled min-h-12 shrink-0"
                  >
                    Open measurement wizard
                  </Link>
                </div>
              ) : null}

              {selected.submission ? (
                <div className="overflow-hidden rounded-lg border border-material-outline-variant">
                  <div className="grid grid-cols-2 gap-3 border-b border-material-outline-variant bg-material-surface-container-lowest p-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-muted">
                        Submission
                      </p>
                      <p className="mt-1 font-bold">v{selected.submission.version}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-muted">
                        Status
                      </p>
                      <p className="mt-1 font-bold">
                        {friendlyStatus(selected.submission.status)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-bold uppercase text-muted">
                        Submitted
                      </p>
                      <p className="mt-1 font-bold">
                        {new Date(
                          selected.submission.submitted_at,
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-bold text-foreground">
                      {selected.openingCount} structural openings submitted
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Review the captured dimensions and details in the wizard
                      before approval.
                    </p>
                  </div>
                </div>
              ) : null}

              {canReview && reviewStatuses.has(selected.status) ? (
                <div className="space-y-3 border-t border-material-outline-variant pt-5">
                  <label className="block">
                    <span className="material-label">
                      Review notes / correction reason
                    </span>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={3}
                      className="material-field mt-2 min-h-24 py-3"
                      placeholder="Explain any correction clearly for Outdoor Sales…"
                    />
                  </label>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {selected.status === "submitted" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(selected.id, "begin_review")
                        }
                        disabled={isSaving}
                        className="material-button-tonal min-h-12"
                      >
                        Start review
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void runAction(selected.id, "return")}
                      disabled={isSaving || !reviewNote.trim()}
                      className="material-button-outlined min-h-12 border-red-500 text-red-700"
                    >
                      Return for correction
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(selected.id, "approve")}
                      disabled={isSaving}
                      className="material-button-filled min-h-12"
                    >
                      Approve measurements
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
