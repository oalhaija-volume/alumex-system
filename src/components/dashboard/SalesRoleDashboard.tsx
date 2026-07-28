"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MetricCard } from "@/components/MetricCard";
import { useI18n } from "@/components/i18n/I18nProvider";
import { salesDashboardKind } from "@/lib/dashboard/salesDashboard";
import type { DashboardPreviewRole } from "@/lib/dashboard/salesDashboard";
import { normalizeAppRole } from "@/lib/auth/roles";

type Person = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type ClientSummary = {
  id: string;
  client_name: string;
  mobile: string | null;
  whatsapp: string | null;
};

type ProjectSummary = {
  id: string;
  project_number: string;
  project_name: string;
  address: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  original_creator_id: string | null;
  owner_id: string | null;
  responsible_user_id: string | null;
  sales_status: string;
  structure_readiness: string;
  expected_structure_ready_date: string | null;
  next_follow_up_at: string | null;
  priority: string;
  updated_at: string;
  isMine: boolean;
  client: ClientSummary | null;
  owner: Person | null;
  responsible: Person | null;
};

type FollowUpSummary = {
  id: string;
  task_type: string;
  status: string;
  due_at: string;
  isMine: boolean;
  project: ProjectSummary | null;
  client: ClientSummary | null;
  owner: Person | null;
  assignee: Person | null;
};

type MeasurementSummary = {
  id: string;
  project_id: string;
  return_to_user_id: string | null;
  status: string;
  preferred_at: string | null;
  updated_at: string;
  project: ProjectSummary | null;
  client: ClientSummary | null;
  assignee: Person | null;
};

type AppointmentSummary = {
  id: string;
  project_id: string;
  appointment_type: string;
  assigned_employee_id: string | null;
  starts_at: string;
  location: string | null;
  status: string;
  project: ProjectSummary | null;
  client: ClientSummary | null;
  assignee: Person | null;
};

type AuditSummary = {
  id: string;
  action: string;
  entity_type: string;
  actor_role: string | null;
  reason: string | null;
  created_at: string;
  actor: Person | null;
};

type DashboardPayload = {
  role: string;
  currentUserId: string;
  projects: ProjectSummary[];
  followUps: FollowUpSummary[];
  measurements: MeasurementSummary[];
  appointments: AppointmentSummary[];
  profiles: Person[];
  auditEvents: AuditSummary[];
  error?: string;
};

const closedAppointmentStatuses = new Set([
  "completed",
  "cancelled",
  "client_unavailable",
  "no_show",
]);
const closedMeasurementStatuses = new Set(["approved", "cancelled"]);

function labelStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localizedStatus(
  t: (key: string) => string,
  value: string,
) {
  const camel = value.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  const salesKey = `salesStatus.${camel}`;
  const salesTranslated = t(salesKey);
  if (salesTranslated !== salesKey) {
    return salesTranslated;
  }
  const key = `dashboard.role.status.${camel}`;
  const translated = t(key);
  return translated === key ? labelStatus(value) : translated;
}

function personName(person: Person | null, fallback = "Unassigned") {
  return person?.full_name?.trim() || person?.email || fallback;
}

function sameLocalDay(value: string, comparison: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === comparison.getFullYear() &&
    date.getMonth() === comparison.getMonth() &&
    date.getDate() === comparison.getDate()
  );
}

function DashboardSection({
  title,
  description,
  count,
  action,
  children,
}: {
  title: string;
  description: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="material-card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-material-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <span className="material-status">{count}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="p-5 text-sm font-semibold text-muted">{children}</p>;
}

function ProjectList({
  projects,
  outdoorActions = false,
}: {
  projects: ProjectSummary[];
  outdoorActions?: boolean;
}) {
  const { t } = useI18n();

  if (!projects.length) {
    return <EmptyState>{t("dashboard.role.empty.projects")}</EmptyState>;
  }

  return (
    <div className="divide-y divide-material-outline-variant">
      {projects.slice(0, 8).map((project) => {
        const mapHref =
          project.location_latitude !== null &&
          project.location_longitude !== null
            ? `https://www.google.com/maps/search/?api=1&query=${project.location_latitude},${project.location_longitude}`
            : null;
        return (
          <article key={project.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-material-primary">
                  {project.project_number}
                </p>
                <h3 className="mt-1 truncate font-bold text-foreground">
                  {project.project_name}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {project.client?.client_name ??
                    t("dashboard.role.unknownClient")}{" "}
                  · {localizedStatus(t, project.sales_status)}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {project.address || t("dashboard.role.noAddress")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="material-button-tonal min-h-11"
                >
                  {t("dashboard.role.actions.open")}
                </Link>
                {outdoorActions && mapHref ? (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="material-button-outlined min-h-11"
                  >
                    {t("dashboard.role.actions.location")}
                  </a>
                ) : null}
                {outdoorActions && project.client?.mobile ? (
                  <a
                    href={`tel:${project.client.mobile}`}
                    className="material-button-outlined min-h-11"
                  >
                    {t("dashboard.role.actions.call")}
                  </a>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FollowUpList({ tasks }: { tasks: FollowUpSummary[] }) {
  const { t } = useI18n();

  if (!tasks.length) {
    return <EmptyState>{t("dashboard.role.empty.followUps")}</EmptyState>;
  }

  return (
    <div className="divide-y divide-material-outline-variant">
      {tasks.slice(0, 8).map((task) => (
        <Link
          key={task.id}
          href={`/crm?taskId=${task.id}`}
          className="grid gap-2 p-4 transition hover:bg-material-surface-container-lowest sm:grid-cols-[minmax(0,1fr)_180px_150px] sm:items-center sm:p-5"
        >
          <div className="min-w-0">
            <p className="truncate font-bold text-foreground">
              {task.project?.project_name ??
                t("dashboard.role.unknownProject")}
            </p>
            <p className="mt-1 truncate text-sm text-muted">
              {task.client?.client_name ??
                t("dashboard.role.unknownClient")}{" "}
              · {localizedStatus(t, task.task_type)}
            </p>
          </div>
          <p className="text-sm font-semibold text-muted-strong">
            {new Date(task.due_at).toLocaleString()}
          </p>
          <p className="text-xs font-bold text-material-primary">
            {personName(
              task.assignee ?? task.owner,
              t("dashboard.role.unassigned"),
            )}
          </p>
        </Link>
      ))}
    </div>
  );
}

function MeasurementList({
  measurements,
  outdoorActions = false,
}: {
  measurements: MeasurementSummary[];
  outdoorActions?: boolean;
}) {
  const { t } = useI18n();

  if (!measurements.length) {
    return <EmptyState>{t("dashboard.role.empty.measurements")}</EmptyState>;
  }

  return (
    <div className="divide-y divide-material-outline-variant">
      {measurements.slice(0, 8).map((measurement) => (
        <article key={measurement.id} className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">
                {measurement.project?.project_name ??
                  t("dashboard.role.unknownProject")}
              </p>
              <p className="mt-1 text-sm text-muted">
                {measurement.client?.client_name ??
                  t("dashboard.role.unknownClient")}{" "}
                · {localizedStatus(t, measurement.status)}
              </p>
              {measurement.preferred_at ? (
                <p className="mt-1 text-xs font-semibold text-muted-strong">
                  {new Date(measurement.preferred_at).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/site-measurements/${measurement.project_id}?requestId=${measurement.id}`}
                className="material-button-filled min-h-11"
              >
                {measurement.status === "draft_saved"
                  ? t("dashboard.role.actions.resumeMeasurement")
                  : outdoorActions
                    ? t("dashboard.role.actions.startMeasurement")
                    : t("dashboard.role.actions.review")}
              </Link>
              {measurement.project ? (
                <Link
                  href={`/projects/${measurement.project.id}`}
                  className="material-button-outlined min-h-11"
                >
                  {t("dashboard.role.actions.project")}
                </Link>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function AppointmentList({
  appointments,
  canUpdate,
  onUpdate,
  updatingId,
}: {
  appointments: AppointmentSummary[];
  canUpdate: boolean;
  onUpdate: (id: string, status: string) => void;
  updatingId: string;
}) {
  const { t } = useI18n();

  if (!appointments.length) {
    return <EmptyState>{t("dashboard.role.empty.appointments")}</EmptyState>;
  }

  return (
    <div className="divide-y divide-material-outline-variant">
      {appointments.slice(0, 8).map((appointment) => (
        <article key={appointment.id} className="p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-bold text-foreground">
                  {appointment.project?.project_name ??
                    t("dashboard.role.unknownProject")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {localizedStatus(t, appointment.appointment_type)} ·{" "}
                  {new Date(appointment.starts_at).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {appointment.location ||
                    appointment.project?.address ||
                    t("dashboard.role.noLocation")}
                </p>
              </div>
              <span className="material-status">
                {localizedStatus(t, appointment.status)}
              </span>
            </div>
            {canUpdate && !closedAppointmentStatuses.has(appointment.status) ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {[
                  ["completed", t("dashboard.role.actions.complete")],
                  ["postponed", t("dashboard.role.actions.postpone")],
                  [
                    "client_unavailable",
                    t("dashboard.role.actions.unavailable"),
                  ],
                  ["cancelled", t("dashboard.role.actions.cancel")],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    disabled={updatingId === appointment.id}
                    onClick={() => onUpdate(appointment.id, status)}
                    className="material-button-outlined min-h-11 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function SalesRoleDashboard({
  previewRole = null,
}: {
  previewRole?: DashboardPreviewRole | null;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    const query = previewRole
      ? `?viewAs=${encodeURIComponent(previewRole)}`
      : "";
    const response = await fetch(`/api/dashboard/sales${query}`, {
      cache: "no-store",
      signal,
    });
    const body = (await response.json().catch(() => null)) as
      | DashboardPayload
      | null;
    if (!response.ok || !body) {
      throw new Error(body?.error ?? t("dashboard.role.loadError"));
    }
    startTransition(() => setPayload(body));
  }, [previewRole, t]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCurrentTime(Date.now());
      void loadDashboard(controller.signal)
        .catch((loadError) => {
          if (controller.signal.aborted) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("dashboard.role.loadError"),
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loadDashboard, t]);

  const now = useMemo(
    () => (currentTime ? new Date(currentTime) : new Date()),
    [currentTime],
  );

  async function updateAppointment(appointmentId: string, status: string) {
    setUpdatingAppointmentId(appointmentId);
    setError("");
    try {
      const response = await fetch("/api/dashboard/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_appointment",
          appointmentId,
          status,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? t("dashboard.role.appointmentError"));
      }
      await loadDashboard();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("dashboard.role.appointmentError"),
      );
    } finally {
      setUpdatingAppointmentId("");
    }
  }

  if (isLoading) {
    return (
      <div className="material-card p-5 text-sm font-bold">
        {t("dashboard.role.loading")}
      </div>
    );
  }

  if (!payload) {
    return <div className="material-alert-error">{error}</div>;
  }

  const dashboardKind = salesDashboardKind(normalizeAppRole(payload.role));
  const isOutdoor = dashboardKind === "outdoor";
  const isManager = dashboardKind === "manager";
  const openFollowUps = payload.followUps.filter(
    (task) => task.status === "open",
  );
  const ownFollowUps = openFollowUps.filter((task) => task.isMine);
  const dueToday = ownFollowUps.filter((task) =>
    sameLocalDay(task.due_at, now),
  );
  const overdue = ownFollowUps.filter(
    (task) => Date.parse(task.due_at) < now.getTime(),
  );
  const ownProjects = payload.projects.filter((project) => project.isMine);
  const teamFollowUps = openFollowUps.filter((task) => !task.isMine);
  const receivedMeasurements = payload.measurements.filter(
    (measurement) =>
      ["submitted", "under_review"].includes(measurement.status) &&
      (measurement.return_to_user_id === payload.currentUserId ||
        measurement.project?.owner_id === payload.currentUserId),
  );
  const quotationFollowUps = ownFollowUps.filter(
    (task) => task.task_type === "quotation",
  );
  const ownAppointments = payload.appointments.filter(
    (appointment) =>
      !closedAppointmentStatuses.has(appointment.status) &&
      (appointment.assigned_employee_id === payload.currentUserId ||
        appointment.project?.owner_id === payload.currentUserId),
  );

  if (isOutdoor) {
    const searchable = search.trim().toLowerCase();
    const outdoorMeasurements = payload.measurements.filter((measurement) => {
      if (!searchable) return true;
      return [
        measurement.project?.project_name,
        measurement.project?.project_number,
        measurement.client?.client_name,
        measurement.client?.mobile,
      ].some((value) => value?.toLowerCase().includes(searchable));
    });
    const createdProjects = payload.projects.filter(
      (project) =>
        project.original_creator_id === payload.currentUserId &&
        (!searchable ||
          [
            project.project_name,
            project.project_number,
            project.client?.client_name,
            project.client?.mobile,
          ].some((value) => value?.toLowerCase().includes(searchable))),
    );
    const awaitingReadiness = createdProjects.filter(
      (project) => project.structure_readiness === "not_ready",
    );
    const todayAppointments = payload.appointments.filter((appointment) =>
      sameLocalDay(appointment.starts_at, now),
    );
    const upcomingAppointments = payload.appointments.filter(
      (appointment) =>
        Date.parse(appointment.starts_at) > now.getTime() &&
        !sameLocalDay(appointment.starts_at, now) &&
        !closedAppointmentStatuses.has(appointment.status),
    );
    const overdueMeasurements = outdoorMeasurements.filter(
      (measurement) =>
        !closedMeasurementStatuses.has(measurement.status) &&
        measurement.preferred_at &&
        Date.parse(measurement.preferred_at) < now.getTime(),
    );
    const draftMeasurements = outdoorMeasurements.filter((measurement) =>
      ["in_progress", "draft_saved"].includes(measurement.status),
    );
    const submittedMeasurements = outdoorMeasurements.filter(
      (measurement) =>
        measurement.status === "submitted" ||
        measurement.status === "under_review",
    );
    const correctionMeasurements = outdoorMeasurements.filter(
      (measurement) => measurement.status === "correction_required",
    );
    const completedMeasurements = outdoorMeasurements.filter(
      (measurement) =>
        measurement.status === "approved" ||
        measurement.status === "completed",
    );

    return (
      <div className="space-y-5">
        {error ? <div className="material-alert-error">{error}</div> : null}
        <section className="material-card p-4 sm:p-5">
          <label className="block">
            <span className="material-label">
              {t("dashboard.role.search")}
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("dashboard.role.searchPlaceholder")}
              className="material-field mt-2 min-h-12"
            />
          </label>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            stat={{
              label: t("dashboard.role.outdoor.assigned"),
              value: String(outdoorMeasurements.length),
              detail: t("dashboard.role.outdoor.assignedDetail"),
              tone: "blue",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.outdoor.today"),
              value: String(todayAppointments.length),
              detail: t("dashboard.role.outdoor.todayDetail"),
              tone: "green",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.outdoor.overdue"),
              value: String(overdueMeasurements.length),
              detail: t("dashboard.role.outdoor.overdueDetail"),
              tone: "red",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.outdoor.corrections"),
              value: String(correctionMeasurements.length),
              detail: t("dashboard.role.outdoor.correctionsDetail"),
              tone: "amber",
            }}
          />
        </section>

        <DashboardSection
          title={t("dashboard.role.outdoor.todayAppointments")}
          description={t("dashboard.role.outdoor.todayAppointmentsDetail")}
          count={todayAppointments.length}
        >
          <AppointmentList
            appointments={todayAppointments}
            canUpdate
            onUpdate={(id, status) => void updateAppointment(id, status)}
            updatingId={updatingAppointmentId}
          />
        </DashboardSection>

        <DashboardSection
          title={t("dashboard.role.outdoor.measurementVisits")}
          description={t("dashboard.role.outdoor.measurementVisitsDetail")}
          count={outdoorMeasurements.length}
        >
          <MeasurementList measurements={outdoorMeasurements} outdoorActions />
        </DashboardSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <DashboardSection
            title={t("dashboard.role.outdoor.drafts")}
            description={t("dashboard.role.outdoor.draftsDetail")}
            count={draftMeasurements.length}
          >
            <MeasurementList measurements={draftMeasurements} outdoorActions />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.returned")}
            description={t("dashboard.role.outdoor.returnedDetail")}
            count={correctionMeasurements.length}
          >
            <MeasurementList
              measurements={correctionMeasurements}
              outdoorActions
            />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.upcoming")}
            description={t("dashboard.role.outdoor.upcomingDetail")}
            count={upcomingAppointments.length}
          >
            <AppointmentList
              appointments={upcomingAppointments}
              canUpdate
              onUpdate={(id, status) => void updateAppointment(id, status)}
              updatingId={updatingAppointmentId}
            />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.awaitingReadiness")}
            description={t("dashboard.role.outdoor.awaitingReadinessDetail")}
            count={awaitingReadiness.length}
          >
            <ProjectList projects={awaitingReadiness} outdoorActions />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.newProjects")}
            description={t("dashboard.role.outdoor.newProjectsDetail")}
            count={createdProjects.length}
          >
            <ProjectList projects={createdProjects} outdoorActions />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.submitted")}
            description={t("dashboard.role.outdoor.submittedDetail")}
            count={submittedMeasurements.length}
          >
            <MeasurementList measurements={submittedMeasurements} />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.outdoor.completed")}
            description={t("dashboard.role.outdoor.completedDetail")}
            count={completedMeasurements.length}
          >
            <MeasurementList measurements={completedMeasurements} />
          </DashboardSection>
        </div>
      </div>
    );
  }

  if (isManager) {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredProjects = payload.projects.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          project.project_number,
          project.project_name,
          project.client?.client_name,
        ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesStatus =
        !statusFilter || project.sales_status === statusFilter;
      const matchesOwner =
        !ownerFilter ||
        project.owner_id === ownerFilter ||
        project.responsible_user_id === ownerFilter;
      return matchesSearch && matchesStatus && matchesOwner;
    });
    const statuses = [...new Set(payload.projects.map((item) => item.sales_status))];

    return (
      <div className="space-y-5">
        {error ? <div className="material-alert-error">{error}</div> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            stat={{
              label: t("dashboard.role.manager.projects"),
              value: String(payload.projects.length),
              detail: t("dashboard.role.manager.projectsDetail"),
              tone: "blue",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.manager.overdue"),
              value: String(
                openFollowUps.filter(
                  (task) => Date.parse(task.due_at) < now.getTime(),
                ).length,
              ),
              detail: t("dashboard.role.manager.overdueDetail"),
              tone: "red",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.manager.measurements"),
              value: String(
                payload.measurements.filter(
                  (item) => !closedMeasurementStatuses.has(item.status),
                ).length,
              ),
              detail: t("dashboard.role.manager.measurementsDetail"),
              tone: "amber",
            }}
          />
          <MetricCard
            stat={{
              label: t("dashboard.role.manager.appointments"),
              value: String(
                payload.appointments.filter(
                  (item) => !closedAppointmentStatuses.has(item.status),
                ).length,
              ),
              detail: t("dashboard.role.manager.appointmentsDetail"),
              tone: "green",
            }}
          />
        </section>

        <section className="material-card p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("dashboard.role.searchPlaceholder")}
              className="material-field min-h-12"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="material-field min-h-12"
            >
              <option value="">{t("dashboard.role.allStatuses")}</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {localizedStatus(t, status)}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="material-field min-h-12"
            >
              <option value="">{t("dashboard.role.allOwners")}</option>
              {payload.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {personName(profile, t("dashboard.role.unassigned"))}
                </option>
              ))}
            </select>
          </div>
        </section>

        <DashboardSection
          title={t("dashboard.role.manager.overview")}
          description={t("dashboard.role.manager.overviewDetail")}
          count={filteredProjects.length}
        >
          <ProjectList projects={filteredProjects} />
        </DashboardSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <DashboardSection
            title={t("dashboard.role.manager.teamFollowUps")}
            description={t("dashboard.role.manager.teamFollowUpsDetail")}
            count={openFollowUps.length}
          >
            <FollowUpList tasks={openFollowUps} />
          </DashboardSection>
          <DashboardSection
            title={t("dashboard.role.manager.audit")}
            description={t("dashboard.role.manager.auditDetail")}
            count={payload.auditEvents.length}
          >
            {payload.auditEvents.length ? (
              <div className="divide-y divide-material-outline-variant">
                {payload.auditEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="p-4 sm:p-5">
                    <p className="font-bold text-foreground">
                      {localizedStatus(t, event.action)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {personName(
                        event.actor,
                        t("dashboard.role.unassigned"),
                      )}{" "}
                      · {localizedStatus(t, event.entity_type)} ·{" "}
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>{t("dashboard.role.manager.noAudit")}</EmptyState>
            )}
          </DashboardSection>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <div className="material-alert-error">{error}</div> : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          stat={{
            label: t("dashboard.role.indoor.myProjects"),
            value: String(ownProjects.length),
            detail: t("dashboard.role.indoor.myProjectsDetail"),
            tone: "blue",
          }}
        />
        <MetricCard
          stat={{
            label: t("dashboard.role.indoor.dueToday"),
            value: String(dueToday.length),
            detail: t("dashboard.role.indoor.dueTodayDetail"),
            tone: "green",
          }}
        />
        <MetricCard
          stat={{
            label: t("dashboard.role.indoor.overdue"),
            value: String(overdue.length),
            detail: t("dashboard.role.indoor.overdueDetail"),
            tone: "red",
          }}
        />
        <MetricCard
          stat={{
            label: t("dashboard.role.indoor.measurements"),
            value: String(receivedMeasurements.length),
            detail: t("dashboard.role.indoor.measurementsDetail"),
            tone: "amber",
          }}
        />
      </section>

      <DashboardSection
        title={t("dashboard.role.indoor.myProjects")}
        description={t("dashboard.role.indoor.myProjectsSectionDetail")}
        count={ownProjects.length}
      >
        <ProjectList projects={ownProjects} />
      </DashboardSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <DashboardSection
          title={t("dashboard.role.indoor.dueToday")}
          description={t("dashboard.role.indoor.dueTodaySectionDetail")}
          count={dueToday.length}
        >
          <FollowUpList tasks={dueToday} />
        </DashboardSection>
        <DashboardSection
          title={t("dashboard.role.indoor.overdue")}
          description={t("dashboard.role.indoor.overdueSectionDetail")}
          count={overdue.length}
        >
          <FollowUpList tasks={overdue} />
        </DashboardSection>
        <DashboardSection
          title={t("dashboard.role.indoor.measurements")}
          description={t("dashboard.role.indoor.measurementsSectionDetail")}
          count={receivedMeasurements.length}
        >
          <MeasurementList measurements={receivedMeasurements} />
        </DashboardSection>
        <DashboardSection
          title={t("dashboard.role.indoor.quotationFollowUps")}
          description={t("dashboard.role.indoor.quotationFollowUpsDetail")}
          count={quotationFollowUps.length}
        >
          <FollowUpList tasks={quotationFollowUps} />
        </DashboardSection>
        <DashboardSection
          title={t("dashboard.role.indoor.appointments")}
          description={t("dashboard.role.indoor.appointmentsDetail")}
          count={ownAppointments.length}
        >
          <AppointmentList
            appointments={ownAppointments}
            canUpdate
            onUpdate={(id, status) => void updateAppointment(id, status)}
            updatingId={updatingAppointmentId}
          />
        </DashboardSection>
        <DashboardSection
          title={t("dashboard.role.indoor.teamFollowUps")}
          description={t("dashboard.role.indoor.teamFollowUpsDetail")}
          count={teamFollowUps.length}
        >
          <FollowUpList tasks={teamFollowUps} />
        </DashboardSection>
      </div>

      <DashboardSection
        title={t("dashboard.role.indoor.allProjects")}
        description={t("dashboard.role.indoor.allProjectsDetail")}
        count={payload.projects.length}
      >
        <ProjectList projects={payload.projects} />
      </DashboardSection>
    </div>
  );
}
