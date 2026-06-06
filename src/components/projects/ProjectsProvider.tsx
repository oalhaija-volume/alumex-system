"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  projects as initialProjects,
  type Project,
  type StructuralOpening,
} from "@/data/ui";

type ProjectInput = Omit<Project, "id" | "structuralOpenings">;
type StructuralOpeningInput = Omit<StructuralOpening, "id">;
const projectsStorageKey = "alumex-local-projects";

type ProjectsContextValue = {
  projects: Project[];
  createProject: (project: ProjectInput) => void;
  updateProject: (id: string, project: ProjectInput) => void;
  findProject: (id: string) => Project | undefined;
  addOpening: (projectId: string, opening: StructuralOpeningInput) => void;
  updateOpening: (
    projectId: string,
    openingId: string,
    opening: StructuralOpeningInput,
  ) => void;
  deleteOpening: (projectId: string, openingId: string) => void;
  duplicateOpening: (projectId: string, openingId: string) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project"
  );
}

function createId(projectNumber: string, existingProjects: Project[]) {
  const base = slugify(projectNumber);
  const exists = new Set(existingProjects.map((project) => project.id));

  if (!exists.has(base)) {
    return base;
  }

  let index = 2;
  while (exists.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

function createOpeningId(openingCode: string, existingOpenings: StructuralOpening[]) {
  const base = slugify(openingCode);
  const exists = new Set(existingOpenings.map((opening) => opening.id));

  if (!exists.has(base)) {
    return base;
  }

  let index = 2;
  while (exists.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

function normalizeStoredProjects(projects: Project[]) {
  return projects.map((project) => ({
    ...project,
    structuralOpenings: project.structuralOpenings.map((opening) => ({
      ...opening,
      width: opening.width > 0 && opening.width < 20 ? opening.width * 100 : opening.width,
      height: opening.height > 0 && opening.height < 20 ? opening.height * 100 : opening.height,
    })),
  }));
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedProjects = window.localStorage.getItem(projectsStorageKey);

      if (storedProjects) {
        setProjects(normalizeStoredProjects(JSON.parse(storedProjects) as Project[]));
      }

      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
    }
  }, [projects, hasLoaded]);

  const createProject = useCallback((project: ProjectInput) => {
    setProjects((currentProjects) => {
      const projectNumber =
        project.projectNumber.trim() ||
        `PRJ-${new Date().getFullYear()}-${String(currentProjects.length + 1).padStart(3, "0")}`;
      const createdProject = {
        ...project,
        projectNumber,
        id: createId(projectNumber, currentProjects),
        structuralOpenings: [],
      };

      return [createdProject, ...currentProjects];
    });
  }, []);

  const updateProject = useCallback((id: string, project: ProjectInput) => {
    setProjects((currentProjects) =>
      currentProjects.map((currentProject) =>
        currentProject.id === id
          ? {
              ...project,
              id,
              structuralOpenings: currentProject.structuralOpenings,
            }
          : currentProject,
      ),
    );
  }, []);

  const findProject = useCallback(
    (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const addOpening = useCallback(
    (projectId: string, opening: StructuralOpeningInput) => {
      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          if (project.id !== projectId) {
            return project;
          }

          const createdOpening = {
            ...opening,
            id: createOpeningId(opening.openingCode, project.structuralOpenings),
          };

          return {
            ...project,
            structuralOpenings: [...project.structuralOpenings, createdOpening],
          };
        }),
      );
    },
    [],
  );

  const updateOpening = useCallback(
    (
      projectId: string,
      openingId: string,
      opening: StructuralOpeningInput,
    ) => {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                structuralOpenings: project.structuralOpenings.map(
                  (currentOpening) =>
                    currentOpening.id === openingId
                      ? { ...opening, id: openingId }
                      : currentOpening,
                ),
              }
            : project,
        ),
      );
    },
    [],
  );

  const deleteOpening = useCallback((projectId: string, openingId: string) => {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              structuralOpenings: project.structuralOpenings.filter(
                (opening) => opening.id !== openingId,
              ),
            }
          : project,
      ),
    );
  }, []);

  const duplicateOpening = useCallback((projectId: string, openingId: string) => {
    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        const sourceOpening = project.structuralOpenings.find(
          (opening) => opening.id === openingId,
        );

        if (!sourceOpening) {
          return project;
        }

        const duplicatedOpening = {
          ...sourceOpening,
          id: createOpeningId(
            `${sourceOpening.openingCode}-copy`,
            project.structuralOpenings,
          ),
          openingCode: `${sourceOpening.openingCode}-COPY`,
        };

        return {
          ...project,
          structuralOpenings: [
            ...project.structuralOpenings,
            duplicatedOpening,
          ],
        };
      }),
    );
  }, []);

  const value = useMemo(
    () => ({
      projects,
      createProject,
      updateProject,
      findProject,
      addOpening,
      updateOpening,
      deleteOpening,
      duplicateOpening,
    }),
    [
      projects,
      createProject,
      updateProject,
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
