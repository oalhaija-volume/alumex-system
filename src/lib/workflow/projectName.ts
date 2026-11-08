import type { OutdoorTeamActor } from '@/lib/auth/outdoorTeams';
import { canAccessProjectBranch } from '@/lib/auth/projectBranchAccess';

type Project = {
  created_by: string | null;
  assigned_outdoor_sales_id?: string | null;
  project_log_only?: boolean;
  branch?: string | null;
};

export function canRenameProject(project: Project, actor: OutdoorTeamActor & { branch?: string | null }) {
  if(project.project_log_only)return false;
  if(actor.role==='Indoor Sales')return canAccessProjectBranch(actor,project.branch);
  if(actor.role==='Sales Manager')return true;
  return actor.role === 'Outdoor Sales' && project.created_by === actor.id;
}

export function normalizeProjectName(input: Record<string, unknown>) {
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
  if (!projectName || projectName.length > 150) throw new Error('Enter a project name of 1 to 150 characters.');
  return { projectName };
}
