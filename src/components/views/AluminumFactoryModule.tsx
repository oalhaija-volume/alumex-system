"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Project = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string;
  address: string;
  project_workflow_status: string;
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
};

const statusConfig: Record<string, { label: string; color: StatusColor; actions?: string[] }> = {
  approved_for_factory: {
    label: "Approved for Factory",
    color: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-800" },
    actions: ["sent_to_factory"],
  },
  sent_to_factory: {
    label: "Sent to Factory",
    color: { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-800" },
    actions: ["factory_in_progress"],
  },
  factory_in_progress: {
    label: "In Progress",
    color: { bg: "bg-yellow-50", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-800" },
    actions: ["factory_completed"],
  },
  factory_completed: {
    label: "Completed",
    color: { bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100 text-green-800" },
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
  const { t, formatDate } = useI18n();
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

  async function loadProjects() {
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
  }

  useEffect(() => {
    loadProjects();
  }, [selectedStatus]);

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
        <p className="text-gray-600 mt-1">Track and manage production status</p>
      </div>

      {/* Error and Notice */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {notice}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedStatus("all")}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            selectedStatus === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          All
        </button>
        {Object.entries(statusConfig).map(([status, config]) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedStatus === status
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {projects.map((project) => {
          const config = statusConfig[project.project_workflow_status] || {
            label: project.project_workflow_status,
            color: { bg: "bg-gray-50", text: "text-gray-700", badge: "bg-gray-100 text-gray-800" },
          };

          return (
            <div
              key={project.id}
              className={`${config.color.bg} border-l-4 rounded-lg p-6 ${
                config.color.text === "text-blue-700"
                  ? "border-l-blue-500"
                  : config.color.text === "text-orange-700"
                  ? "border-l-orange-500"
                  : config.color.text === "text-yellow-700"
                  ? "border-l-yellow-500"
                  : "border-l-green-500"
              }`}
            >
              {/* Project Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{project.project_name}</h3>
                  <p className="text-sm text-gray-600">#{project.project_number}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color.badge}`}>
                  {config.label}
                </span>
              </div>

              {/* Project Details */}
              <div className="space-y-2 mb-4 text-sm">
                <div>
                  <p className="text-gray-600">Client</p>
                  <p className="font-semibold">{project.clients.client_name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Location</p>
                  <p className="font-semibold">{project.address || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-gray-600">Contact</p>
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
                        className={`flex-1 px-3 py-2 rounded-lg font-medium transition text-sm ${
                          updatingId === project.id
                            ? "bg-gray-400 text-white cursor-not-allowed"
                            : action === "factory_completed"
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {updatingId === project.id ? "Updating..." : `Mark as ${actionLabel.split(" ").pop()}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {(!config.actions || config.actions.length === 0) && (
                <div className="text-center py-2 text-gray-500 text-sm">
                  No further actions available
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">No projects available</p>
          <p className="text-gray-500 text-sm mt-1">
            {selectedStatus === "all"
              ? "Projects will appear here once they are approved for factory production"
              : "No projects with this status"}
          </p>
        </div>
      )}
    </div>
  );
}
