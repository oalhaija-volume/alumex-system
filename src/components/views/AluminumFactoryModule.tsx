"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Project = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string;
  address: string;
  workflow_status: string;
  created_at: string;
  updated_at: string;
  clients: {
    client_name: string;
    mobile: string | null;
    email: string | null;
  };
};

type StatusColor = {
  bg: string;
  text: string;
  badge: string;
  border: string;
};

const statusConfig: Record<string, { label: string; color: StatusColor; actions?: string[] }> = {
  approved_for_factory: {
    label: "Approved for Factory",
    color: {
      bg: "bg-info-surface",
      text: "text-info-text",
      badge: "bg-material-primary-container text-material-on-primary-container",
      border: "border-l-material-primary",
    },
    actions: ["sent_to_factory"],
  },
  sent_to_factory: {
    label: "Sent to Factory",
    color: {
      bg: "bg-warning-surface",
      text: "text-warning-text",
      badge: "bg-warning-surface text-warning-text",
      border: "border-l-warning-text",
    },
    actions: ["factory_in_progress"],
  },
  factory_in_progress: {
    label: "In Progress",
    color: {
      bg: "bg-warning-surface",
      text: "text-warning-text",
      badge: "bg-warning-surface text-warning-text",
      border: "border-l-warning-text",
    },
    actions: ["factory_completed"],
  },
  factory_completed: {
    label: "Completed",
    color: {
      bg: "bg-success-surface",
      text: "text-success-text",
      badge: "bg-success-surface text-success-text",
      border: "border-l-success-text",
    },
    actions: [],
  },
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function AluminumFactoryModule() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const fetchProjects = useCallback(async () => {
    const url = selectedStatus === "all" 
      ? "/api/factory/projects"
      : `/api/factory/projects?status=${selectedStatus}`;
    
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      const message = await readError(response, "Failed to load projects");
      throw new Error(message);
    }

    return (await response.json()) as Project[];
  }, [selectedStatus]);

  const loadProjects = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      setProjects(await fetchProjects());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load projects",
      );
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  async function handleStatusChange(projectId: string, newStatus: string) {
    setError("");
    setUpdatingId(projectId);

    try {
      const response = await fetch("/api/factory/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          newStatus,
        }),
      });

      if (!response.ok) {
        const message = await readError(response, "Failed to update project");
        throw new Error(message);
      }

      await loadProjects();
      setNotice(`Project ${newStatus === "factory_completed" ? "marked as completed" : "status updated"}`);
      setTimeout(() => setNotice(""), 3000);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update project",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Aluminum Factory Dashboard</h1>
        <p className="mt-1 text-muted">Track and manage production status</p>
      </div>

      {/* Error and Notice */}
      {error && (
        <div className="material-alert-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="material-alert-success">
          {notice}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedStatus("all")}
          className={
            selectedStatus === "all"
              ? "material-button-filled"
              : "material-button-tonal"
          }
        >
          All
        </button>
        {Object.entries(statusConfig).map(([status, config]) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={
              selectedStatus === status
                ? "material-button-filled"
                : "material-button-tonal"
            }
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {projects.map((project) => {
          const config = statusConfig[project.workflow_status] || {
            label: project.workflow_status,
            color: {
              bg: "bg-material-surface-container",
              text: "text-muted-strong",
              badge: "bg-material-surface-container-high text-muted-strong",
              border: "border-l-material-outline",
            },
          };

          return (
            <div
              key={project.id}
              className={`material-card border-l-4 p-6 ${config.color.bg} ${config.color.border}`}
            >
              {/* Project Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{project.project_name}</h3>
                  <p className="text-sm text-muted">#{project.project_number}</p>
                </div>
                <span className={`material-status ${config.color.badge}`}>
                  {config.label}
                </span>
              </div>

              {/* Project Details */}
              <div className="space-y-2 mb-4 text-sm">
                <div>
                  <p className="text-muted">Client</p>
                  <p className="font-semibold">{project.clients.client_name}</p>
                </div>
                <div>
                  <p className="text-muted">Location</p>
                  <p className="font-semibold">{project.address || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-muted">Contact</p>
                  <p className="text-sm">{project.clients.mobile || project.clients.email || "N/A"}</p>
                </div>
              </div>

              {/* Actions */}
              {config.actions && config.actions.length > 0 && (
                <div className="flex gap-2">
                  {config.actions.map((action) => {
                    const actionLabel = statusConfig[action]?.label || action;
                    return (
                      <button
                        key={action}
                        onClick={() => handleStatusChange(project.id, action)}
                        disabled={updatingId === project.id}
                        className={`flex-1 ${
                          updatingId === project.id
                            ? "material-button-tonal cursor-not-allowed"
                            : action === "factory_completed"
                            ? "material-button-filled"
                            : "material-button-tonal"
                        }`}
                      >
                        {updatingId === project.id ? "Updating..." : `Mark as ${actionLabel.split(" ").pop()}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {(!config.actions || config.actions.length === 0) && (
                <div className="py-2 text-center text-sm text-muted">
                  No further actions available
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="material-card-muted py-12 text-center">
          <p className="text-lg text-muted-strong">No projects available</p>
          <p className="mt-1 text-sm text-muted">
            {selectedStatus === "all"
              ? "Projects will appear here once they are approved for factory production"
              : "No projects with this status"}
          </p>
        </div>
      )}
    </div>
  );
}
