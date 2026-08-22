"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { StatusPill } from "@/components/StatusPill";

type OperationsProject = {
  id: string;
  projectNumber: string;
  projectName: string;
  branch: "Rasafa" | "Karkh" | null;
  projectType: string;
  address: string;
  clientName: string;
  salesOwner: string;
  paymentStatus:
    | "Awaiting down payment"
    | "Payment received"
    | "Finance exception approved";
  canComplete: boolean;
  isCompleted: boolean;
  openings: Array<{
    id: string;
    openingCode: string;
    floor: string;
    room: string;
    openingType: string;
    readiness: "ready" | "not_ready";
    width: number;
    height: number;
    quantity: number;
    area: number;
  }>;
};

function ProjectSummary({ project }: { project: OperationsProject }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Client", project.clientName],
        ["Branch", project.branch ?? "Not assigned"],
        ["Sales owner", project.salesOwner],
        ["Project type", project.projectType],
        ["Address", project.address],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-md border border-border bg-surface-muted p-3"
        >
          <p className="text-xs font-bold uppercase text-muted">{label}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {value || "Not added"}
          </p>
        </div>
      ))}
    </div>
  );
}

function ProjectOpenings({ project }: { project: OperationsProject }) {
  if (project.openings.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-surface-muted p-4 text-sm font-semibold text-muted">
        No structural openings have been recorded for this project.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-[760px] w-full border-collapse text-start text-sm">
        <thead className="bg-surface-muted text-xs font-bold uppercase text-muted-strong">
          <tr>
            <th className="px-3 py-3 text-start">Opening</th>
            <th className="px-3 py-3 text-start">Location</th>
            <th className="px-3 py-3 text-start">Type</th>
            <th className="px-3 py-3 text-start">Readiness</th>
            <th className="px-3 py-3 text-start">Width</th>
            <th className="px-3 py-3 text-start">Height</th>
            <th className="px-3 py-3 text-start">Quantity</th>
            <th className="px-3 py-3 text-start">Area</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {project.openings.map((opening) => (
            <tr key={opening.id} className="bg-surface">
              <td className="px-3 py-3 font-bold text-foreground">
                {opening.openingCode}
              </td>
              <td className="px-3 py-3 text-muted-strong">
                {[opening.floor, opening.room].filter(Boolean).join(" · ") ||
                  "Not added"}
              </td>
              <td className="px-3 py-3 text-muted-strong">
                {opening.openingType || "Not added"}
              </td>
              <td className="px-3 py-3">
                <StatusPill
                  status={opening.readiness === "ready" ? "Ready" : "Not ready"}
                />
              </td>
              <td className="px-3 py-3 text-muted-strong">
                {opening.width > 0 ? `${opening.width} cm` : "—"}
              </td>
              <td className="px-3 py-3 text-muted-strong">
                {opening.height > 0 ? `${opening.height} cm` : "—"}
              </td>
              <td className="px-3 py-3 text-muted-strong">
                {opening.quantity}
              </td>
              <td className="px-3 py-3 font-semibold text-foreground">
                {opening.area > 0 ? `${opening.area.toFixed(2)} sqm` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationsManagerModule() {
  const [projects, setProjects] = useState<OperationsProject[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/operations/projects", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        projects?: OperationsProject[];
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load Operations projects.");
      }

      setProjects(body?.projects ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Operations projects.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  async function markCompleted(project: OperationsProject) {
    if (
      completingId ||
      !window.confirm(
        `Mark ${project.projectNumber} — ${project.projectName} as completed?`,
      )
    ) {
      return;
    }

    setCompletingId(project.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/operations/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "complete" }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to complete the project.");
      }

      setProjects((current) =>
        current.map((item) =>
          item.id === project.id ? { ...item, isCompleted: true } : item,
        ),
      );
      setNotice(`${project.projectNumber} marked completed.`);
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Unable to complete the project.",
      );
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Operations Manager"
        description="Signed projects appear here immediately. Execution remains locked until Finance confirms the down payment or approves an exception."
      />

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      <SectionCard title="Received projects">
        {isLoading ? (
          <p className="text-sm font-semibold text-muted">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
            No projects have been received from Finance.
          </p>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-lg border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted">
                      {project.projectNumber}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">
                      {project.projectName}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill status={project.paymentStatus} />
                    <StatusPill
                      status={
                        project.isCompleted
                          ? "Completed"
                          : project.canComplete
                            ? "Ready for Operations"
                            : "Handoff received"
                      }
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <ProjectSummary project={project} />
                </div>

                <section className="mt-4" aria-labelledby={`openings-${project.id}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3
                      id={`openings-${project.id}`}
                      className="text-sm font-bold text-foreground"
                    >
                      Structural openings
                    </h3>
                    <span className="text-xs font-semibold text-muted">
                      {project.openings.length} opening
                      {project.openings.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ProjectOpenings project={project} />
                </section>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void markCompleted(project)}
                    disabled={
                      project.isCompleted ||
                      !project.canComplete ||
                      completingId === project.id
                    }
                    className="h-11 rounded-md bg-primary px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {project.isCompleted
                      ? "Completed"
                      : !project.canComplete
                        ? "Awaiting Finance"
                      : completingId === project.id
                        ? "Completing..."
                        : "Mark completed"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
