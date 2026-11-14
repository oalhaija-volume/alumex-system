type ProjectBranchActor = { role: string; branch?: string | null };

export function hasGlobalProjectAccess(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Sales Director' || role === 'Company Owner';
}

// Karkh handles Governorates follow-up. Outdoor Sales from every assigned
// office can register and measure their own assigned Governorates projects.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  const branches = projectBranchesForActor(actor);
  return branches === null || branches.includes(projectBranch ?? "");
}

// Outdoor employees retain their own saved entries after an office change.
// Creation and employee assignment continue to use the branch-only helper.
export function canAccessProjectRow(
  actor: ProjectBranchActor & { id?: string; outdoorTeamMemberIds?: readonly string[] },
  project: { branch?: string | null; created_by?: string | null; assigned_outdoor_sales_id?: string | null } | null | undefined,
): boolean {
  if (!project) return false;
  if (actor.role === 'Outdoor Sales') {
    if (actor.id && project.created_by === actor.id) return true;
    if (project.branch === 'Governorates' && actor.branch !== 'Karkh') {
      const assignee = project.assigned_outdoor_sales_id;
      return canAccessProjectBranch(actor, project.branch) && !!actor.id && !!assignee
        && (assignee === actor.id || !!actor.outdoorTeamMemberIds?.includes(assignee));
    }
  }
  return canAccessProjectBranch(actor, project.branch);
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  if (branch === "Karkh") return ["Karkh", "Governorates"];
  return branch === "Rasafa" || branch === "Najaf" ? [branch] : [];
}

// null means unrestricted; an empty array deliberately matches no projects.
export function projectBranchesForActor(actor: ProjectBranchActor): string[] | null {
  if (hasGlobalProjectAccess(actor.role)) return null;
  if (actor.role === 'Outdoor Sales' && (actor.branch === 'Karkh' || actor.branch === 'Rasafa' || actor.branch === 'Najaf')) {
    return [actor.branch, 'Governorates'];
  }
  return indoorProjectBranches(actor.branch);
}

export function canOwnProjectFollowUp(
  employee: { role?: string; branch?: string | null },
  projectBranch: string | null | undefined,
): boolean {
  return (employee.role === "Indoor Sales" || employee.role === "Sales Manager")
    && indoorProjectBranches(employee.branch).includes(projectBranch ?? '');
}
