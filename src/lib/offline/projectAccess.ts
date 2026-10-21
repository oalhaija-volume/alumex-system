import { canAccessProjectBranch } from '@/lib/auth/projectBranchAccess';
import type { FieldProject, FieldState } from './types';

export function canAccessFieldProject(state: FieldState, project: FieldProject | undefined): boolean {
  if (state.actor.role !== 'Indoor Sales') return true;
  return !!project
    && canAccessProjectBranch(state.actor, project.branch)
    && !state.unavailableProjectIds?.includes(project.id);
}

// Retain unsynced records in storage, but never expose another branch's project
// through a workspace, conflict, archive, media, or follow-up history read.
export function visibleFieldState(state: FieldState): FieldState {
  if (state.actor.role === 'Outdoor Sales') {
    const referenceOnly = new Set(state.projects.filter(project => project.project_log_only).map(project => project.id));
    return {
      ...state,
      openings: state.openings.filter(opening => !referenceOnly.has(opening.projectId)),
      measurementReports: state.measurementReports?.filter(report => !referenceOnly.has(report.project_id)),
    };
  }
  if (state.actor.role !== 'Indoor Sales') return state;
  const projects = state.projects.filter(project => canAccessFieldProject(state, project));
  const projectIds = new Set(projects.map(project => project.id));
  return {
    ...state,
    projects,
    openings: state.openings.filter(opening => projectIds.has(opening.projectId)),
    queue: state.queue.filter(change => projectIds.has(change.projectId)),
    measurementReports: state.measurementReports?.filter(report => projectIds.has(report.project_id)),
    followUpHistories: state.followUpHistories
      ? Object.fromEntries(Object.entries(state.followUpHistories).filter(([id]) => projectIds.has(id)))
      : undefined,
    archivedProjects: state.archivedProjects?.filter(archive => canAccessProjectBranch(state.actor, archive.project?.branch)),
    unavailableProjectIds: undefined,
  };
}
