"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

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

function fallbackLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function camelCaseLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part, index) =>
      index === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

function notificationTitle(
  notification: Notification,
  t: (key: string) => string,
) {
  if (notification.title_key.endsWith("followUpAssigned")) {
    return t("crm.notifications.followUpAssigned");
  }
  if (notification.title_key.endsWith("followUpRescheduled")) {
    return t("crm.notifications.followUpRescheduled");
  }
  if (notification.title_key.endsWith("followUpOverdue")) {
    return t("crm.notifications.followUpOverdue");
  }
  return t("crm.notifications.salesNotification");
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

function dueLabel(
  task: CrmTask,
  t: (key: string, replacements?: Record<string, string | number>) => string,
  formatDateTime: (value: Date | string) => string,
) {
  const dueAt = new Date(task.due_at);
  if (task.status === "completed") return t("crm.labels.completed");
  if (dueAt < new Date()) {
    return t("crm.overdueAt", { date: formatDateTime(dueAt) });
  }
  return formatDateTime(dueAt);
}

export function CrmWorkspace({
  projectId,
  embedded = false,
}: {
  projectId?: string;
  embedded?: boolean;
}) {
  const { locale, t, term } = useI18n();
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
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );
  const formatDateTime = useCallback(
    (value: Date | string) => dateTimeFormatter.format(new Date(value)),
    [dateTimeFormatter],
  );
  const displayLabel = useCallback(
    (value: string) => {
      const key = `crm.labels.${camelCaseLabel(value)}`;
      const translated = t(key);
      if (translated !== key) return translated;
      const translatedTerm = term(value);
      return translatedTerm !== value ? translatedTerm : fallbackLabel(value);
    },
    [t, term],
  );
  const displayPersonName = useCallback(
    (person: Person | null) =>
      person?.full_name?.trim() ||
      person?.email ||
      t("crm.labels.unassigned"),
    [t],
  );

  const loadCrm = useCallback(async () => {
    const query = projectId
      ? `?projectId=${encodeURIComponent(projectId)}`
      : "";
    const response = await fetch(`/api/crm${query}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | CrmPayload
      | null;
    if (!response.ok || !body) {
      throw new Error(
        locale === "ar"
          ? t("crm.errors.load")
          : body?.error ?? t("crm.errors.load"),
      );
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
  }, [locale, projectId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCrm().catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("crm.errors.load"),
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCrm, t]);

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
      setError(t("crm.errors.projectAndDueRequired"));
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
    setMessage(t("crm.messages.taskCreated"));
  }

  async function recordActivity(completeTask = false) {
    if (!selected) return;
    if (!clientResponse.trim() && !internalNotes.trim() && !outcome.trim()) {
      setError(t("crm.errors.activityRequired"));
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
        ? t("crm.messages.activityScheduled")
        : completeTask
          ? t("crm.messages.activityCompleted")
          : t("crm.messages.activitySaved"),
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
      t("crm.messages.taskClaimed"),
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
        throw new Error(
          locale === "ar"
            ? t("crm.errors.save")
            : result?.error ?? t("crm.errors.save"),
        );
      }
      await loadCrm();
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("crm.errors.save"),
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
        throw new Error(
          locale === "ar"
            ? t("crm.errors.notifications")
            : body?.error ?? t("crm.errors.notifications"),
        );
      }
      await loadCrm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("crm.errors.notifications"),
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
        {t("crm.loading")}
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
              {t("crm.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              {t("crm.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewTask((current) => !current)}
            className="material-button-filled min-h-12"
          >
            {showNewTask ? t("common.close") : t("crm.newFollowUp")}
          </button>
        </header>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {t("crm.history.title")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("crm.history.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewTask((current) => !current)}
            className="material-button-tonal min-h-11"
          >
            {t("crm.newFollowUp")}
          </button>
        </div>
      )}

      {message ? <div className="material-alert-success">{message}</div> : null}
      {error ? <div className="material-alert-error">{error}</div> : null}

      {showNewTask ? (
        <section className="material-card p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block xl:col-span-2">
              <span className="material-label">{t("crm.fields.project")} *</span>
              <select
                value={newProjectId}
                onChange={(event) => setNewProjectId(event.target.value)}
                disabled={Boolean(projectId)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">{t("crm.fields.selectProject")}</option>
                {payload.availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} · {project.project_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="material-label">{t("crm.fields.type")}</span>
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
                  {t("crm.labels.structureReadiness")}
                </option>
                <option value="quotation">{t("crm.labels.quotation")}</option>
              </select>
            </label>
            <label className="block">
              <span className="material-label">{t("crm.fields.dueDate")} *</span>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(event) => setNewDueAt(event.target.value)}
                className="material-field mt-2 min-h-12"
              />
            </label>
            <label className="block">
              <span className="material-label">{t("crm.fields.assignee")}</span>
              <select
                value={newAssignee}
                onChange={(event) => setNewAssignee(event.target.value)}
                className="material-field mt-2 min-h-12"
              >
                <option value="">{t("crm.fields.assignToMe")}</option>
                {payload.assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {displayPersonName(person)}
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
              {isSaving ? t("common.saving") : t("crm.createFollowUp")}
            </button>
          </div>
        </section>
      ) : null}

      {!embedded ? (
        <details className="material-card overflow-hidden 2xl:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <span className="font-bold text-foreground">
              {t("crm.notifications.title")}
            </span>
            <span className="material-status">
              {t("crm.notifications.unreadCount", {
                count: unreadNotifications.length,
              })}
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
                    {t("crm.notifications.markAllRead")}
                  </button>
                </div>
                {unreadNotifications.slice(0, 8).map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      void markNotificationsRead(false, notification.id)
                    }
                    className="block w-full border-t border-material-outline-variant bg-material-primary-container p-4 text-start"
                  >
                    <p className="text-sm font-bold text-foreground">
                      {notificationTitle(notification, t)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </button>
                ))}
              </>
            ) : (
              <p className="border-t border-material-outline-variant p-4 text-sm text-muted">
                {t("crm.notifications.noneUnread")}
              </p>
            )}
          </div>
        </details>
      ) : null}

      {embedded ? (
        <section className="material-card p-4 sm:p-5">
          <h3 className="font-bold text-foreground">
            {t("crm.history.completeTimeline")}
          </h3>
          <div className="mt-3 divide-y divide-material-outline-variant">
            {completeProjectTimeline.length ? (
              completeProjectTimeline.map((activity) => (
                <article
                  key={activity.id}
                  className="grid gap-2 py-3 sm:grid-cols-[170px_180px_minmax(0,1fr)]"
                >
                  <time className="text-xs font-semibold text-muted">
                    {formatDateTime(activity.performed_at)}
                  </time>
                  <p className="text-sm font-bold text-foreground">
                    {displayLabel(activity.method)} ·{" "}
                    {displayLabel(activity.taskType)}
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
                {t("crm.history.noneForProject")}
              </p>
            )}
          </div>
        </section>
      ) : null}

      <div
        className={
          embedded
            ? "grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
            : "grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)_280px]"
        }
      >
        <section className="material-card min-w-0 overflow-hidden">
          <div className="border-b border-material-outline-variant p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-foreground">
                {showTeam ? t("crm.teamSupport") : t("crm.myTasks")}
              </h2>
              {!embedded ? (
                <button
                  type="button"
                  onClick={() => setShowTeam((current) => !current)}
                  className="text-xs font-bold text-material-primary"
                >
                  {showTeam ? t("crm.myTasks") : t("crm.teamSupport")}
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
                  {displayLabel(item)}
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
                  className={`w-full p-4 text-start transition ${
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
                        {dueLabel(task, t, formatDateTime)}
                      </p>
                      <p className="mt-1 truncate font-bold text-foreground">
                        {task.client?.client_name ??
                          t("crm.labels.unknownClient")}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {task.project?.project_name ??
                          t("crm.labels.unknownProject")}
                      </p>
                    </div>
                    <span className="material-status shrink-0">
                      {displayLabel(task.task_type)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted">
                    {displayPersonName(task.assignee)} ·{" "}
                    {displayLabel(task.project?.priority ?? "normal")}
                  </p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="font-bold text-foreground">
                  {t("crm.empty.title")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t("crm.empty.description")}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="material-card min-w-0 p-4 sm:p-5">
          {!selected ? (
            <div className="py-16 text-center text-sm text-muted">
              {t("crm.empty.selectTask")}
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
                  {displayLabel(selected.task_type)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["crm.fields.due", dueLabel(selected, t, formatDateTime)],
                  [
                    "crm.fields.stage",
                    displayLabel(selected.project?.sales_status ?? ""),
                  ],
                  [
                    "crm.fields.responsible",
                    displayPersonName(selected.assignee),
                  ],
                  [
                    "crm.fields.previousOutcome",
                    selected.activities[0]?.outcome ||
                      selected.completion_outcome ||
                      t("crm.history.noPreviousOutcome"),
                  ],
                ].map(([titleKey, value]) => (
                  <div key={titleKey} className="border-b border-material-outline-variant pb-3">
                    <p className="text-xs font-bold uppercase text-muted">
                      {t(titleKey)}
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
                    {t("crm.actions.callClient")}
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
                    {t("crm.actions.openProject")}
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
                    {isSaving
                      ? t("crm.actions.assigning")
                      : t("crm.actions.takeFollowUp")}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
                <div>
                  <h3 className="font-bold text-foreground">
                    {t("crm.history.activityHistory")}
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
                              {displayLabel(activity.method)}
                            </p>
                            <time className="text-xs text-muted">
                              {formatDateTime(activity.performed_at)}
                            </time>
                          </div>
                          <p className="mt-2 text-sm text-muted-strong">
                            {activity.client_response ||
                              activity.internal_notes ||
                              activity.outcome}
                          </p>
                          {activity.next_follow_up_at ? (
                            <p className="mt-2 text-xs font-bold text-material-primary">
                              {t("crm.history.nextFollowUp", {
                                date: formatDateTime(
                                  activity.next_follow_up_at,
                                ),
                              })}
                            </p>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="py-4 text-sm text-muted">
                        {t("crm.history.none")}
                      </p>
                    )}
                  </div>
                </div>

                {selected.status === "open" && selected.isMine ? (
                  <div className="rounded-lg border border-material-outline-variant p-4">
                    <h3 className="font-bold text-foreground">
                      {t("crm.activity.log")}
                    </h3>
                    <div className="mt-3 space-y-3">
                      <label className="block">
                        <span className="material-label">
                          {t("crm.activity.method")}
                        </span>
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
                              {displayLabel(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset>
                        <legend className="material-label">
                          {t("crm.activity.clientAnswered")}
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
                              {value
                                ? t("common.yes")
                                : t("common.no")}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <label className="block">
                        <span className="material-label">
                          {t("crm.activity.response")}
                        </span>
                        <input
                          value={clientResponse}
                          onChange={(event) =>
                            setClientResponse(event.target.value)
                          }
                          className="material-field mt-2 min-h-11"
                          placeholder={t("crm.activity.responsePlaceholder")}
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">
                          {t("crm.activity.internalNotes")}
                        </span>
                        <textarea
                          value={internalNotes}
                          onChange={(event) =>
                            setInternalNotes(event.target.value)
                          }
                          rows={3}
                          className="material-field mt-2 min-h-20 py-3"
                          placeholder={t("crm.activity.notesPlaceholder")}
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">
                          {t("crm.activity.outcome")}
                        </span>
                        <input
                          value={outcome}
                          onChange={(event) => setOutcome(event.target.value)}
                          className="material-field mt-2 min-h-11"
                          placeholder={t("crm.activity.outcomePlaceholder")}
                        />
                      </label>
                      <label className="block">
                        <span className="material-label">
                          {t("crm.activity.nextFollowUp")}
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
                        {isSaving
                          ? t("common.saving")
                          : t("crm.activity.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void recordActivity(true)}
                        disabled={isSaving}
                        className="material-button-outlined min-h-11 w-full"
                      >
                        {t("crm.activity.markComplete")}
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
                <h2 className="font-bold text-foreground">
                  {t("crm.notifications.title")}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {t("crm.notifications.unreadCount", {
                    count: unreadNotifications.length,
                  })}
                </p>
              </div>
              {unreadNotifications.length ? (
                <button
                  type="button"
                  onClick={() => void markNotificationsRead(true)}
                  disabled={isSaving}
                  className="text-xs font-bold text-material-primary"
                >
                  {t("crm.notifications.markAllRead")}
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
                    className={`w-full p-4 text-start ${
                      notification.read_at
                        ? "bg-material-surface-container-lowest"
                        : "bg-material-primary-container"
                    }`}
                  >
                    <p className="text-xs font-bold uppercase text-muted">
                      {displayLabel(notification.notification_kind)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {notificationTitle(notification, t)}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </button>
                ))
              ) : (
                <p className="p-5 text-sm text-muted">
                  {t("crm.notifications.none")}
                </p>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
