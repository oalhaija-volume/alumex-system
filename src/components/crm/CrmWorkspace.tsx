"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Person = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type Activity = {
  id: string;
  method: string;
  client_response: string | null;
  internal_notes: string | null;
  outcome: string | null;
  client_answered: boolean | null;
  next_follow_up_at: string | null;
  task_completed: boolean;
  performed_at: string;
};

type CrmTask = {
  id: string;
  task_type: "structure_readiness" | "quotation";
  status: "open" | "completed" | "cancelled";
  due_at: string;
  completion_outcome: string | null;
  isMine: boolean;
  project: {
    id: string;
    project_number: string;
    project_name: string;
    address: string | null;
    sales_status: string;
    priority: string;
  } | null;
  client: {
    id: string;
    client_name: string;
    mobile: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
  owner: Person | null;
  assignee: Person | null;
  activities: Activity[];
};

type Notification = {
  id: string;
  notification_kind: "information" | "action_required" | "overdue";
  title_key: string;
  message_key: string;
  link_path: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
};

type CrmPayload = {
  currentUserId: string;
  role: string;
  tasks: CrmTask[];
  notifications: Notification[];
  availableProjects: Array<{
    id: string;
    project_number: string;
    project_name: string;
    sales_status: string;
  }>;
  assignees: Person[];
  error?: string;
};

type TaskFilter = "today" | "overdue" | "upcoming" | "completed";

const activityMethods = [
  "phone_call",
  "whatsapp",
  "showroom_meeting",
  "site_meeting",
  "email",
  "quotation_sent",
  "quotation_printed",
  "client_visit",
  "internal_note",
  "other",
] as const;

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function personName(person: Person | null) {
  return person?.full_name?.trim() || person?.email || "Unassigned";
}

function notificationTitle(notification: Notification) {
  if (notification.title_key.endsWith("followUpAssigned")) {
    return "Follow-up assigned";
  }
  if (notification.title_key.endsWith("followUpRescheduled")) {
    return "Follow-up rescheduled";
  }
  if (notification.title_key.endsWith("followUpOverdue")) {
    return "Follow-up overdue";
  }
  return "Sales notification";
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function taskMatchesFilter(task: CrmTask, filter: TaskFilter) {
  if (filter === "completed") return task.status === "completed";
  if (task.status !== "open") return false;
  const dueAt = new Date(task.due_at);
  if (filter === "overdue") return dueAt < startOfToday();
  if (filter === "today") {
    return dueAt >= startOfToday() && dueAt <= endOfToday();
  }
  return dueAt > endOfToday();
}

function dueLabel(task: CrmTask) {
  const dueAt = new Date(task.due_at);
  if (task.status === "completed") return "Completed";
  if (dueAt < new Date()) return `Overdue · ${dueAt.toLocaleString()}`;
  return dueAt.toLocaleString();
}

export function CrmWorkspace({
  projectId,
  embedded = false,
}: {
  projectId?: string;
  embedded?: boolean;
}) {
  const [payload, setPayload] = useState<CrmPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("today");
  const [showTeam, setShowTeam] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newProjectId, setNewProjectId] = useState(projectId ?? "");
  const [newTaskType, setNewTaskType] =
    useState<CrmTask["task_type"]>("structure_readiness");
  const [newDueAt, setNewDueAt] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [method, setMethod] =
    useState<(typeof activityMethods)[number]>("phone_call");
  const [clientAnswered, setClientAnswered] = useState<boolean | null>(null);
  const [clientResponse, setClientResponse] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadCrm = useCallback(async () => {
    const query = projectId
      ? `?projectId=${encodeURIComponent(projectId)}`
      : "";
    const response = await fetch(`/api/crm${query}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | CrmPayload
      | null;
    if (!response.ok || !body) {
      throw new Error(body?.error ?? "Unable to load sales follow-ups.");
    }
    setPayload(body);
    const requestedTaskId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("taskId")
        : null;
    setSelectedId((current) => {
      if (requestedTaskId && body.tasks.some((task) => task.id === requestedTaskId)) {
        return requestedTaskId;
      }
      return current && body.tasks.some((task) => task.id === current)
        ? current
        : body.tasks[0]?.id ?? "";
    });
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCrm().catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load sales follow-ups.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCrm]);

  const counts = useMemo(() => {
    if (!payload) return { today: 0, overdue: 0, upcoming: 0, completed: 0 };
    return {
      today: payload.tasks.filter(
        (task) => task.isMine && taskMatchesFilter(task, "today"),
      ).length,
      overdue: payload.tasks.filter(
        (task) => task.isMine && taskMatchesFilter(task, "overdue"),
      ).length,
      upcoming: payload.tasks.filter(
        (task) => task.isMine && taskMatchesFilter(task, "upcoming"),
      ).length,
      completed: payload.tasks.filter(
        (task) => task.isMine && taskMatchesFilter(task, "completed"),
      ).length,
    };
  }, [payload]);

  const visibleTasks = useMemo(
    () =>
      (payload?.tasks ?? []).filter(
        (task) =>
          (showTeam ? !task.isMine : task.isMine) &&
          taskMatchesFilter(task, filter),
      ),
    [filter, payload, showTeam],
  );
  const selected =
    payload?.tasks.find((task) => task.id === selectedId) ??
    visibleTasks[0] ??
    null;
  const unreadNotifications =
    payload?.notifications.filter((notification) => !notification.read_at) ?? [];
  const completeProjectTimeline = useMemo(
    () =>
      (payload?.tasks ?? [])
        .flatMap((task) =>
          task.activities.map((activity) => ({
            ...activity,
            taskType: task.task_type,
          })),
        )
        .toSorted(
          (left, right) =>
            Date.parse(right.performed_at) - Date.parse(left.performed_at),
        ),
    [payload],
  );

  async function createTask() {
    if (!newProjectId || !newDueAt) {
      setError("Select a project and due date.");
      return;
    }
    const saved = await submit({
      action: "create_task",
      projectId: newProjectId,
      taskType: newTaskType,
      dueAt: newDueAt,
      assignedTo: newAssignee || null,
    });
    if (!saved) return;
    setShowNewTask(false);
    setNewDueAt("");
    setMessage("Follow-up task created.");
  }

  async function recordActivity(completeTask = false) {
    if (!selected) return;
    if (!clientResponse.trim() && !internalNotes.trim() && !outcome.trim()) {
      setError("Add a response, outcome, or internal note.");
      return;
    }
    const saved = await submit({
      action: "record_activity",
      taskId: selected.id,
      method,
      clientAnswered,
      clientResponse,
      internalNotes,
      outcome,
      nextDueAt: nextDueAt || null,
      completeTask,
    });
    if (!saved) return;
    setClientAnswered(null);
    setClientResponse("");
    setInternalNotes("");
    setOutcome("");
    setNextDueAt("");
    setMessage(
      nextDueAt
        ? "Activity saved and the next follow-up was scheduled."
        : completeTask
          ? "Activity saved and task completed."
          : "Activity saved.",
    );
  }

  async function claimTask() {
    if (!selected) return;
    const saved = await submit({
      action: "claim_task",
      taskId: selected.id,
    });
    if (!saved) return;
    setShowTeam(false);
    setMessage(
      "Follow-up assigned to you. The original project owner is unchanged.",
    );
  }

  async function submit(body: Record<string, unknown>) {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to save the CRM update.");
      }
      await loadCrm();
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the CRM update.",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function markNotificationsRead(all: boolean, notificationId?: string) {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all, notificationId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to update notifications.");
      }
      await loadCrm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update notifications.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!payload) {
    return error ? (
      <div className="material-alert-error">{error}</div>
    ) : (
      <div className="material-card p-5 text-sm font-bold">
        Loading sales follow-ups…
      </div>
    );
  }

  const filterButtons: TaskFilter[] = [
    "today",
    "overdue",
    "upcoming",
    "completed",
  ];

  return (
    <div className={embedded ? "space-y-4" : "space-y-5"}>
      {!embedded ? (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Sales follow-ups
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Prioritize your client actions, record every contact, and keep the
              next commitment visible.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewTask((current) => !current)}
            className="material-button-filled min-h-12"
          >
            {showNewTask ? "Close" : "New follow-up"}
          </button>
        </header>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Follow-up history
            </h2>
            <p className="mt-1 text-sm text-muted">
              Chronological client contact and next actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewTask((current) => !current)}
            className="material-button-tonal min-h-11"
          >
            New follow-up
          </button>
        </div>
      )}

      {message ? <div className="material-alert-success">{message}</div> : null}
      {error ? <div className="material-alert-error">{error}</div> : null}

      {showNewTask ? (
        <section className="material-card p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block xl:col-span-2">
              <span className="material-label">Project *</span>
              <select
                value={newProjectId}
                onChange={(event) => setNewProjectId(event.target.value)}
                disabled={Boolean(projectId)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">Select project</option>
                {payload.availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} · {project.project_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="material-label">Type</span>
              <select
                value={newTaskType}
                onChange={(event) =>
                  setNewTaskType(
                    event.target.value as CrmTask["task_type"],
                  )
                }
                className="material-field mt-2 min-h-12"
              >
                <option value="structure_readiness">
                  Structure readiness
                </option>
                <option value="quotation">Quotation</option>
              </select>
            </label>
            <label className="block">
              <span className="material-label">Due date *</span>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(event) => setNewDueAt(event.target.value)}
                className="material-field mt-2 min-h-12"
              />
            </label>
            <label className="block">
              <span className="material-label">Assignee</span>
              <select
                value={newAssignee}
                onChange={(event) => setNewAssignee(event.target.value)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">Assign to me</option>
                {payload.assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personName(person)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void createTask()}
              disabled={isSaving || !newProjectId || !newDueAt}
              className="material-button-filled min-h-11"
            >
              {isSaving ? "Saving…" : "Create follow-up"}
            </button>
          </div>
        </section>
      ) : null}

      {!embedded ? (
        <details className="material-card overflow-hidden 2xl:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <span className="font-bold text-foreground">Notifications</span>
            <span className="material-status">
              {unreadNotifications.length} unread
            </span>
          </summary>
          <div className="border-t border-material-outline-variant">
            {unreadNotifications.length ? (
              <>
                <div className="flex justify-end p-3">
                  <button
                    type="button"
                    onClick={() => void markNotificationsRead(true)}
                    className="text-xs font-bold text-material-primary"
                  >
                    Mark all read
                  </button>
                </div>
                {unreadNotifications.slice(0, 8).map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      void markNotificationsRead(false, notification.id)
                    }
                    className="block w-full border-t border-material-outline-variant bg-material-primary-container p-4 text-left"
                  >
                    <p className="text-sm font-bold text-foreground">
                      {notificationTitle(notification)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </button>
                ))}
              </>
            ) : (
              <p className="border-t border-material-outline-variant p-4 text-sm text-muted">
                No unread notifications.
              </p>
            )}
          </div>
        </details>
      ) : null}

      {embedded ? (
        <section className="material-card p-4 sm:p-5">
          <h3 className="font-bold text-foreground">
            Complete activity timeline
          </h3>
          <div className="mt-3 divide-y divide-material-outline-variant">
            {completeProjectTimeline.length ? (
              completeProjectTimeline.map((activity) => (
                <article
                  key={activity.id}
                  className="grid gap-2 py-3 sm:grid-cols-[170px_180px_minmax(0,1fr)]"
                >
                  <time className="text-xs font-semibold text-muted">
                    {new Date(activity.performed_at).toLocaleString()}
                  </time>
                  <p className="text-sm font-bold text-foreground">
                    {label(activity.method)} · {label(activity.taskType)}
                  </p>
                  <p className="text-sm text-muted-strong">
                    {activity.client_response ||
                      activity.internal_notes ||
                      activity.outcome}
                  </p>
                </article>
              ))
            ) : (
              <p className="py-3 text-sm text-muted">
                No follow-up activity has been recorded for this project.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <div
        className={
          embedded
            ? "grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
            : "grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)_280px]"
        }
      >
        <section className="material-card min-w-0 overflow-hidden">
          <div className="border-b border-material-outline-variant p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-foreground">
                {showTeam ? "Team support" : "My tasks"}
              </h2>
              {!embedded ? (
                <button
                  type="button"
                  onClick={() => setShowTeam((current) => !current)}
                  className="text-xs font-bold text-material-primary"
                >
                  {showTeam ? "My tasks" : "Team support"}
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {filterButtons.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold ${
                    filter === item
                      ? "border-material-primary bg-material-primary text-material-on-primary"
                      : "border-material-outline-variant bg-material-surface-container-lowest text-muted-strong"
                  }`}
                >
                  {label(item)}
                  {!showTeam ? ` ${counts[item]}` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[680px] divide-y divide-material-outline-variant overflow-y-auto">
            {visibleTasks.length ? (
              visibleTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedId(task.id)}
                  className={`w-full p-4 text-left transition ${
                    selected?.id === task.id
                      ? "bg-material-primary-container"
                      : "hover:bg-material-surface-container-lowest"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold ${
                          new Date(task.due_at) < new Date() &&
                          task.status === "open"
                            ? "text-red-700"
                            : "text-muted"
                        }`}
                      >
                        {dueLabel(task)}
                      </p>
                      <p className="mt-1 truncate font-bold text-foreground">
                        {task.client?.client_name ?? "Unknown client"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {task.project?.project_name ?? "Unknown project"}
                      </p>
                    </div>
                    <span className="material-status shrink-0">
                      {label(task.task_type)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted">
                    {personName(task.assignee)} ·{" "}
                    {label(task.project?.priority ?? "normal")}
                  </p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="font-bold text-foreground">No tasks here</p>
                <p className="mt-1 text-sm text-muted">
                  Change the filter or create a follow-up.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="material-card min-w-0 p-4 sm:p-5">
          {!selected ? (
            <div className="py-16 text-center text-sm text-muted">
              Select a task to view its activity history.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-muted">
                    {selected.project?.project_number}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-foreground">
                    {selected.client?.client_name}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {selected.project?.project_name}
                  </p>
                </div>
                <span className="material-status self-start">
                  {label(selected.task_type)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Due", dueLabel(selected)],
                  ["Stage", label(selected.project?.sales_status ?? "")],
                  ["Responsible", personName(selected.assignee)],
                  [
                    "Previous outcome",
                    selected.activities[0]?.outcome ||
                      selected.completion_outcome ||
                      "No previous outcome",
                  ],
                ].map(([title, value]) => (
                  <div key={title} className="border-b border-material-outline-variant pb-3">
                    <p className="text-xs font-bold uppercase text-muted">
                      {title}
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.client?.mobile ? (
                  <a
                    href={`tel:${selected.client.mobile}`}
                    className="material-button-tonal min-h-11"
                  >
                    Call client
                  </a>
                ) : null}
                {selected.client?.whatsapp ? (
                  <a
                    href={`https://wa.me/${selected.client.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="material-button-outlined min-h-11"
                  >
                    WhatsApp
                  </a>
                ) : null}
                {selected.project ? (
                  <Link
                    href={`/projects/${selected.project.id}`}
                    className="material-button-outlined min-h-11"
                  >
                    Open project
                  </Link>
                ) : null}
                {selected.status === "open" &&
                !selected.isMine &&
                !selected.assignee ? (
                  <button
                    type="button"
                    onClick={() => void claimTask()}
                    disabled={isSaving}
                    className="material-button-filled min-h-11"
                  >
                    {isSaving ? "Assigning…" : "Take follow-up"}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
                <div>
                  <h3 className="font-bold text-foreground">
                    Activity history
                  </h3>
                  <div className="mt-3 border-l-2 border-material-outline-variant pl-4">
                    {selected.activities.length ? (
                      selected.activities.map((activity) => (
                        <article
                          key={activity.id}
                          className="relative border-b border-material-outline-variant py-4 first:pt-0"
                        >
                          <span className="absolute -left-[21px] top-5 h-2.5 w-2.5 rounded-full bg-material-primary first:top-1" />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold text-foreground">
                              {label(activity.method)}
                            </p>
                            <time className="text-xs text-muted">
                              {new Date(
                                activity.performed_at,
                              ).toLocaleString()}
                            </time>
                          </div>
                          <p className="mt-2 text-sm text-muted-strong">
                            {activity.client_response ||
                              activity.internal_notes ||
                              activity.outcome}
                          </p>
                          {activity.next_follow_up_at ? (
                            <p className="mt-2 text-xs font-bold text-material-primary">
                              Next follow-up:{" "}
                              {new Date(
                                activity.next_follow_up_at,
                              ).toLocaleString()}
                            </p>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="py-4 text-sm text-muted">
                        No activity has been recorded yet.
                      </p>
                    )}
                  </div>
                </div>

                {selected.status === "open" && selected.isMine ? (
                  <div className="rounded-lg border border-material-outline-variant p-4">
                    <h3 className="font-bold text-foreground">Log activity</h3>
                    <div className="mt-3 space-y-3">
                      <label className="block">
                        <span className="material-label">Method</span>
                        <select
                          value={method}
                          onChange={(event) =>
                            setMethod(
                              event.target
                                .value as (typeof activityMethods)[number],
                            )
                          }
                          className="material-field mt-2 min-h-11"
                        >
                          {activityMethods.map((item) => (
                            <option key={item} value={item}>
                              {label(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset>
                        <legend className="material-label">
                          Client answered?
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[true, false].map((value) => (
                            <button
                              key={String(value)}
                              type="button"
                              onClick={() => setClientAnswered(value)}
                              className={`min-h-10 rounded-md border text-sm font-bold ${
                                clientAnswered === value
                                  ? "border-material-primary bg-material-primary-container text-material-on-primary-container"
                                  : "border-material-outline-variant text-muted-strong"
                              }`}
                            >
                              {value ? "Yes" : "No"}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <label className="block">
                        <span className="material-label">
                          Response / outcome
                        </span>
                        <input
                          value={clientResponse}
                          onChange={(event) =>
                            setClientResponse(event.target.value)
                          }
                          className="material-field mt-2 min-h-11"
                          placeholder="What did the client say?"
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">Internal notes</span>
                        <textarea
                          value={internalNotes}
                          onChange={(event) =>
                            setInternalNotes(event.target.value)
                          }
                          rows={3}
                          className="material-field mt-2 min-h-20 py-3"
                          placeholder="Private context for the sales team…"
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">Outcome</span>
                        <input
                          value={outcome}
                          onChange={(event) => setOutcome(event.target.value)}
                          className="material-field mt-2 min-h-11"
                          placeholder="Interested, postponed, no answer…"
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">
                          Next follow-up
                        </span>
                        <input
                          type="datetime-local"
                          value={nextDueAt}
                          onChange={(event) => setNextDueAt(event.target.value)}
                          className="material-field mt-2 min-h-11"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void recordActivity(false)}
                        disabled={isSaving}
                        className="material-button-filled min-h-11 w-full"
                      >
                        {isSaving ? "Saving…" : "Save activity"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void recordActivity(true)}
                        disabled={isSaving}
                        className="material-button-outlined min-h-11 w-full"
                      >
                        Mark complete
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {!embedded ? (
          <aside className="material-card hidden min-w-0 overflow-hidden 2xl:block">
            <div className="flex items-center justify-between gap-2 border-b border-material-outline-variant p-4">
              <div>
                <h2 className="font-bold text-foreground">Notifications</h2>
                <p className="mt-1 text-xs text-muted">
                  {unreadNotifications.length} unread
                </p>
              </div>
              {unreadNotifications.length ? (
                <button
                  type="button"
                  onClick={() => void markNotificationsRead(true)}
                  disabled={isSaving}
                  className="text-xs font-bold text-material-primary"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-[680px] divide-y divide-material-outline-variant overflow-y-auto">
              {payload.notifications.length ? (
                payload.notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      notification.read_at
                        ? undefined
                        : void markNotificationsRead(false, notification.id)
                    }
                    className={`w-full p-4 text-left ${
                      notification.read_at
                        ? "bg-material-surface-container-lowest"
                        : "bg-material-primary-container"
                    }`}
                  >
                    <p className="text-xs font-bold uppercase text-muted">
                      {label(notification.notification_kind)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {notificationTitle(notification)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </button>
                ))
              ) : (
                <p className="p-5 text-sm text-muted">
                  No internal notifications.
                </p>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
