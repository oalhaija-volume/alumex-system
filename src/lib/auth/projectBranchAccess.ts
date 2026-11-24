import { outdoorSalesBranch, type OutdoorRotationStartBranch } from '@/lib/intake/outdoorRotationSchedule';

type ProjectBranchActor = {
  role: string;
  branch?: string | null;
  outdoorRotationStartBranch?: OutdoorRotationStartBranch | null;
};
type ProjectBranchRow = {
  branch?: string | null;
  measurement_branch?: 'Karkh' | 'Rasafa' | null;
  governorate?: string | null;
  governorate_office?: 'Karkh' | null;
  created_by?: string | null;
  assigned_outdoor_sales_id?: string | null;
  measurement_assignment_id?: string | null;
  measurement_exception_employee_id?: string | null;
  measurement_exception_assignment_id?: string | null;
  measurement_exception_reason?: string | null;
  structure_readiness?: string | null;
  sales_status?: string | null;
  archived_at?: string | null;
  pending?: boolean;
};

export function hasGlobalProjectAccess(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Sales Director' || role === 'Company Owner';
}

// Static branch capability keeps assignments and original sales attribution
// valid across the rotation. Row visibility applies the current area below.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  const branches = projectBranchesForActor(actor);
  return branches === null || branches.includes(projectBranch ?? "");
}

// New Karkh Indoor registrations carry an immutable office marker. Unmarked
// historical Najaf records retain the dedicated office's privacy boundary.
export function effectiveProjectBranch(project: Pick<ProjectBranchRow, 'branch' | 'governorate' | 'governorate_office'>): string | null | undefined {
  if (project.branch === 'Governorates' && project.governorate === 'النجف' && project.governorate_office === 'Karkh') return 'Governorates';
  const governorate = typeof project.governorate === 'string' ? project.governorate.trim().toLowerCase() : null;
  return project.branch === 'Governorates' && (governorate === 'النجف' || governorate === 'نجف' || governorate === 'najaf')
    ? 'Najaf' : project.branch;
}

// Measurement territory is separate from the immutable registering office.
// Overrides never move Province/Najaf records across their existing boundary.
export function effectiveMeasurementBranch(project: Pick<ProjectBranchRow, 'branch' | 'measurement_branch' | 'governorate' | 'governorate_office'>): string | null | undefined {
  const branch = effectiveProjectBranch(project);
  return (branch === 'Karkh' || branch === 'Rasafa')
    && (project.measurement_branch === 'Karkh' || project.measurement_branch === 'Rasafa')
    ? project.measurement_branch : branch;
}

// An approved exception belongs to one employee and one live assignment. Team
// membership, ownership and an old assignment must never inherit that proof.
export function hasMeasurementRotationException(
  project: ProjectBranchRow | null | undefined,
  actor: ProjectBranchActor & { id?: string },
): boolean {
  if (!project || actor.role !== 'Outdoor Sales' || !actor.id
    || (actor.branch !== 'Karkh' && actor.branch !== 'Rasafa')) return false;
  const branch = effectiveMeasurementBranch(project);
  const reason = project.measurement_exception_reason;
  // Only a device projection has pending:true. Keep its issued proof until a
  // queued finish is acknowledged; server-selected rows never select pending.
  return (project.branch === 'Karkh' || project.branch === 'Rasafa')
    && (branch === 'Karkh' || branch === 'Rasafa')
    && project.structure_readiness === 'ready'
    && (project.sales_status === 'new_lead' || (project.pending === true && project.sales_status === 'ready_for_quotation'))
    && !project.archived_at && project.assigned_outdoor_sales_id === actor.id
    && project.measurement_exception_employee_id === actor.id
    && typeof project.measurement_assignment_id === 'string' && !!project.measurement_assignment_id
    && project.measurement_exception_assignment_id === project.measurement_assignment_id
    && typeof reason === 'string' && reason.trim().length > 0 && reason.trim().length <= 1000;
}

// Baghdad Outdoor visibility follows the same calendar as new registrations.
// Ownership, attribution and team assignment cannot bypass the current area.
export function canAccessProjectRow(
  actor: ProjectBranchActor & { id?: string; outdoorTeamMemberIds?: readonly string[] },
  project: ProjectBranchRow | null | undefined,
  date: Date = new Date(),
): boolean {
  if (!project) return false;
  const branch = actor.role === 'Outdoor Sales' ? effectiveMeasurementBranch(project) : effectiveProjectBranch(project);
  if (!canAccessProjectBranch(actor, branch)) return false;
  if (actor.role === 'Outdoor Sales') {
    if ((branch === 'Karkh' || branch === 'Rasafa') && outdoorSalesBranch(actor, date) !== branch
      && !hasMeasurementRotationException(project, actor)) return false;
    if (actor.id && project.created_by === actor.id) return true;
    if (branch === 'Governorates' && actor.branch !== 'Karkh') {
      const assignee = project.assigned_outdoor_sales_id;
      return !!actor.id && !!assignee
        && (assignee === actor.id || !!actor.outdoorTeamMemberIds?.includes(assignee));
    }
  }
  return true;
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  if (branch === "Karkh") return ["Karkh", "Governorates"];
  return branch === "Rasafa" || branch === "Najaf" ? [branch] : [];
}

// null means unrestricted; an empty array deliberately matches no projects.
export function projectBranchesForActor(actor: ProjectBranchActor): string[] | null {
  if (hasGlobalProjectAccess(actor.role)) return null;
  if (actor.role === 'Outdoor Sales' && (actor.branch === 'Karkh' || actor.branch === 'Rasafa')) return ['Karkh', 'Rasafa', 'Governorates'];
  return indoorProjectBranches(actor.branch);
}

export function canOwnProjectFollowUp(
  employee: { role?: string; branch?: string | null },
  projectBranch: string | null | undefined,
): boolean {
  return (employee.role === "Indoor Sales" || employee.role === "Sales Manager")
    && indoorProjectBranches(employee.branch).includes(projectBranch ?? '');
}
