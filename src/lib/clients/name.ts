import { canAccessProjectBranch, effectiveProjectBranch } from '@/lib/auth/projectBranchAccess';

export type ClientNameProjectUpdate = { id: string; project_name: string; updated_at: string };
export type ClientNameUpdate = {
  client: { id: string; client_name: string };
  projects: ClientNameProjectUpdate[];
  documentRevisionsCreated: number;
};

export function normalizeClientNameUpdate(input: unknown): ClientNameUpdate {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null;
  const client = value?.client && typeof value.client === 'object' && !Array.isArray(value.client) ? value.client as Record<string, unknown> : null;
  const projects = value?.projects;
  if (!client || typeof client.id !== 'string' || !client.id || typeof client.client_name !== 'string'
    || !Array.isArray(projects) || !Number.isSafeInteger(value?.documentRevisionsCreated) || Number(value?.documentRevisionsCreated) < 0
    || projects.some(project => !project || typeof project !== 'object' || typeof project.id !== 'string' || !project.id
      || typeof project.project_name !== 'string' || typeof project.updated_at !== 'string' || !Number.isFinite(Date.parse(project.updated_at)))) {
    throw new Error('Client and project name synchronization is not available yet. Please contact Admin.');
  }
  return {
    client: { id: client.id, client_name: client.client_name },
    projects: projects.map(project => ({ id: project.id, project_name: project.project_name, updated_at: project.updated_at })),
    documentRevisionsCreated: value!.documentRevisionsCreated as number,
  };
}

export function applyClientNameUpdate<Project extends { id: string; client_id?: string | null; updated_at?: string | null }>(project: Project, update: ClientNameUpdate): Project {
  const changedProject = update.projects.find(row => row.id === project.id);
  if (project.client_id !== update.client.id && !changedProject) return project;
  if (changedProject && Date.parse(project.updated_at ?? '') > Date.parse(changedProject.updated_at)) return project;
  return {
    ...project,
    client_name: update.client.client_name,
    ...(changedProject ? { project_name: changedProject.project_name, updated_at: changedProject.updated_at } : {}),
  };
}

export function canRenameClient(
  project: { branch?: string | null; governorate?: string | null; governorate_office?: 'Karkh' | null; project_log_only?: boolean },
  actor: { role: string; branch?: string | null },
) {
  return !project.project_log_only
    && (actor.role === 'Admin' || actor.role === 'Indoor Sales' || actor.role === 'Sales Manager')
    && canAccessProjectBranch(actor, effectiveProjectBranch(project));
}

export function normalizeClientName(input: Record<string, unknown>) {
  const clientName = typeof input.clientName === 'string' ? input.clientName.trim() : '';
  if (!clientName || clientName.length > 150) throw new Error('Enter a client name of 1 to 150 characters.');
  return { clientName };
}
