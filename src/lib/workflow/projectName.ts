import type { OutdoorTeamActor } from '@/lib/auth/outdoorTeams';

type Project = {
  created_by: string | null;
  assigned_outdoor_sales_id?: string | null;
  project_log_only?: boolean;
};

export function canRenameProject(project: Project, actor: OutdoorTeamActor) {
  return actor.role === 'Outdoor Sales' && !project.project_log_only && project.created_by === actor.id;
}

export function normalizeProjectName(input: Record<string, unknown>) {
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
  if (!projectName || projectName.length > 150) throw new Error('Enter a project name of 1 to 150 characters.');
  return { projectName };
}
