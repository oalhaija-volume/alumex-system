import { canAccessProjectBranch, hasGlobalProjectAccess } from '@/lib/auth/projectBranchAccess';
import { canAccessOutdoorProject } from '@/lib/auth/outdoorTeams';
import type { FieldProject, FieldState } from './types';

export function canAccessFieldProject(state: FieldState, project: FieldProject | undefined): boolean {
  if (!project || !canAccessProjectBranch(state.actor, project.branch)
    || state.unavailableProjectIds?.includes(project.id)) return false;
  if (state.actor.role === 'Outdoor Sales') return !project.project_log_only
    && canAccessOutdoorProject(project, state.actor);
  return true;
}

// Retain unsynced records in storage, but never expose another branch's project
// through a workspace, conflict, archive, media, or follow-up history read.
export function visibleFieldState(state: FieldState): FieldState {
  const outdoor = state.actor.role === 'Outdoor Sales';
  const projects = state.projects.filter(project => canAccessProjectBranch(state.actor, project.branch)
    && !state.unavailableProjectIds?.includes(project.id)
    && (!outdoor || project.project_log_only || canAccessOutdoorProject(project, state.actor)));
  const writableIds = new Set(projects.filter(project => canAccessFieldProject(state, project)).map(project => project.id));
  const visibleEmployee = (employee: { branch?: string | null }) => hasGlobalProjectAccess(state.actor.role)
    || canAccessProjectBranch(state.actor, state.actor.branch) && employee.branch === state.actor.branch;
  return {
    ...state,
    projects,
    outdoorSales: state.outdoorSales?.filter(visibleEmployee),
    indoorSales: state.indoorSales?.filter(visibleEmployee),
    openings: state.openings.filter(opening => writableIds.has(opening.projectId)),
    queue: state.queue.filter(change => writableIds.has(change.projectId)),
    measurementReports: state.measurementReports?.filter(report => writableIds.has(report.project_id)),
    followUpHistories: state.followUpHistories
      ? Object.fromEntries(Object.entries(state.followUpHistories).filter(([id]) => writableIds.has(id)))
      : undefined,
    archivedProjects: state.archivedProjects?.filter(archive => canAccessProjectBranch(state.actor, archive.project?.branch)
      && (!outdoor || !!archive.project && !archive.project.project_log_only && canAccessOutdoorProject(archive.project, state.actor))),
    unavailableProjectIds: undefined,
  };
}
