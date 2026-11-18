type ProjectBranchActor = { role: string; branch?: string | null };
type ProjectBranchRow = {
  branch?: string | null;
  governorate?: string | null;
  governorate_office?: 'Karkh' | null;
  created_by?: string | null;
  assigned_outdoor_sales_id?: string | null;
};

export function hasGlobalProjectAccess(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Sales Director' || role === 'Company Owner';
}

// Karkh handles Governorates follow-up. Baghdad Outdoor Sales work across
// both Baghdad areas; Najaf employees remain within Najaf.
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

// Creation uses the calendar guard in outdoorRotation. Saved Baghdad entries
// remain available across both halves of the month, within their region.
export function canAccessProjectRow(
  actor: ProjectBranchActor & { id?: string; outdoorTeamMemberIds?: readonly string[] },
  project: ProjectBranchRow | null | undefined,
): boolean {
  if (!project) return false;
  const branch = effectiveProjectBranch(project);
  if (!canAccessProjectBranch(actor, branch)) return false;
  if (actor.role === 'Outdoor Sales') {
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
