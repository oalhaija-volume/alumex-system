import { canAccessProjectBranch, canAccessProjectRow, hasGlobalProjectAccess } from '@/lib/auth/projectBranchAccess';
import { canAccessOutdoorProject } from '@/lib/auth/outdoorTeams';
import type { FieldProject, FieldState } from './types';

export function canAccessFieldProject(state: FieldState, project: FieldProject | undefined): boolean {
  if (!project || !canAccessProjectRow(state.actor, project)
    || state.unavailableProjectIds?.includes(project.id)) return false;
  if (state.actor.role === 'Outdoor Sales') return !project.project_log_only
    && canAccessOutdoorProject(project, state.actor);
  return true;
}

// Keep each Outdoor creator's entries across offices, including saved work.
// All other rows retain their branch boundary in every offline view.
export function visibleFieldState(state: FieldState): FieldState {
  const outdoor = state.actor.role === 'Outdoor Sales';
  const projects = state.projects.filter(project => canAccessProjectRow(state.actor, project)
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
    archivedProjects: state.archivedProjects?.filter(archive => canAccessProjectRow(state.actor, archive.project)
      && (!outdoor || !!archive.project && !archive.project.project_log_only && canAccessOutdoorProject(archive.project, state.actor))),
    unavailableProjectIds: undefined,
  };
}
