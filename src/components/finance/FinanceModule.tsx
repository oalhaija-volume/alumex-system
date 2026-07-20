"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { StatusPill } from "@/components/StatusPill";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";

type FinanceAction = "confirmDownPayment" | "markPaymentException";

type FinanceProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  client: {
    name: string;
  };
  workflowStatus: ProjectWorkflowStatus;
  workflowStatusLabel: string;
  commercial: {
    contract?: {
      id: string;
      contractNumber: string;
      contractValue: number;
      downPaymentRequired: number;
      downPaymentReceived: number;
      remainingBalance: number;
      paymentStatus: string;
      finalPaymentStatus: string;
      exceptionReason: string;
    } | null;
  };
};

type WorkflowResponse = {
  role?: string;
  projects?: FinanceProject[];
  error?: string;
};

type FinanceBucket = {
  key: string;
  title: string;
  projects: FinanceProject[];
};

function isWaitingDownPayment(project: FinanceProject) {
  return (
    project.workflowStatus === "sales_contract_created" ||
    project.workflowStatus === "finance_down_payment_pending"
  );
}

function isPaymentException(project: FinanceProject) {
  return project.workflowStatus === "finance_payment_exception";
}

function isWaitingOperationsAssignment(project: FinanceProject) {
  return [
    "finance_down_payment_confirmed",
    "finance_payment_exception",
    "operations_manager_review",
  ].includes(project.workflowStatus);
}

function numberInputValue(value: number) {
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

function MoneyCell({ value }: { value: number }) {
  const { formatCurrency } = useI18n();

  return (
    <span className="whitespace-nowrap font-semibold text-foreground">
      {formatCurrency(value)}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function FinanceActionControls({
  project,
  onAction,
}: {
  project: FinanceProject;
  onAction: (
    project: FinanceProject,
    financeAction: FinanceAction,
    downPaymentReceived?: number,
    exceptionReason?: string,
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const contract = project.commercial.contract;
  const [receivedAmount, setReceivedAmount] = useState(
    numberInputValue(contract?.downPaymentReceived || contract?.downPaymentRequired || 0),
  );
  const [exceptionReason, setExceptionReason] = useState(
    contract?.exceptionReason ?? "",
  );
  const [savingAction, setSavingAction] = useState<FinanceAction | null>(null);
  const [error, setError] = useState("");

  async function runAction(financeAction: FinanceAction) {
    setError("");
    setSavingAction(financeAction);

    try {
      await onAction(
        project,
        financeAction,
        Number(receivedAmount || 0),
        exceptionReason,
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to save finance update.",
      );
    } finally {
      setSavingAction(null);
    }
  }

  if (!contract) {
    return <span className="text-sm font-semibold text-muted">No contract</span>;
  }

  return (
    <div className="min-w-[260px] space-y-2">
      {isWaitingDownPayment(project) ? (
        <>
          <input
            type="number"
            min="0"
            value={receivedAmount}
            onChange={(event) => setReceivedAmount(event.target.value)}
            aria-label="Down payment received amount"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
            placeholder="Down payment received"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(savingAction)}
              onClick={() => void runAction("confirmDownPayment")}
              className="h-9 rounded-md bg-primary px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAction === "confirmDownPayment"
                ? t("common.loading")
                : "Confirm Down Payment"}
            </button>
            <button
              type="button"
              disabled={Boolean(savingAction)}
              onClick={() => void runAction("markPaymentException")}
              className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAction === "markPaymentException"
                ? t("common.loading")
                : "Payment Exception"}
            </button>
          </div>
          <input
            type="text"
            value={exceptionReason}
            onChange={(event) => setExceptionReason(event.target.value)}
            aria-label="Payment exception note"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground"
            placeholder="Exception note"
          />
        </>
      ) : null}

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-2 py-1 text-xs font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FinanceTable({
  title,
  projects,
  onAction,
}: {
  title: string;
  projects: FinanceProject[];
  onAction: (
    project: FinanceProject,
    financeAction: FinanceAction,
    downPaymentReceived?: number,
    exceptionReason?: string,
  ) => Promise<void>;
}) {
  const { t, term } = useI18n();

  return (
    <SectionCard title={title}>
      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          No projects in this finance stage.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase tracking-wide text-muted">
                <th className="border-b border-border px-3 py-3">Project</th>
                <th className="border-b border-border px-3 py-3">Client</th>
                <th className="border-b border-border px-3 py-3">Contract</th>
                <th className="border-b border-border px-3 py-3">Total value</th>
                <th className="border-b border-border px-3 py-3">Required 50%</th>
                <th className="border-b border-border px-3 py-3">Received</th>
                <th className="border-b border-border px-3 py-3">Remaining</th>
                <th className="border-b border-border px-3 py-3">Payment</th>
                <th className="border-b border-border px-3 py-3">Workflow</th>
                <th className="border-b border-border px-3 py-3">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const contract = project.commercial.contract;

                return (
                  <tr key={project.id} className="align-top">
                    <td className="border-b border-border px-3 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-bold text-primary hover:underline"
                      >
                        {project.projectNumber}
                      </Link>
                      <p className="mt-1 font-semibold text-foreground">
                        {term(project.projectName)}
                      </p>
                    </td>
                    <td className="border-b border-border px-3 py-3 font-semibold text-foreground">
                      {term(project.client.name)}
                    </td>
                    <td className="border-b border-border px-3 py-3 font-semibold text-foreground">
                      {contract?.contractNumber ?? t("common.notAvailable")}
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <MoneyCell value={contract?.contractValue ?? 0} />
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <MoneyCell value={contract?.downPaymentRequired ?? 0} />
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <MoneyCell value={contract?.downPaymentReceived ?? 0} />
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <MoneyCell value={contract?.remainingBalance ?? 0} />
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <p className="font-semibold text-foreground">
                        {contract?.paymentStatus ?? t("common.notAvailable")}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {contract?.finalPaymentStatus ?? t("common.notAvailable")}
                      </p>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <StatusPill status={project.workflowStatus} />
                      <p className="mt-2 text-xs font-semibold text-muted">
                        {project.workflowStatusLabel}
                      </p>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <div className="flex flex-col gap-3">
                        <FinanceActionControls
                          project={project}
                          onAction={onAction}
                        />
                        <Link
                          href={`/projects/${project.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong hover:bg-surface-muted"
                        >
                          {t("common.details")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function FinanceModule() {
  const [projects, setProjects] = useState<FinanceProject[]>([]);
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadFinance = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/workflow", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as WorkflowResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load finance projects.");
      }

      setRole(body?.role ?? "");
      setProjects(
        (body?.projects ?? []).filter(
          (project) =>
            project.commercial.contract &&
            (isWaitingDownPayment(project) ||
              isPaymentException(project) ||
              isWaitingOperationsAssignment(project)),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load finance projects.",
      );
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFinance();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadFinance]);

  async function updateFinance(
    project: FinanceProject,
    financeAction: FinanceAction,
    downPaymentReceived?: number,
    exceptionReason?: string,
  ) {
    const response = await fetch("/api/workflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        financeAction,
        downPaymentReceived,
        exceptionReason,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Unable to save finance update.");
    }

    await loadFinance();
  }

  const buckets = useMemo<FinanceBucket[]>(
    () => [
      {
        key: "down-payment",
        title: "Waiting Down Payment",
        projects: projects.filter(isWaitingDownPayment),
      },
      {
        key: "exceptions",
        title: "Payment Exception",
        projects: projects.filter(isPaymentException),
      },
      {
        key: "operations-assignment",
        title: "Waiting for Operations Assignment",
        projects: projects.filter(isWaitingOperationsAssignment),
      },
    ],
    [projects],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Finance Dashboard"
        description="Confirm down payments and payment exceptions, then hand projects to Operations Manager."
      />

      {role && role !== "Admin" && role !== "Finance / Accountant" ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          Finance access is required.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {buckets.map((bucket) => (
          <SummaryCard
            key={bucket.key}
            label={bucket.title}
            value={bucket.projects.length}
          />
        ))}
      </section>

      {isLoading ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-sm font-semibold text-muted">
          Loading finance projects...
        </p>
      ) : (
        buckets.map((bucket) => (
          <FinanceTable
            key={bucket.key}
            title={bucket.title}
            projects={bucket.projects}
            onAction={updateFinance}
          />
        ))
      )}
    </div>
  );
}
