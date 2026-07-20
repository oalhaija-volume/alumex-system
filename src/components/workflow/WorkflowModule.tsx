"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { StatusPill } from "@/components/StatusPill";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";
import { type ProjectWorkflowStatus } from "@/lib/workflow/statuses";
import {
  operationsEndpointStatuses,
  workflowStageForStatus,
  workflowStages,
  type CommercialVisibility,
} from "@/lib/workflow/display";
import { postOperationsWorkflowEnabled } from "@/lib/systemScope";

type WorkflowProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  client: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    province: string;
    city: string;
  };
  address: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
  geofenceRadiusMeters: number;
  projectType: string;
  projectStatus: string;
  workflowStatus: ProjectWorkflowStatus;
  workflowStatusLabel: string;
  nextRequiredAction: string;
  assignments: {
    operationsManagerId: string;
    operationsManager: string;
    projectManagerId: string;
    projectManager: string;
    projectEngineerId: string;
    projectEngineer: string;
    siteEngineerId: string;
    siteEngineer: string;
    salesEngineerId: string;
    salesEngineer: string;
  };
  openings: Array<{
    id: string;
    openingCode: string;
    floor: string;
    room: string;
    width: number;
    height: number;
    solidPanelHeight: number;
    fixedHeight: number;
    quantity: number;
    areaSqm: number;
    productSystem: string;
    glassType: string;
    aluminumColor: string;
    shape: string;
    openingType: string;
    bottomFrame: string;
    openingDirection: string;
    glassColor: string;
    notes: string;
  }>;
  commercial: {
    visibility: CommercialVisibility;
    quotation?: {
      id: string;
      quotationNumber: string;
      status: string;
      subtotal?: number;
      lineDiscountTotal?: number;
      quotationDiscountTotal?: number;
      grandTotal?: number;
      items?: Array<{
        id: string;
        openingCode: string;
        productSystem: string;
        glassType: string;
        quantity: number;
        areaSqm: number;
        unitPrice: number;
        discountPercent: number;
        netTotal: number;
      }>;
    } | null;
    contract?: {
      id: string;
      contractNumber: string;
      status: string;
      contractValue: number;
      contractDate: string | null;
      downPaymentRequired: number;
      downPaymentReceived: number;
      remainingBalance: number;
      paymentStatus: string;
      finalPaymentStatus: string;
      exceptionReason: string;
    } | null;
  };
  projectDescription: {
    aluminumSystemSummary: string;
    glassType: string;
    aluminumColor: string;
    openingNotes: string;
    technicalNotes: string;
    siteNotes: string;
    submittedAt: string;
    updatedAt: string;
  } | null;
  latestAuditReview: {
    id: string;
    auditor: string;
    decision: string;
    comments: string;
    createdAt: string;
  } | null;
};

type WorkflowResponse = {
  role?: string;
  commercialVisibility?: CommercialVisibility;
  assignableUsers?: {
    projectManagers?: AssignableUser[];
    projectEngineers?: AssignableUser[];
    siteEngineers?: AssignableUser[];
  };
  projects?: WorkflowProject[];
  project?: WorkflowProject | null;
  error?: string;
};

type WorkflowModuleProps = {
  projectId?: string;
  queueTitle?: string;
  queueDescription?: string;
  focusStatuses?: ProjectWorkflowStatus[];
  showSummaryCards?: boolean;
  showProjectStatusCards?: boolean;
  queueTarget?: "workflow" | "measurements";
  emptyTitle?: string;
  emptyDescription?: string;
  detailEyebrow?: string;
  detailFallbackTitle?: string;
  detailDescription?: string;
  detailBackHref?: string;
};

type AssignableUser = {
  id: string;
  name: string;
  role: string;
};

type AssignmentType =
  | "projectManager"
  | "projectEngineer"
  | "siteEngineer";
type FinanceAction =
  | "confirmDownPayment"
  | "markPaymentException"
  | "startFinanceFinalCheck"
  | "requestFinalPayment"
  | "confirmFinalPayment"
  | "completeFinanceCheck";
type WorkflowAction =
  | "startMeasurement"
  | "completeMeasurement"
  | "saveProjectDescription"
  | "sendDescriptionToAudit"
  | "approveAudit"
  | "rejectAudit"
  | "approveForFactory"
  | "markSentToFactory"
  | "markFactoryInProgress"
  | "markFactoryCompleted"
  | "markDeliveryPending"
  | "markDelivered"
  | "markInstallationInProgress"
  | "markInstallationCompleted";

type ProjectDescriptionDraft = NonNullable<WorkflowProject["projectDescription"]>;

type AssignableUsers = {
  projectManagers: AssignableUser[];
  projectEngineers: AssignableUser[];
  siteEngineers: AssignableUser[];
};

function EmptyValue({ value }: { value: string | number | null | undefined }) {
  const { t, term } = useI18n();
  const text = value === 0 ? "0" : value ? String(value) : "";
  return <>{text ? term(text) : t("common.notAdded")}</>;
}

function InfoCell({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const { term } = useI18n();

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">
        {term(label)}
      </dt>
      <dd className="mt-1 text-sm font-semibold leading-6 text-foreground">
        <EmptyValue value={value} />
      </dd>
    </div>
  );
}

function StageStrip({
  status,
  compact = false,
}: {
  status: ProjectWorkflowStatus;
  compact?: boolean;
}) {
  const { t, term } = useI18n();
  const currentStage = workflowStageForStatus(status);
  const currentIndex = workflowStages.indexOf(currentStage);
  const completedCount = completedStageCount(status);
  const progressPercent = Math.round(
    (completedCount / workflowStages.length) * 100,
  );
  const previousStage =
    currentIndex > 0 ? workflowStages[currentIndex - 1] : null;
  const nextStage = workflowStages[currentIndex + 1] ?? null;

  return (
    <>
      <div className={compact ? "grid gap-3 sm:hidden" : "hidden"}>
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("workflow.projectStages")}
            </p>
            <p className="text-xs font-black text-foreground">
              {completedCount}/{workflowStages.length}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-material-surface-container">
            <div
              className="h-full rounded-full bg-material-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-muted">
            {t("workflow.percentComplete", { percent: progressPercent })}
          </p>
        </div>

        <ol className="grid gap-2">
          {previousStage ? (
            <li className="flex gap-3 rounded-lg border border-success-text/30 bg-success-surface p-3 text-success-text">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-current" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide">
                  {term("Completed")}
                </p>
                <p className="mt-1 text-sm font-bold">{term(previousStage)}</p>
              </div>
            </li>
          ) : null}
          <li className="flex gap-3 rounded-lg border border-primary bg-info-surface p-3 text-info-text">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-current" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide">
                {t("workflow.currentStage")}
              </p>
              <p className="mt-1 text-base font-black">{term(currentStage)}</p>
            </div>
          </li>
          {nextStage ? (
            <li className="flex gap-3 rounded-lg border border-border bg-surface p-3 text-muted-strong">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-current" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide">
                  {t("workflow.nextStage")}
                </p>
                <p className="mt-1 text-sm font-bold">{term(nextStage)}</p>
              </div>
            </li>
          ) : null}
        </ol>
      </div>

      <ol
        className={
          compact
            ? "hidden min-w-[760px] grid-cols-11 gap-1 sm:grid"
            : "grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
        }
      >
        {workflowStages.map((stage, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li
              key={stage}
              className={`rounded-lg border ${
                compact ? "px-2 py-2" : "px-3 py-3"
              } ${
                isCurrent
                  ? "border-primary bg-info-surface text-info-text"
                  : isComplete
                    ? "border-border bg-success-surface text-success-text"
                    : "border-border bg-surface-muted text-muted-strong"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide">
                {isCurrent
                  ? t("workflow.current")
                  : isComplete
                    ? term("Completed")
                    : t("common.pending")}
              </p>
              <p className={`${compact ? "mt-1 text-xs" : "mt-1 text-sm"} font-bold`}>
                {term(stage)}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function SummaryCards({ projects }: { projects: WorkflowProject[] }) {
  const { term } = useI18n();
  const summaries: Array<{
    label: string;
    value: number;
  }> = [
    { label: "Total Projects", value: projects.length },
    {
      label: "Waiting Finance",
      value: projects.filter((project) =>
        [
          "sales_contract_created",
          "finance_down_payment_pending",
          "finance_final_check",
        ].includes(project.workflowStatus),
      ).length,
    },
    {
      label: "Waiting Audit",
      value: projects.filter((project) =>
        ["audit_pending", "audit_rejected"].includes(project.workflowStatus),
      ).length,
    },
    {
      label: "In Production",
      value: projects.filter((project) =>
        ["sent_to_factory", "factory_in_progress"].includes(project.workflowStatus),
      ).length,
    },
    {
      label: "Waiting Delivery",
      value: projects.filter((project) =>
        ["final_payment_received", "delivery_pending"].includes(project.workflowStatus),
      ).length,
    },
    {
      label: "Completed",
      value: projects.filter(
        (project) => project.workflowStatus === "installation_completed",
      ).length,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {summaries.map((summary) => (
        <div
          key={summary.label}
          className="rounded-lg border border-border bg-surface p-4 shadow-sm"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {term(summary.label)}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {summary.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function nextStageForStatus(status: ProjectWorkflowStatus) {
  if (
    !postOperationsWorkflowEnabled &&
    operationsEndpointStatuses.includes(status)
  ) {
    return "Current endpoint";
  }

  const currentStage = workflowStageForStatus(status);
  const currentIndex = workflowStages.indexOf(currentStage);

  if (status === "installation_completed") {
    return "Completed";
  }

  return workflowStages[currentIndex + 1] ?? "Completed";
}

function assignmentOwner(project: WorkflowProject) {
  const stage = workflowStageForStatus(project.workflowStatus);

  if (stage === "Operations") {
    return project.assignments.operationsManager || "Operations Manager";
  }

  if (stage === "Project Manager" || stage === "Installation") {
    return project.assignments.projectManager;
  }

  if (stage === "Site Measurement" || stage === "Factory") {
    return project.assignments.projectEngineer;
  }

  if (stage === "Delivery") {
    return "Delivery Head";
  }

  if (stage === "Audit") {
    return project.latestAuditReview?.auditor || "Auditor";
  }

  if (stage === "Finance" || stage === "Final Payment") {
    return "Finance / Accountant";
  }

  if (stage === "Branch Approval") {
    return "Branch Manager";
  }

  return project.assignments.salesEngineer || "Sales";
}

function stageState(project: WorkflowProject) {
  if (project.workflowStatus === "installation_completed") {
    return "Completed";
  }

  if (
    [
      "operations_manager_review",
      "project_manager_assigned",
      "project_engineer_assigned",
    ].includes(project.workflowStatus)
  ) {
    return "Waiting assignment";
  }

  if (
    [
      "finance_down_payment_pending",
      "finance_final_check",
      "final_payment_requested",
      "audit_pending",
      "branch_manager_review",
      "delivery_pending",
    ].includes(project.workflowStatus)
  ) {
    return "Waiting approval";
  }

  return "In progress";
}

function OverallStatusBlock({
  project,
  compact = false,
}: {
  project: WorkflowProject;
  compact?: boolean;
}) {
  const { term } = useI18n();

  return (
    <div className="min-w-0 space-y-1">
      <StatusPill status={stageState(project)} />
      <p
        className={`font-bold leading-snug text-foreground ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {term(project.workflowStatusLabel)}
      </p>
    </div>
  );
}

function completedStageCount(status: ProjectWorkflowStatus) {
  if (status === "installation_completed") {
    return workflowStages.length;
  }

  const currentStage = workflowStageForStatus(status);
  return Math.max(workflowStages.indexOf(currentStage), 0);
}

function QuickAssignmentSelect({
  project,
  label,
  users,
  assignmentType,
  emptyError,
  fallbackError,
  onAssigned,
}: {
  project: WorkflowProject;
  label: string;
  users: AssignableUser[];
  assignmentType: AssignmentType;
  emptyError: string;
  fallbackError: string;
  onAssigned: (
    projectId: string,
    assignmentType: AssignmentType,
    assigneeId: string,
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const currentAssignmentId =
    assignmentType === "projectManager"
      ? project.assignments.projectManagerId
      : assignmentType === "projectEngineer"
        ? project.assignments.projectEngineerId
        : project.assignments.siteEngineerId;
  const [selectedUserId, setSelectedUserId] = useState(currentAssignmentId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAssign() {
    if (!selectedUserId) {
      setError(emptyError);
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      await onAssigned(project.id, assignmentType, selectedUserId);
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : fallbackError,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-3">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {label}
        </span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
          >
            <option value="">{t("common.notAdded")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={isSaving || !selectedUserId}
            className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? t("common.loading") : t("workflow.assign")}
          </button>
        </div>
      </label>
      {!users.length ? (
        <p className="mt-2 text-xs font-semibold text-muted">
          {t("workflow.noActiveUsersForRole")}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm font-semibold text-danger-text">{error}</p>
      ) : null}
    </div>
  );
}

function ProjectStatusCards({
  projects,
  role,
  assignableUsers,
  onAssigned,
}: {
  projects: WorkflowProject[];
  role: string;
  assignableUsers: AssignableUsers;
  onAssigned: (
    projectId: string,
    assignmentType: AssignmentType,
    assigneeId: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();

  return (
    <SectionCard title={t("workflow.projectStatusCards")}>
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((project) => {
          const currentStage = workflowStageForStatus(project.workflowStatus);
          const completedCount = completedStageCount(project.workflowStatus);
          const owner = assignmentOwner(project);

          const canAssignProjectManager =
            postOperationsWorkflowEnabled &&
            (role === "Admin" || role === "Operations Manager") &&
            project.workflowStatus === "operations_manager_review";
          const canAssignProjectEngineer =
            postOperationsWorkflowEnabled &&
            (role === "Admin" || role === "Project Manager") &&
            project.workflowStatus === "project_manager_assigned";
          const canAssignSiteEngineer =
            postOperationsWorkflowEnabled &&
            (role === "Admin" || role === "Project Engineer") &&
            project.workflowStatus === "project_engineer_assigned";

          return (
            <article
              key={project.id}
              className="rounded-lg border border-border bg-surface-muted p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {project.projectNumber}
                  </p>
                  <h2 className="mt-1 truncate text-base font-bold text-foreground">
                    {term(project.projectName)}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-muted-strong">
                    {project.client.name || t("common.notAdded")}
                  </p>
                </div>
                <StatusPill status={stageState(project)} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t("workflow.currentStage")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {term(currentStage)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t("workflow.assignedTo")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {owner ? term(owner) : t("common.notAdded")}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t("workflow.nextStage")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {term(nextStageForStatus(project.workflowStatus))}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {t("workflow.progress")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {t("workflow.stagesComplete", {
                      completed: completedCount,
                      total: workflowStages.length,
                    })}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <p className="rounded-md bg-surface px-3 py-2 font-semibold text-muted-strong">
                  {t("workflow.pm")}: {project.assignments.projectManager || t("common.notAdded")}
                </p>
                <p className="rounded-md bg-surface px-3 py-2 font-semibold text-muted-strong">
                  {t("workflow.pe")}: {project.assignments.projectEngineer || t("common.notAdded")}
                </p>
                <p className="rounded-md bg-surface px-3 py-2 font-semibold text-muted-strong">
                  {t("workflow.site")}: {project.assignments.siteEngineer || t("common.notAdded")}
                </p>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {t("workflow.nextAction")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {term(project.nextRequiredAction)}
                </p>
              </div>

              {canAssignProjectManager ? (
                <QuickAssignmentSelect
                  key={`project-manager-${project.assignments.projectManagerId}`}
                  project={project}
                  label={t("workflow.assignProjectManager")}
                  users={assignableUsers.projectManagers}
                  assignmentType="projectManager"
                  emptyError={t("workflow.selectProjectManager")}
                  fallbackError={t("workflow.assignProjectManagerError")}
                  onAssigned={onAssigned}
                />
              ) : null}

              {canAssignProjectEngineer ? (
                <QuickAssignmentSelect
                  key={`project-engineer-${project.assignments.projectEngineerId}`}
                  project={project}
                  label={t("workflow.assignProjectEngineer")}
                  users={assignableUsers.projectEngineers}
                  assignmentType="projectEngineer"
                  emptyError={t("workflow.selectProjectEngineer")}
                  fallbackError={t("workflow.assignProjectEngineerError")}
                  onAssigned={onAssigned}
                />
              ) : null}

              {canAssignSiteEngineer ? (
                <QuickAssignmentSelect
                  key={`site-engineer-${project.assignments.siteEngineerId}`}
                  project={project}
                  label={t("workflow.assignSiteEngineer")}
                  users={assignableUsers.siteEngineers}
                  assignmentType="siteEngineer"
                  emptyError={t("workflow.selectSiteEngineer")}
                  fallbackError={t("workflow.assignSiteEngineerError")}
                  onAssigned={onAssigned}
                />
              ) : null}

              <Link
                href={`/workflow/${project.id}`}
                className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
              >
                {t("common.details")}
              </Link>
              {[
                "site_engineer_assigned",
                "measurement_pending",
                "project_description_draft",
              ].includes(project.workflowStatus) ? (
                <Link
                  href={`/site-measurements/${project.id}`}
                  className="ml-2 mt-4 inline-flex h-10 items-center rounded-md bg-material-primary-container px-4 text-sm font-bold text-material-on-primary-container"
                >
                  {t("nav.siteMeasurements")}
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}

function OverallProjectStatus({ project }: { project: WorkflowProject }) {
  const { t, term } = useI18n();
  const currentStage = workflowStageForStatus(project.workflowStatus);
  const completedCount = completedStageCount(project.workflowStatus);
  const owner = assignmentOwner(project);

  return (
    <SectionCard title={t("workflow.projectOverallStatus")}>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("workflow.overallStatus")}
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <OverallStatusBlock project={project} />
            <span className="rounded-md border border-border bg-surface px-3 py-1 text-sm font-bold text-muted-strong">
              {term(currentStage)}
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {term(project.nextRequiredAction)}
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <InfoCell label={t("workflow.assignedTo")} value={owner ? term(owner) : t("common.notAdded")} />
          <InfoCell label={t("workflow.nextStage")} value={term(nextStageForStatus(project.workflowStatus))} />
          <InfoCell
            label={t("workflow.workflowProgress")}
            value={t("workflow.stagesComplete", {
              completed: completedCount,
              total: workflowStages.length,
            })}
          />
          <InfoCell label={t("workflow.projectStatus")} value={term(project.projectStatus)} />
        </dl>
      </div>
    </SectionCard>
  );
}

function queueProjectHref(
  project: WorkflowProject,
  target: "workflow" | "measurements",
) {
  return target === "measurements"
    ? `/site-measurements/${project.id}`
    : `/workflow/${project.id}`;
}

function QueueTable({
  projects,
  target,
}: {
  projects: WorkflowProject[];
  target: "workflow" | "measurements";
}) {
  const { t, term } = useI18n();
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] table-fixed divide-y divide-border text-left text-sm">
          <caption className="sr-only">{t("workflow.queue")}</caption>
          <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
            <tr>
              <th className="w-[10%] px-3 py-3">{t("projects.fields.projectNumber")}</th>
              <th className="w-[14%] px-3 py-3">{t("projects.fields.projectName")}</th>
              <th className="w-[12%] px-3 py-3">{t("projects.fields.client")}</th>
              <th className="w-[12%] px-3 py-3">{t("workflow.stage")}</th>
              <th className="w-[18%] px-3 py-3">{t("workflow.overallStatus")}</th>
              <th className="w-[10%] px-3 py-3">{t("workflow.projectManager")}</th>
              <th className="w-[10%] px-3 py-3">{t("workflow.projectEngineer")}</th>
              <th className="w-[10%] px-3 py-3">{t("workflow.siteEngineer")}</th>
              <th className="w-[14%] px-3 py-3">{t("workflow.nextAction")}</th>
              <th className="w-[8%] px-3 py-3">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project) => (
              <tr
                key={project.id}
                tabIndex={0}
                onClick={() => router.push(queueProjectHref(project, target))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(queueProjectHref(project, target));
                  }
                }}
                className="cursor-pointer bg-surface transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <td className="truncate px-3 py-4 font-bold text-primary">
                  {project.projectNumber}
                </td>
                <td className="truncate px-3 py-4 font-semibold text-foreground">
                  {project.projectName}
                </td>
                <td className="truncate px-3 py-4 text-muted-strong">
                  {project.client.name || t("common.notAdded")}
                </td>
                <td className="truncate px-3 py-4 font-semibold text-muted-strong">
                  {term(workflowStageForStatus(project.workflowStatus))}
                </td>
                <td className="px-3 py-4">
                  <OverallStatusBlock project={project} compact />
                </td>
                <td className="truncate px-3 py-4 text-muted-strong">
                  {project.assignments.projectManager || t("common.notAdded")}
                </td>
                <td className="truncate px-3 py-4 text-muted-strong">
                  {project.assignments.projectEngineer || t("common.notAdded")}
                </td>
                <td className="truncate px-3 py-4 text-muted-strong">
                  {project.assignments.siteEngineer || t("common.notAdded")}
                </td>
                <td className="px-3 py-4 text-muted-strong">
                  {term(project.nextRequiredAction)}
                </td>
                <td className="px-3 py-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(queueProjectHref(project, target));
                    }}
                    className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-white"
                  >
                    {target === "measurements" ? t("workflow.measure") : t("common.details")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueueCards({
  projects,
  target,
}: {
  projects: WorkflowProject[];
  target: "workflow" | "measurements";
}) {
  const { t, term } = useI18n();
  const isMeasurementQueue = target === "measurements";

  return (
    <div className="grid gap-3 lg:hidden">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={queueProjectHref(project, target)}
          className="rounded-lg border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {project.projectNumber}
              </p>
              <h2 className="mt-1 text-base font-bold text-foreground">
                {project.projectName}
              </h2>
              <p className="mt-1 text-sm text-muted-strong">
                {project.client.name || t("common.notAdded")}
              </p>
            </div>
            <div className="shrink-0">
              <OverallStatusBlock project={project} compact />
            </div>
          </div>
          {isMeasurementQueue ? null : (
            <p className="mt-3 text-sm font-semibold text-foreground">
              {term(project.nextRequiredAction)}
            </p>
          )}
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <InfoCell
              label={isMeasurementQueue ? t("workflow.measurementStatus") : t("workflow.currentStage")}
              value={
                isMeasurementQueue
                  ? term(project.workflowStatusLabel)
                  : term(workflowStageForStatus(project.workflowStatus))
              }
            />
            <InfoCell
              label={t("workflow.assignedTo")}
              value={assignmentOwner(project) ? term(assignmentOwner(project)) : t("common.notAdded")}
            />
          </dl>
          {isMeasurementQueue ? null : (
            <div className="mt-3">
              <StageStrip status={project.workflowStatus} compact />
            </div>
          )}
          <span className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-bold text-white">
            {isMeasurementQueue ? t("workflow.openMeasurementWizard") : t("common.details")}
          </span>
        </Link>
      ))}
    </div>
  );
}

function CommercialPanel({ project }: { project: WorkflowProject }) {
  const { formatCurrency, t, term } = useI18n();
  const { commercial } = project;

  if (commercial.visibility === "hidden") {
    return null;
  }

  if (commercial.visibility === "finance") {
    return (
      <SectionCard title={term("Finance summary")}>
        {commercial.contract ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCell
              label="Total contract value"
              value={formatCurrency(commercial.contract.contractValue)}
            />
            <InfoCell
              label="Down payment required"
              value={formatCurrency(commercial.contract.downPaymentRequired)}
            />
            <InfoCell
              label="Down payment received"
              value={formatCurrency(commercial.contract.downPaymentReceived)}
            />
            <InfoCell
              label="Remaining balance"
              value={formatCurrency(commercial.contract.remainingBalance)}
            />
            <InfoCell
              label="Final payment"
              value={commercial.contract.finalPaymentStatus}
            />
          </dl>
        ) : (
          <p className="text-sm font-semibold text-muted">
            {t("common.notAvailable")}
          </p>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title={term("Commercial summary")}>
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCell
            label="Quotation subtotal"
            value={
              commercial.quotation?.subtotal === undefined
                ? null
                : formatCurrency(commercial.quotation.subtotal)
            }
          />
          <InfoCell
            label="Line discounts"
            value={
              commercial.quotation?.lineDiscountTotal === undefined
                ? null
                : formatCurrency(commercial.quotation.lineDiscountTotal)
            }
          />
          <InfoCell
            label="Quotation discount"
            value={
              commercial.quotation?.quotationDiscountTotal === undefined
                ? null
                : formatCurrency(commercial.quotation.quotationDiscountTotal)
            }
          />
          <InfoCell
            label="Contract value"
            value={
              commercial.contract
                ? formatCurrency(commercial.contract.contractValue)
                : null
            }
          />
        </dl>

        {commercial.quotation?.items?.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-[780px] divide-y divide-border text-left text-sm">
                <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">{term("Opening")}</th>
                    <th className="px-3 py-3">{term("System")}</th>
                    <th className="px-3 py-3">{term("Area")}</th>
                    <th className="px-3 py-3">{term("Unit price")}</th>
                    <th className="px-3 py-3">{term("Discount")}</th>
                    <th className="px-3 py-3">{term("Net total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commercial.quotation.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-semibold text-foreground">
                        {item.openingCode}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {item.productSystem || t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {t("common.areaValue", { value: item.areaSqm.toFixed(2) })}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {item.discountPercent}%
                      </td>
                      <td className="px-3 py-3 font-bold text-primary">
                        {formatCurrency(item.netTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function FinancePanel({
  project,
  role,
  onFinanceAction,
}: {
  project: WorkflowProject;
  role: string;
  onFinanceAction: (
    financeAction: FinanceAction,
    downPaymentReceived: number,
    exceptionReason?: string,
  ) => Promise<void>;
}) {
  const { formatCurrency, t, term } = useI18n();
  const [receivedAmount, setReceivedAmount] = useState(
    project.commercial.contract?.downPaymentReceived ||
      project.commercial.contract?.downPaymentRequired ||
      0,
  );
  const [exceptionReason, setExceptionReason] = useState(
    project.commercial.contract?.exceptionReason ?? "",
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState<FinanceAction | null>(null);
  const canUseFinancePanel = role === "Admin" || role === "Finance / Accountant";
  const contract = project.commercial.contract;
  const canUpdateDownPayment = [
    "sales_contract_created",
    "finance_down_payment_pending",
    "finance_payment_exception",
  ].includes(project.workflowStatus);
  const canRequestFinalPayment =
    project.workflowStatus === "factory_completed" ||
    project.workflowStatus === "final_payment_requested";
  const canConfirmFinalPayment =
    project.workflowStatus === "final_payment_requested";
  const canStartFinanceFinalCheck =
    project.workflowStatus === "audit_approved";
  const canCompleteFinanceCheck =
    project.workflowStatus === "finance_final_check";

  if (!canUseFinancePanel) {
    return null;
  }

  async function handleFinanceAction(financeAction: FinanceAction) {
    setError("");
    setIsSaving(financeAction);

    try {
      await onFinanceAction(financeAction, receivedAmount, exceptionReason);
    } catch (financeError) {
      setError(
        financeError instanceof Error
          ? financeError.message
          : t("workflow.financeUpdateError"),
      );
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <SectionCard title={term("Finance Panel")}>
      {contract ? (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCell
              label="Contract total value"
              value={formatCurrency(contract.contractValue)}
            />
            <InfoCell
              label="Required down payment 50%"
              value={formatCurrency(contract.downPaymentRequired)}
            />
            <InfoCell
              label="Down payment received"
              value={formatCurrency(contract.downPaymentReceived)}
            />
            <InfoCell
              label="Remaining balance"
              value={formatCurrency(contract.remainingBalance)}
            />
            <InfoCell label="Payment status" value={contract.paymentStatus} />
            <InfoCell
              label="Final payment status"
              value={contract.finalPaymentStatus}
            />
          </dl>

          {canUpdateDownPayment ? (
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
              <label>
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  {term("Down payment received amount")}
                </span>
                <input
                  type="number"
                  min="0"
                  value={receivedAmount}
                  onChange={(event) => setReceivedAmount(Number(event.target.value))}
                  className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                />
              </label>
              <label>
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  {term("Exception note")}
                </span>
                <input
                  type="text"
                  value={exceptionReason}
                  onChange={(event) => setExceptionReason(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleFinanceAction("confirmDownPayment")}
                disabled={Boolean(isSaving)}
                className="self-end rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "confirmDownPayment"
                  ? t("common.loading")
                  : term("Confirm Down Payment")}
              </button>
              <button
                type="button"
                onClick={() => void handleFinanceAction("markPaymentException")}
                disabled={Boolean(isSaving)}
                className="self-end rounded-md border border-border bg-surface px-4 py-3 text-sm font-bold text-muted-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "markPaymentException"
                  ? t("common.loading")
                  : term("Mark Payment Exception")}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canStartFinanceFinalCheck ? (
              <button
                type="button"
                onClick={() => void handleFinanceAction("startFinanceFinalCheck")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "startFinanceFinalCheck"
                  ? t("common.loading")
                  : term("Start Finance Final Check")}
              </button>
            ) : null}
            {canCompleteFinanceCheck ? (
              <button
                type="button"
                onClick={() => void handleFinanceAction("completeFinanceCheck")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "completeFinanceCheck"
                  ? t("common.loading")
                  : term("Finance Check Completed")}
              </button>
            ) : null}
            {canRequestFinalPayment ? (
              <button
                type="button"
                onClick={() => void handleFinanceAction("requestFinalPayment")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "requestFinalPayment"
                  ? t("common.loading")
                  : term("Request Final Payment")}
              </button>
            ) : null}
            {canConfirmFinalPayment ? (
              <button
                type="button"
                onClick={() => void handleFinanceAction("confirmFinalPayment")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "confirmFinalPayment"
                  ? t("common.loading")
                  : term("Confirm Final Payment Received")}
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-semibold text-muted">
          {t("workflow.contractRequiredForFinance")}
        </p>
      )}
    </SectionCard>
  );
}

function AssignmentSelect({
  label,
  value,
  users,
  assignmentType,
  onAssigned,
}: {
  label: string;
  value: string;
  users: AssignableUser[];
  assignmentType: AssignmentType;
  onAssigned: (assignmentType: AssignmentType, assigneeId: string) => Promise<void>;
}) {
  const { t, term } = useI18n();
  const [selectedUserId, setSelectedUserId] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAssign() {
    if (!selectedUserId) {
      setError(t("workflow.selectUserFirst"));
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await onAssigned(assignmentType, selectedUserId);
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : t("workflow.assignmentSaveError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <label className="block text-xs font-bold uppercase tracking-wide text-muted">
        {term(label)}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
        >
          <option value="">{t("common.notAdded")}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={isSaving || !selectedUserId}
          className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? t("common.loading") : t("workflow.assign")}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm font-semibold text-danger-text">{error}</p>
      ) : null}
    </div>
  );
}

function AssignmentPanel({
  project,
  role,
  assignableUsers,
  onAssigned,
}: {
  project: WorkflowProject;
  role: string;
  assignableUsers: AssignableUsers;
  onAssigned: (assignmentType: AssignmentType, assigneeId: string) => Promise<void>;
}) {
  const { term } = useI18n();
  const canAssignProjectManager =
    postOperationsWorkflowEnabled &&
    (role === "Admin" || role === "Operations Manager") &&
    [
      "finance_down_payment_confirmed",
      "finance_payment_exception",
      "operations_manager_review",
    ].includes(project.workflowStatus);
  const canAssignProjectEngineer =
    postOperationsWorkflowEnabled &&
    (role === "Admin" || role === "Project Manager") &&
    project.workflowStatus === "project_manager_assigned";
  const canAssignSiteEngineer =
    postOperationsWorkflowEnabled &&
    (role === "Admin" || role === "Project Engineer") &&
    project.workflowStatus === "project_engineer_assigned";

  if (
    !canAssignProjectManager &&
    !canAssignProjectEngineer &&
    !canAssignSiteEngineer
  ) {
    return null;
  }

  return (
    <SectionCard title={term("Assignment Panel")}>
      <div className="grid gap-3 xl:grid-cols-3">
        {canAssignProjectManager ? (
          <AssignmentSelect
            key={`project-manager-${project.assignments.projectManagerId}`}
            label="Assign Project Manager"
            value={project.assignments.projectManagerId}
            users={assignableUsers.projectManagers}
            assignmentType="projectManager"
            onAssigned={onAssigned}
          />
        ) : null}
        {canAssignProjectEngineer ? (
          <AssignmentSelect
            key={`project-engineer-${project.assignments.projectEngineerId}`}
            label="Assign Project Engineer"
            value={project.assignments.projectEngineerId}
            users={assignableUsers.projectEngineers}
            assignmentType="projectEngineer"
            onAssigned={onAssigned}
          />
        ) : null}
        {canAssignSiteEngineer ? (
          <AssignmentSelect
            key={`site-engineer-${project.assignments.siteEngineerId}`}
            label="Assign Site Engineer"
            value={project.assignments.siteEngineerId}
            users={assignableUsers.siteEngineers}
            assignmentType="siteEngineer"
            onAssigned={onAssigned}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

function blankProjectDescription(): ProjectDescriptionDraft {
  return {
    aluminumSystemSummary: "",
    glassType: "",
    aluminumColor: "",
    openingNotes: "",
    technicalNotes: "",
    siteNotes: "",
    submittedAt: "",
    updatedAt: "",
  };
}

function ProjectDescriptionPanel({
  project,
  role,
  onWorkflowAction,
}: {
  project: WorkflowProject;
  role: string;
  onWorkflowAction: (
    workflowAction: WorkflowAction,
    projectDescription?: ProjectDescriptionDraft,
    auditComments?: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();
  const [description, setDescription] = useState<ProjectDescriptionDraft>(
    project.projectDescription ?? blankProjectDescription(),
  );
  const [auditComments, setAuditComments] = useState("");
  const [isSaving, setIsSaving] = useState<WorkflowAction | null>(null);
  const [error, setError] = useState("");
  const isAssignedSiteEngineer =
    role === "Site Engineer" &&
    project.assignments.siteEngineerId &&
    project.assignments.siteEngineerId.length > 0;
  const canEditDescription =
    role === "Admin" || role === "Project Engineer";
  const canManageMeasurement =
    canEditDescription || Boolean(isAssignedSiteEngineer);
  const canStartMeasurement =
    canManageMeasurement && project.workflowStatus === "site_engineer_assigned";
  const canCompleteMeasurement =
    canManageMeasurement && project.workflowStatus === "measurement_pending";
  const canSaveDescription =
    canEditDescription &&
    ["project_description_draft", "audit_rejected"].includes(
      project.workflowStatus,
    );
  const canSendToAudit = canSaveDescription;
  const canAudit = role === "Auditor" && project.workflowStatus === "audit_pending";
  const shouldShowPanel =
    canStartMeasurement ||
    canCompleteMeasurement ||
    canSaveDescription ||
    canAudit ||
    project.projectDescription ||
    project.latestAuditReview ||
    [
      "site_engineer_assigned",
      "measurement_pending",
      "project_description_draft",
      "audit_pending",
      "audit_rejected",
      "audit_approved",
    ].includes(project.workflowStatus);

  if (!shouldShowPanel) {
    return null;
  }

  function updateDescription(
    field: keyof ProjectDescriptionDraft,
    value: string,
  ) {
    setDescription((current) => ({ ...current, [field]: value }));
  }

  async function runAction(workflowAction: WorkflowAction) {
    setError("");
    setIsSaving(workflowAction);

    try {
      await onWorkflowAction(workflowAction, description, auditComments);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("workflow.workflowActionError"),
      );
    } finally {
      setIsSaving(null);
    }
  }

  const fields: Array<{
    key: keyof ProjectDescriptionDraft;
    label: string;
    rows: number;
  }> = [
    {
      key: "aluminumSystemSummary",
      label: "Aluminum system summary",
      rows: 3,
    },
    { key: "glassType", label: "Glass type", rows: 2 },
    { key: "aluminumColor", label: "Aluminum color", rows: 2 },
    { key: "openingNotes", label: "Opening notes", rows: 3 },
    { key: "technicalNotes", label: "Technical notes", rows: 3 },
    { key: "siteNotes", label: "Site notes", rows: 3 },
  ];

  return (
    <SectionCard title={term("Project Description & Audit")}>
      <div className="space-y-4">
        {canStartMeasurement ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void runAction("startMeasurement")}
              disabled={Boolean(isSaving)}
              className="material-button-filled"
            >
              {isSaving === "startMeasurement"
                ? t("common.loading")
                : term("Start Detailed Measurement")}
            </button>
            {role === "Site Engineer" ? (
              <Link
                href={`/site-measurements/${project.id}`}
                className="material-button-tonal"
              >
                {term("Mobile measurement page")}
              </Link>
            ) : null}
          </div>
        ) : null}

        {canCompleteMeasurement ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void runAction("completeMeasurement")}
              disabled={Boolean(isSaving)}
              className="material-button-filled"
            >
              {isSaving === "completeMeasurement"
                ? t("common.loading")
                : term("Detailed Measurement Completed")}
            </button>
            {role === "Site Engineer" ? (
              <Link
                href={`/site-measurements/${project.id}`}
                className="material-button-tonal"
              >
                {term("Mobile measurement page")}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {term(field.label)}
              </span>
              <textarea
                value={description[field.key]}
                onChange={(event) =>
                  updateDescription(field.key, event.target.value)
                }
                rows={field.rows}
                readOnly={!canSaveDescription}
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground read-only:bg-surface-muted"
              />
            </label>
          ))}
        </div>

        {project.latestAuditReview ? (
          <div className="rounded-lg border border-border bg-surface-muted p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {term("Latest audit review")}
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">
              {project.latestAuditReview.decision}
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-strong">
              {project.latestAuditReview.comments || t("common.notAdded")}
            </p>
          </div>
        ) : null}

        {canSaveDescription ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction("saveProjectDescription")}
              disabled={Boolean(isSaving)}
              className="rounded-md border border-border bg-surface px-4 py-3 text-sm font-bold text-muted-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "saveProjectDescription"
                ? t("common.loading")
                : term("Save Description")}
            </button>
            {canSendToAudit ? (
              <button
                type="button"
                onClick={() => void runAction("sendDescriptionToAudit")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "sendDescriptionToAudit"
                  ? t("common.loading")
                  : term("Send To Audit")}
              </button>
            ) : null}
          </div>
        ) : null}

        {canAudit ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {term("Audit comments")}
              </span>
              <textarea
                value={auditComments}
                onChange={(event) => setAuditComments(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runAction("approveAudit")}
                disabled={Boolean(isSaving)}
                className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "approveAudit" ? t("common.loading") : term("Approve")}
              </button>
              <button
                type="button"
                onClick={() => void runAction("rejectAudit")}
                disabled={Boolean(isSaving)}
                className="rounded-md border border-border bg-surface px-4 py-3 text-sm font-bold text-muted-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving === "rejectAudit"
                  ? t("common.loading")
                  : term("Reject with Comments")}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function BranchFactoryPanel({
  project,
  role,
  onWorkflowAction,
}: {
  project: WorkflowProject;
  role: string;
  onWorkflowAction: (
    workflowAction: WorkflowAction,
    projectDescription?: ProjectDescriptionDraft,
    auditComments?: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();
  const [isSaving, setIsSaving] = useState<WorkflowAction | null>(null);
  const [error, setError] = useState("");
  const canBranchApprove =
    (role === "Admin" || role === "Branch Manager") &&
    project.workflowStatus === "branch_manager_review";
  const canMarkSentToFactory =
    (role === "Admin" || role === "Project Engineer") &&
    project.workflowStatus === "approved_for_factory";
  const canMarkFactoryInProgress =
    (role === "Admin" || role === "Project Engineer") &&
    project.workflowStatus === "sent_to_factory";
  const canMarkFactoryCompleted =
    (role === "Admin" || role === "Project Engineer") &&
    project.workflowStatus === "factory_in_progress";
  const shouldShowPanel = [
    "branch_manager_review",
    "approved_for_factory",
    "sent_to_factory",
    "factory_in_progress",
    "factory_completed",
  ].includes(project.workflowStatus);

  if (!shouldShowPanel) {
    return null;
  }

  async function runAction(workflowAction: WorkflowAction) {
    setError("");
    setIsSaving(workflowAction);

    try {
      await onWorkflowAction(workflowAction);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("workflow.workflowActionError"),
      );
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <SectionCard title={term("Branch Approval & Factory")}>
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCell label="Current stage" value={project.workflowStatusLabel} />
          <InfoCell label="Next action" value={project.nextRequiredAction} />
          <InfoCell
            label="Project engineer"
            value={project.assignments.projectEngineer}
          />
          <InfoCell label="Factory access" value={term("Tracked by system users only")} />
        </dl>

        <div className="flex flex-wrap gap-2">
          {canBranchApprove ? (
            <button
              type="button"
              onClick={() => void runAction("approveForFactory")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "approveForFactory"
                ? t("common.loading")
                : term("Approve Sending To Factory")}
            </button>
          ) : null}
          {canMarkSentToFactory ? (
            <button
              type="button"
              onClick={() => void runAction("markSentToFactory")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markSentToFactory"
                ? t("common.loading")
                : term("Sent to Factory")}
            </button>
          ) : null}
          {canMarkFactoryInProgress ? (
            <button
              type="button"
              onClick={() => void runAction("markFactoryInProgress")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markFactoryInProgress"
                ? t("common.loading")
                : term("Factory In Progress")}
            </button>
          ) : null}
          {canMarkFactoryCompleted ? (
            <button
              type="button"
              onClick={() => void runAction("markFactoryCompleted")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markFactoryCompleted"
                ? t("common.loading")
                : term("Factory Completed")}
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function DeliveryInstallationPanel({
  project,
  role,
  onWorkflowAction,
}: {
  project: WorkflowProject;
  role: string;
  onWorkflowAction: (
    workflowAction: WorkflowAction,
    projectDescription?: ProjectDescriptionDraft,
    auditComments?: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();
  const [isSaving, setIsSaving] = useState<WorkflowAction | null>(null);
  const [error, setError] = useState("");
  const canPrepareDelivery =
    (role === "Admin" || role === "Delivery Head") &&
    project.workflowStatus === "final_payment_received";
  const canMarkDelivered =
    (role === "Admin" || role === "Delivery Head") &&
    project.workflowStatus === "delivery_pending";
  const canStartInstallation =
    (role === "Admin" || role === "Project Manager") &&
    project.workflowStatus === "delivered";
  const canCompleteInstallation =
    (role === "Admin" || role === "Project Manager") &&
    project.workflowStatus === "installation_in_progress";
  const shouldShowPanel = [
    "final_payment_received",
    "delivery_pending",
    "delivered",
    "installation_in_progress",
    "installation_completed",
  ].includes(project.workflowStatus);

  if (!shouldShowPanel) {
    return null;
  }

  async function runAction(workflowAction: WorkflowAction) {
    setError("");
    setIsSaving(workflowAction);

    try {
      await onWorkflowAction(workflowAction);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("workflow.workflowActionError"),
      );
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <SectionCard title={term("Delivery & Installation")}>
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCell label="Current stage" value={project.workflowStatusLabel} />
          <InfoCell label="Next action" value={project.nextRequiredAction} />
          <InfoCell
            label="Project manager"
            value={project.assignments.projectManager}
          />
          <InfoCell label="Team access" value={term("Updated by heads/managers only")} />
        </dl>

        <div className="flex flex-wrap gap-2">
          {canPrepareDelivery ? (
            <button
              type="button"
              onClick={() => void runAction("markDeliveryPending")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markDeliveryPending"
                ? t("common.loading")
                : term("Prepare Delivery")}
            </button>
          ) : null}
          {canMarkDelivered ? (
            <button
              type="button"
              onClick={() => void runAction("markDelivered")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markDelivered"
                ? t("common.loading")
                : term("Delivered")}
            </button>
          ) : null}
          {canStartInstallation ? (
            <button
              type="button"
              onClick={() => void runAction("markInstallationInProgress")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markInstallationInProgress"
                ? t("common.loading")
                : term("Installation In Progress")}
            </button>
          ) : null}
          {canCompleteInstallation ? (
            <button
              type="button"
              onClick={() => void runAction("markInstallationCompleted")}
              disabled={Boolean(isSaving)}
              className="rounded-md bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving === "markInstallationCompleted"
                ? t("common.loading")
                : term("Installation Completed")}
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function ProjectDetail({
  project,
  role,
  assignableUsers,
  backHref,
  onAssigned,
  onFinanceAction,
  onWorkflowAction,
}: {
  project: WorkflowProject;
  role: string;
  assignableUsers: AssignableUsers;
  backHref: string;
  onAssigned: (assignmentType: AssignmentType, assigneeId: string) => Promise<void>;
  onFinanceAction: (
    financeAction: FinanceAction,
    downPaymentReceived: number,
    exceptionReason?: string,
  ) => Promise<void>;
  onWorkflowAction: (
    workflowAction: WorkflowAction,
    projectDescription?: ProjectDescriptionDraft,
    auditComments?: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link
          href={backHref}
          className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong"
        >
          {t("common.back")}
        </Link>
      </div>

      <OverallProjectStatus project={project} />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title={term("Project overview")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <InfoCell label="Project number" value={project.projectNumber} />
            <InfoCell label="Project name" value={project.projectName} />
            <InfoCell label="Client" value={project.client.name} />
            <InfoCell label="Project type" value={project.projectType} />
            <InfoCell label="Address" value={project.address || project.client.address} />
            <InfoCell
              label="Current workflow status"
              value={project.workflowStatusLabel}
            />
            <InfoCell label="Project status" value={project.projectStatus} />
          </dl>
        </SectionCard>

        <SectionCard title={term("Assignments")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <InfoCell label="Sales engineer" value={project.assignments.salesEngineer} />
            <InfoCell label="Project manager" value={project.assignments.projectManager} />
            <InfoCell label="Project engineer" value={project.assignments.projectEngineer} />
            <InfoCell label="Site engineer" value={project.assignments.siteEngineer} />
            <InfoCell label="Next action" value={project.nextRequiredAction} />
          </dl>
        </SectionCard>
      </section>

      <SectionCard title={term("Project location")}>
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <InfoCell label="Address" value={project.address || project.client.address} />
            <InfoCell label="Latitude" value={project.locationLatitude} />
            <InfoCell label="Longitude" value={project.locationLongitude} />
            <InfoCell
              label="Geofence radius"
              value={t("workflow.metersValue", { value: project.geofenceRadiusMeters })}
            />
          </dl>
          <ProjectLocationPicker
            latitude={project.locationLatitude}
            longitude={project.locationLongitude}
            geofenceRadiusMeters={project.geofenceRadiusMeters}
            onChange={() => undefined}
            readOnly
          />
        </div>
      </SectionCard>

      <SectionCard title={term("Status tracker")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusPill status={project.workflowStatusLabel} />
          <span className="rounded-md border border-border bg-surface-muted px-3 py-1 text-sm font-bold text-muted-strong">
            {term(workflowStageForStatus(project.workflowStatus))}
          </span>
          <p className="text-sm font-semibold text-muted-strong">
            {term(project.nextRequiredAction)}
          </p>
        </div>
        <StageStrip status={project.workflowStatus} />
      </SectionCard>

      <AssignmentPanel
        project={project}
        role={role}
        assignableUsers={assignableUsers}
        onAssigned={onAssigned}
      />

      <FinancePanel
        project={project}
        role={role}
        onFinanceAction={onFinanceAction}
      />

      <ProjectDescriptionPanel
        key={`${project.id}-${project.workflowStatus}-${project.projectDescription?.updatedAt ?? "new"}-${project.latestAuditReview?.id ?? "no-review"}`}
        project={project}
        role={role}
        onWorkflowAction={onWorkflowAction}
      />

      <BranchFactoryPanel
        project={project}
        role={role}
        onWorkflowAction={onWorkflowAction}
      />

      <DeliveryInstallationPanel
        project={project}
        role={role}
        onWorkflowAction={onWorkflowAction}
      />

      <SectionCard title={term("Technical information")}>
        {project.openings.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] divide-y divide-border text-left text-sm">
                <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">{term("Opening")}</th>
                    <th className="px-3 py-3">{term("Location")}</th>
                    <th className="px-3 py-3">{term("Dimensions")}</th>
                    <th className="px-3 py-3">{term("Shape")}</th>
                    <th className="px-3 py-3">{term("Type")}</th>
                    <th className="px-3 py-3">{term("Bottom frame")}</th>
                    <th className="px-3 py-3">{term("Opening direction")}</th>
                    <th className="px-3 py-3">{term("Glass color")}</th>
                    <th className="px-3 py-3">{term("Solid panel height")}</th>
                    <th className="px-3 py-3">{term("Fixed height")}</th>
                    <th className="px-3 py-3">{term("Notes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {project.openings.map((opening) => (
                    <tr key={opening.id}>
                      <td className="px-3 py-3 font-semibold text-foreground">
                        {opening.openingCode}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {[opening.floor, opening.room].filter(Boolean).join(" - ") ||
                          t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {t("workflow.dimensionsValue", { width: opening.width, height: opening.height })}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.shape ? term(opening.shape) : t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.openingType || opening.productSystem
                          ? term(opening.openingType || opening.productSystem)
                          : t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.bottomFrame ? term(opening.bottomFrame) : t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.openingDirection ? term(opening.openingDirection) : t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.glassColor || opening.aluminumColor
                          ? term(opening.glassColor || opening.aluminumColor)
                          : t("common.notAdded")}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.solidPanelHeight}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.fixedHeight}
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {opening.notes || t("common.notAdded")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-muted">
            {t("common.notAvailable")}
          </p>
        )}
      </SectionCard>

      <CommercialPanel project={project} />
    </div>
  );
}

export function WorkflowModule({
  projectId,
  queueTitle,
  queueDescription,
  focusStatuses,
  showSummaryCards = true,
  showProjectStatusCards = false,
  queueTarget = "workflow",
  emptyTitle,
  emptyDescription,
  detailEyebrow = "Projects",
  detailFallbackTitle = "Project details",
  detailDescription = "Review project status, assignments, technical scope, and permitted commercial visibility.",
  detailBackHref = "/projects",
}: WorkflowModuleProps) {
  const { t, term } = useI18n();
  const [role, setRole] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<AssignableUsers>({
    projectManagers: [],
    projectEngineers: [],
    siteEngineers: [],
  });
  const [projects, setProjects] = useState<WorkflowProject[]>([]);
  const [project, setProject] = useState<WorkflowProject | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkflow = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const response = await fetch(`/api/workflow${query}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as WorkflowResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? t("workflow.loadError"));
      }

      setRole(body?.role ?? "");
      setAssignableUsers({
        projectManagers: body?.assignableUsers?.projectManagers ?? [],
        projectEngineers: body?.assignableUsers?.projectEngineers ?? [],
        siteEngineers: body?.assignableUsers?.siteEngineers ?? [],
      });
      setProjects(body?.projects ?? []);
      setProject(body?.project ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("workflow.loadError"));
      setProjects([]);
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  async function assignUserForProject(
    targetProjectId: string,
    assignmentType: AssignmentType,
    assigneeId: string,
  ) {
    const response = await fetch("/api/workflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: targetProjectId,
        assignmentType,
        assigneeId,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? t("workflow.assignmentSaveError"));
    }

    await loadWorkflow();
  }

  async function assignUser(
    assignmentType: AssignmentType,
    assigneeId: string,
  ) {
    if (!projectId) {
      return;
    }

    await assignUserForProject(projectId, assignmentType, assigneeId);
  }

  async function updateFinance(
    financeAction: FinanceAction,
    downPaymentReceived: number,
    exceptionReason?: string,
  ) {
    if (!projectId) {
      return;
    }

    const response = await fetch("/api/workflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        financeAction,
        downPaymentReceived,
        exceptionReason,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? t("workflow.financeUpdateError"));
    }

    await loadWorkflow();
  }

  async function updateWorkflowAction(
    workflowAction: WorkflowAction,
    projectDescription?: ProjectDescriptionDraft,
    auditComments?: string,
  ) {
    if (!projectId) {
      return;
    }

    const response = await fetch("/api/workflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        workflowAction,
        projectDescription,
        auditComments,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? t("workflow.workflowActionError"));
    }

    await loadWorkflow();
  }

  const visibleProjects = useMemo(() => {
    if (!focusStatuses?.length) {
      return projects;
    }

    return projects.filter((workflowProject) =>
      focusStatuses.includes(workflowProject.workflowStatus),
    );
  }, [focusStatuses, projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={projectId ? term(detailEyebrow) : term("Workflow")}
        title={
          projectId
            ? project
              ? term(project.projectName)
              : term(detailFallbackTitle)
            : term(queueTitle ?? "Workflow queue")
        }
        description={
          projectId
            ? term(detailDescription)
            : term(
                queueDescription ??
                  "Track projects from sales handoff through delivery and installation.",
              )
        }
      />

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <SectionCard title={t("common.loading")}>
          <p className="text-sm font-semibold text-muted">{t("workflow.loading")}</p>
        </SectionCard>
      ) : projectId ? (
        project ? (
          <ProjectDetail
            project={project}
            role={role}
            assignableUsers={assignableUsers}
            backHref={detailBackHref}
            onAssigned={assignUser}
            onFinanceAction={updateFinance}
            onWorkflowAction={updateWorkflowAction}
          />
        ) : (
          <SectionCard title={t("workflow.projectNotFound")}>
            <p className="text-sm font-semibold text-muted">
              {t("workflow.projectNotAvailable")}
            </p>
          </SectionCard>
        )
      ) : visibleProjects.length ? (
        <>
          {showSummaryCards ? <SummaryCards projects={visibleProjects} /> : null}
          {showProjectStatusCards ? (
            <ProjectStatusCards
              projects={visibleProjects}
              role={role}
              assignableUsers={assignableUsers}
              onAssigned={assignUserForProject}
            />
          ) : null}
          <div className="hidden lg:block">
            <QueueTable projects={visibleProjects} target={queueTarget} />
          </div>
          <QueueCards projects={visibleProjects} target={queueTarget} />
        </>
      ) : (
        <SectionCard title={term(emptyTitle ?? "No workflow projects")}>
          <p className="text-sm font-semibold text-muted">
            {term(emptyDescription ?? "No projects are currently available for your role.")}
          </p>
        </SectionCard>
      )}
    </div>
  );
}
