type ProjectBranchActor = { role: string; branch?: string | null };

export function hasGlobalProjectAccess(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Sales Director' || role === 'Company Owner';
}

// Karkh handles Governorates follow-up. Outdoor Sales from either Baghdad
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
  actor: ProjectBranchActor & { id?: string },
  project: { branch?: string | null; created_by?: string | null } | null | undefined,
): boolean {
  return !!project && (canAccessProjectBranch(actor, project.branch)
    || actor.role === 'Outdoor Sales' && !!actor.id && project.created_by === actor.id);
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  if (branch === "Karkh") return ["Karkh", "Governorates"];
  return branch === "Rasafa" || branch === "Najaf" ? [branch] : [];
}

// null means unrestricted; an empty array deliberately matches no projects.
export function projectBranchesForActor(actor: ProjectBranchActor): string[] | null {
  if (hasGlobalProjectAccess(actor.role)) return null;
  if (actor.role === 'Outdoor Sales' && actor.branch === 'Rasafa') return ['Rasafa', 'Governorates'];
  return indoorProjectBranches(actor.branch);
}

export function canOwnProjectFollowUp(
  employee: { role?: string; branch?: string | null },
  projectBranch: string | null | undefined,
): boolean {
  return (employee.role === "Indoor Sales" || employee.role === "Sales Manager")
    && indoorProjectBranches(employee.branch).includes(projectBranch ?? '');
}
