"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useClients } from "@/components/clients/ClientsProvider";
import type {
  Project,
  ProjectBranch,
  ProjectStatus,
  StructuralOpening,
} from "@/data/ui";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import {
  invalidateClientData,
  loadCachedClientData,
} from "@/lib/clientRequestCache";

type ProjectInput = Omit<Project, "id" | "structuralOpenings">;
type StructuralOpeningInput = Omit<StructuralOpening, "id">;

type ProjectsContextValue = {
  projects: Project[];
  isLoading: boolean;
  error: string;
  warning: string;
  refreshProjects: () => Promise<void>;
  createProject: (project: ProjectInput) => Promise<void>;
  updateProject: (id: string, project: ProjectInput) => Promise<void>;
  deleteProjects: (ids: string[]) => Promise<void>;
  findProject: (id: string) => Project | undefined;
  addOpening: (projectId: string, opening: StructuralOpeningInput) => Promise<void>;
  updateOpening: (
    projectId: string,
    openingId: string,
    opening: StructuralOpeningInput,
  ) => Promise<void>;
  deleteOpening: (projectId: string, openingId: string) => Promise<void>;
  duplicateOpening: (projectId: string, openingId: string) => Promise<void>;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

type ProjectRow = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string;
  address: string | null;
  location_latitude: number | string | null;
  location_longitude: number | string | null;
  geofence_radius_meters: number | string | null;
  project_type: string | null;
  branch: ProjectBranch | null;
  sales_engineer_id: string | null;
  sales_engineer_name?: string | null;
  status: ProjectStatus;
  clients?: { client_name: string | null } | Array<{ client_name: string | null }> | null;
};

type OpeningRow = {
  id: string;
  project_id: string;
  floor: string | null;
  room: string | null;
  opening_code: string;
  width: number | string;
  height: number | string;
  solid_panel_height?: number | string | null;
  quantity: number;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  notes: string | null;
};

function formatSupabaseError(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";

  if (
    rawMessage.toLowerCase().includes("documents") &&
    rawMessage.toLowerCase().includes("permission denied")
  ) {
    return "Unable to load project documents.";
  }

  return friendlyDatabaseError(error, fallback);
}

async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? fallback;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function projectClientName(project: ProjectRow) {
  const client = Array.isArray(project.clients)
    ? project.clients[0]
    : project.clients;

  return client?.client_name ?? "";
}

function mapOpening(row: OpeningRow): StructuralOpening {
  return {
    id: row.id,
    floor: row.floor ?? "",
    room: row.room ?? "",
    openingCode: row.opening_code,
    width: normalizeNumber(row.width),
    height: normalizeNumber(row.height),
    solidPanelHeight: normalizeNumber(row.solid_panel_height),
    quantity: row.quantity,
    productSystem: row.product_system ?? "",
    glassType: row.glass_type ?? "",
    aluminumColor: row.aluminum_color ?? "",
    notes: row.notes ?? "",
  };
}

function mapProject(
  project: ProjectRow,
  clients: ReturnType<typeof useClients>["clients"],
  openingsByProject = new Map<string, StructuralOpening[]>(),
): Project {
  const client = clients.find((item) => item.id === project.client_id);

  return {
    id: project.id,
    projectNumber: project.project_number,
    projectName: project.project_name,
    clientId: project.client_id,
    client: client?.clientName ?? projectClientName(project),
    address: project.address ?? "",
    locationLatitude:
      project.location_latitude === null
        ? null
        : normalizeNumber(project.location_latitude),
    locationLongitude:
      project.location_longitude === null
        ? null
        : normalizeNumber(project.location_longitude),
    geofenceRadiusMeters:
      project.geofence_radius_meters === null
        ? 100
        : normalizeNumber(project.geofence_radius_meters),
    projectType: project.project_type ?? "",
    branch: project.branch ?? "",
    salesEngineerId: project.sales_engineer_id ?? undefined,
    salesEngineer: project.sales_engineer_name ?? "",
    status: project.status,
    structuralOpenings: openingsByProject.get(project.id) ?? [],
  };
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: isRoleLoaded, role, userId } = useCurrentRole();
  const { clients } = useClients();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const canLoadProjects = Boolean(role);

  const loadProjects = useCallback(async (force = false) => {
    if (!isRoleLoaded) {
      return;
    }

    if (!canLoadProjects) {
      setProjects([]);
      setError("");
      setWarning("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    setWarning("");

    try {
      const body = await loadCachedClientData(
        `projects:${userId ?? "anonymous"}`,
        async () => {
          const response = await fetch("/api/projects");
          const result = (await response.json().catch(() => null)) as
            | {
                projects?: ProjectRow[];
                openings?: OpeningRow[];
                error?: string;
                warning?: string;
              }
            | null;

          if (!response.ok) {
            throw new Error(result?.error ?? "Unable to load projects.");
          }

          return result ?? {};
        },
        { force, ttlMs: 30_000 },
      );

      if (body.warning) {
        setWarning(
          `Projects loaded using compatibility mode. Apply supabase/manual_sql/20260622_opening_solid_panel_height.sql to remove this warning. Details: ${body.warning}`,
        );
      }

      const openingsByProject = new Map<string, StructuralOpening[]>();
      (body.openings ?? []).forEach((opening) => {
        const list = openingsByProject.get(opening.project_id) ?? [];
        list.push(mapOpening(opening));
        openingsByProject.set(opening.project_id, list);
      });

      setProjects(
        (body.projects ?? []).map((project) =>
          mapProject(project, [], openingsByProject),
        ),
      );
    } catch (loadError) {
      setError(formatSupabaseError(loadError, "Unable to load projects."));
    } finally {
      setIsLoading(false);
    }
  }, [canLoadProjects, isRoleLoaded, userId]);

  const refreshProjects = useCallback(async () => {
    await loadProjects(true);
  }, [loadProjects]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  const createProject = useCallback(
    async (project: ProjectInput) => {
      const clientId = project.clientId ?? project.client;

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: project.projectName,
          client_id: clientId,
          address: project.address || null,
          location_latitude: project.locationLatitude ?? null,
          location_longitude: project.locationLongitude ?? null,
          geofence_radius_meters: project.geofenceRadiusMeters ?? 100,
          project_type: project.projectType || null,
          branch: project.branch,
          status: project.status,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save project."));
      }

      const savedProject = (await response.json().catch(() => null)) as ProjectRow | null;

      if (savedProject) {
        setProjects((currentProjects) => [
          mapProject(savedProject, clients),
          ...currentProjects.filter((item) => item.id !== savedProject.id),
        ]);
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [clients, refreshProjects, userId],
  );

  const updateProject = useCallback(
    async (id: string, project: ProjectInput) => {
      const clientId = project.clientId ?? project.client;

      const response = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          project_name: project.projectName,
          client_id: clientId,
          address: project.address || null,
          location_latitude: project.locationLatitude ?? null,
          location_longitude: project.locationLongitude ?? null,
          geofence_radius_meters: project.geofenceRadiusMeters ?? 100,
          project_type: project.projectType || null,
          branch: project.branch,
          status: project.status,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save project."));
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [refreshProjects, userId],
  );

  const deleteProjects = useCallback(
    async (ids: string[]) => {
      const response = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: ids }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Unable to delete project.");
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [refreshProjects, userId],
  );

  const findProject = useCallback(
    (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const addOpening = useCallback(
    async (projectId: string, opening: StructuralOpeningInput) => {
      const response = await fetch(`/api/projects/${projectId}/openings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opening),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save opening."));
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [refreshProjects, userId],
  );

  const updateOpening = useCallback(
    async (
      _projectId: string,
      openingId: string,
      opening: StructuralOpeningInput,
    ) => {
      const response = await fetch(`/api/projects/${_projectId}/openings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: openingId, ...opening }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to save opening."));
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [refreshProjects, userId],
  );

  const deleteOpening = useCallback(
    async (projectId: string, openingId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/openings?openingId=${encodeURIComponent(openingId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete opening."));
      }

      invalidateClientData(`projects:${userId ?? "anonymous"}`);
      await refreshProjects();
    },
    [refreshProjects, userId],
  );

  const duplicateOpening = useCallback(
    async (projectId: string, openingId: string) => {
      const sourceProject = projects.find((project) => project.id === projectId);
      const sourceOpening = sourceProject?.structuralOpenings.find(
        (opening) => opening.id === openingId,
      );

      if (!sourceOpening) {
        return;
      }

      await addOpening(projectId, {
        ...sourceOpening,
        openingCode: `${sourceOpening.openingCode}-COPY`,
      });
    },
    [addOpening, projects],
  );

  const value = useMemo(
    () => ({
      projects,
      isLoading,
      error,
      warning,
      refreshProjects,
      createProject,
      updateProject,
      deleteProjects,
      findProject,
      addOpening,
      updateOpening,
      deleteOpening,
      duplicateOpening,
    }),
    [
      projects,
      isLoading,
      error,
      warning,
      refreshProjects,
      createProject,
      updateProject,
      deleteProjects,
      findProject,
      addOpening,
      updateOpening,
      deleteOpening,
      duplicateOpening,
    ],
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectsContext);

  if (!context) {
    throw new Error("useProjects must be used inside ProjectsProvider");
  }

  return context;
}
