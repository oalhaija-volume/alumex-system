"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useClients } from "@/components/clients/ClientsProvider";
import type { Project, ProjectStatus, StructuralOpening } from "@/data/ui";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type ProjectInput = Omit<Project, "id" | "structuralOpenings">;
type StructuralOpeningInput = Omit<StructuralOpening, "id">;

type ProjectsContextValue = {
  projects: Project[];
  isLoading: boolean;
  error: string;
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
  sales_engineer_id: string | null;
  status: ProjectStatus;
};

type OpeningRow = {
  id: string;
  project_id: string;
  floor: string | null;
  room: string | null;
  opening_code: string;
  width: number | string;
  height: number | string;
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

function logSupabaseError(action: string, error: unknown) {
  console.error(`[ProjectsProvider] ${action} failed`, error);
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function mapOpening(row: OpeningRow): StructuralOpening {
  return {
    id: row.id,
    floor: row.floor ?? "",
    room: row.room ?? "",
    openingCode: row.opening_code,
    width: normalizeNumber(row.width),
    height: normalizeNumber(row.height),
    quantity: row.quantity,
    productSystem: row.product_system ?? "",
    glassType: row.glass_type ?? "",
    aluminumColor: row.aluminum_color ?? "",
    notes: row.notes ?? "",
  };
}

function openingPayload(opening: StructuralOpeningInput, projectId?: string, userId?: string) {
  return {
    ...(projectId ? { project_id: projectId } : {}),
    floor: opening.floor || null,
    room: opening.room || null,
    opening_code: opening.openingCode,
    width: opening.width,
    height: opening.height,
    quantity: opening.quantity,
    product_system: opening.productSystem || null,
    glass_type: opening.glassType || null,
    aluminum_color: opening.aluminumColor || null,
    notes: opening.notes || null,
    ...(userId ? { created_by: userId } : {}),
  };
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { clients } = useClients();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const supabase = createSupabaseClient();
      const [{ data: projectRows, error: projectsError }, { data: openingRows, error: openingsError }] =
        await Promise.all([
          supabase
            .from("projects")
            .select(
              "id, project_number, project_name, client_id, address, location_latitude, location_longitude, geofence_radius_meters, project_type, sales_engineer_id, status",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("openings")
            .select(
              "id, project_id, floor, room, opening_code, width, height, quantity, product_system, glass_type, aluminum_color, notes",
            ),
        ]);

      if (projectsError) {
        logSupabaseError("load projects", projectsError);
        throw projectsError;
      }

      if (openingsError) {
        logSupabaseError("load openings", openingsError);
        throw openingsError;
      }

      const openingsByProject = new Map<string, StructuralOpening[]>();
      ((openingRows ?? []) as OpeningRow[]).forEach((opening) => {
        const list = openingsByProject.get(opening.project_id) ?? [];
        list.push(mapOpening(opening));
        openingsByProject.set(opening.project_id, list);
      });

      setProjects(
        ((projectRows ?? []) as ProjectRow[]).map((project) => {
          const client = clients.find((item) => item.id === project.client_id);

          return {
            id: project.id,
            projectNumber: project.project_number,
            projectName: project.project_name,
            clientId: project.client_id,
            client: client?.clientName ?? "",
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
            salesEngineerId: project.sales_engineer_id ?? undefined,
            salesEngineer: "",
            status: project.status,
            structuralOpenings: openingsByProject.get(project.id) ?? [],
          };
        }),
      );
    } catch (loadError) {
      setError(formatSupabaseError(loadError, "Unable to load projects."));
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [clients]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshProjects]);

  const createProject = useCallback(
    async (project: ProjectInput) => {
      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const clientId = project.clientId ?? project.client;
      const projectNumber =
        project.projectNumber.trim() ||
        `PRJ-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      if (
        projects.some(
          (currentProject) =>
            currentProject.projectNumber.trim().toLowerCase() ===
            projectNumber.toLowerCase(),
        )
      ) {
        throw new Error("Project number already exists.");
      }

      const { error: createError } = await supabase.from("projects").insert({
        project_number: projectNumber,
        project_name: project.projectName,
        client_id: clientId,
        address: project.address || null,
        location_latitude: project.locationLatitude ?? null,
        location_longitude: project.locationLongitude ?? null,
        geofence_radius_meters: project.geofenceRadiusMeters ?? 100,
        project_type: project.projectType || null,
        status: project.status,
        sales_engineer_id: project.salesEngineerId ?? null,
        created_by: user?.id ?? null,
      });

      if (createError) {
        logSupabaseError("create project", createError);
        throw new Error(formatSupabaseError(createError, "Unable to save project."));
      }

      await refreshProjects();
    },
    [projects, refreshProjects],
  );

  const updateProject = useCallback(
    async (id: string, project: ProjectInput) => {
      const supabase = createSupabaseClient();
      const clientId = project.clientId ?? project.client;

      if (
        projects.some(
          (currentProject) =>
            currentProject.id !== id &&
            currentProject.projectNumber.trim().toLowerCase() ===
              project.projectNumber.trim().toLowerCase(),
        )
      ) {
        throw new Error("Project number already exists.");
      }

      const { error: updateError } = await supabase
        .from("projects")
        .update({
          project_number: project.projectNumber,
          project_name: project.projectName,
          client_id: clientId,
          address: project.address || null,
          location_latitude: project.locationLatitude ?? null,
          location_longitude: project.locationLongitude ?? null,
          geofence_radius_meters: project.geofenceRadiusMeters ?? 100,
          project_type: project.projectType || null,
          status: project.status,
          sales_engineer_id: project.salesEngineerId ?? null,
        })
        .eq("id", id);

      if (updateError) {
        logSupabaseError("update project", updateError);
        throw new Error(formatSupabaseError(updateError, "Unable to save project."));
      }

      await refreshProjects();
    },
    [projects, refreshProjects],
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

      await refreshProjects();
    },
    [refreshProjects],
  );

  const findProject = useCallback(
    (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const addOpening = useCallback(
    async (projectId: string, opening: StructuralOpeningInput) => {
      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: createError } = await supabase
        .from("openings")
        .insert(openingPayload(opening, projectId, user?.id));

      if (createError) {
        logSupabaseError("create opening", createError);
        throw new Error(formatSupabaseError(createError, "Unable to save opening."));
      }

      await refreshProjects();
    },
    [refreshProjects],
  );

  const updateOpening = useCallback(
    async (
      _projectId: string,
      openingId: string,
      opening: StructuralOpeningInput,
    ) => {
      const supabase = createSupabaseClient();
      const { error: updateError } = await supabase
        .from("openings")
        .update(openingPayload(opening))
        .eq("id", openingId);

      if (updateError) {
        logSupabaseError("update opening", updateError);
        throw new Error(formatSupabaseError(updateError, "Unable to save opening."));
      }

      await refreshProjects();
    },
    [refreshProjects],
  );

  const deleteOpening = useCallback(
    async (_projectId: string, openingId: string) => {
      const supabase = createSupabaseClient();
      const { error: deleteError } = await supabase
        .from("openings")
        .delete()
        .eq("id", openingId);

      if (deleteError) {
        logSupabaseError("delete opening", deleteError);
        throw new Error(formatSupabaseError(deleteError, "Unable to delete opening."));
      }

      await refreshProjects();
    },
    [refreshProjects],
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
