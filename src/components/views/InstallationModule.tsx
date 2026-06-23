"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type InstallationTeam = {
  id: string;
  team_head_name: string;
  labor_count: number;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

type InstallationAssignment = {
  id: string;
  project_id: string;
  installation_team_id: string;
  status: string;
  completion_date: string | null;
  notes: string | null;
  created_at: string;
  projects: {
    id: string;
    project_number: string;
    project_name: string;
    address: string;
    clients: {
      client_name: string;
      mobile: string | null;
      email: string | null;
    };
  };
  installation_teams: InstallationTeam;
};

type Project = {
  id: string;
  project_number: string;
  project_name: string;
  address: string;
  workflow_status: string;
  clients: {
    client_name: string;
    mobile: string | null;
    email: string | null;
  };
};

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

export function InstallationModule() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<InstallationTeam[]>([]);
  const [assignments, setAssignments] = useState<InstallationAssignment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [projectsRes, teamsRes, assignmentsRes] = await Promise.all([
        fetch("/api/installation/projects", { cache: "no-store" }),
        fetch("/api/admin/installation-teams", { cache: "no-store" }),
        fetch("/api/installation/assignments", { cache: "no-store" }),
      ]);

      if (!projectsRes.ok || !assignmentsRes.ok) {
        throw new Error("Failed to load installation data");
      }

      const projectsData = (await projectsRes.json()) as Project[];
      const assignmentsData = (await assignmentsRes.json()) as InstallationAssignment[];
      const teamsData = teamsRes.ok ? ((await teamsRes.json()) as InstallationTeam[]) : [];

      setProjects(projectsData);
      setTeams(teamsData.filter((t) => t.is_active));
      setAssignments(assignmentsData);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load installation data",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function handleAssignTeam(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/installation/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          installationTeamId: selectedTeam,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const message = await readError(response, "Failed to assign team");
        throw new Error(message);
      }

      await fetchData();
      setSelectedProject("");
      setSelectedTeam("");
      setNotes("");
      setNotice("Installation team assigned");
      setTimeout(() => setNotice(""), 3000);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to assign team",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStatusChange(assignmentId: string, newStatus: string) {
    setError("");
    setUpdatingAssignmentId(assignmentId);

    try {
      const response = await fetch(
        `/api/installation/assignments/${assignmentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      if (!response.ok) {
        const message = await readError(response, "Failed to update assignment");
        throw new Error(message);
      }

      await fetchData();
      setNotice("Installation status updated");
      setTimeout(() => setNotice(""), 3000);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update assignment",
      );
    } finally {
      setUpdatingAssignmentId(null);
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  const availableProjects = projects.filter(
    (p) =>
      p.workflow_status === "delivered" &&
      !assignments.some((a) => a.project_id === p.id && a.status !== "completed")
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Installation Management</h1>
        <p className="text-gray-600 mt-1">Assign and track installation teams</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Assign Team */}
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Assign Installation Team</h2>

            <form onSubmit={handleAssignTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Choose project...</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Team
                </label>
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Choose team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_head_name} ({t.labor_count} labors)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={isCreating || !selectedProject || !selectedTeam}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isCreating ? "Assigning..." : "Assign Team"}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Active Assignments */}
        <div className="lg:col-span-2">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Installation Assignments</h2>

            <div className="space-y-4">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="border rounded-lg p-4 hover:shadow-md transition"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold">{assignment.projects.project_name}</h3>
                      <p className="text-sm text-gray-600">#{assignment.projects.project_number}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        assignment.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : assignment.status === "in_progress"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {assignment.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="text-sm text-gray-600 mb-3 space-y-1">
                    <p>Client: {assignment.projects.clients.client_name}</p>
                    <p>Team: {assignment.installation_teams.team_head_name}</p>
                    <p>Labors: {assignment.installation_teams.labor_count}</p>
                    {assignment.notes && <p>Notes: {assignment.notes}</p>}
                  </div>

                  {/* Actions */}
                  {assignment.status !== "completed" && (
                    <div className="flex gap-2">
                      {assignment.status === "pending" && (
                        <button
                          onClick={() => handleStatusChange(assignment.id, "in_progress")}
                          disabled={updatingAssignmentId === assignment.id}
                          className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400 text-sm"
                        >
                          {updatingAssignmentId === assignment.id ? "Starting..." : "Start Installation"}
                        </button>
                      )}

                      {assignment.status === "in_progress" && (
                        <button
                          onClick={() => handleStatusChange(assignment.id, "completed")}
                          disabled={updatingAssignmentId === assignment.id}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
                        >
                          {updatingAssignmentId === assignment.id ? "Completing..." : "Mark Completed"}
                        </button>
                      )}
                    </div>
                  )}

                  {assignment.status === "completed" && (
                    <div className="text-sm text-gray-500">
                      Completed on {assignment.completion_date || "N/A"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {assignments.length === 0 && (
              <p className="text-gray-500 text-center py-8">No installation assignments yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
