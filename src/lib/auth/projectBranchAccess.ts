type ProjectBranchActor = { role: string; branch?: string | null };

export function hasGlobalProjectAccess(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Sales Director' || role === 'Company Owner';
}

// A governorate is a project location, not a separate employee office.
// Existing Governorates projects remain with the Karkh office.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  if (hasGlobalProjectAccess(actor.role)) return true;
  return indoorProjectBranches(actor.branch).includes(projectBranch ?? "");
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  if (branch === "Karkh") return ["Karkh", "Governorates"];
  return branch === "Rasafa" || branch === "Najaf" ? [branch] : [];
}

// null means unrestricted; an empty array deliberately matches no projects.
export function projectBranchesForActor(actor: ProjectBranchActor): string[] | null {
  return hasGlobalProjectAccess(actor.role) ? null : indoorProjectBranches(actor.branch);
}

export function canOwnProjectFollowUp(
  employee: { role?: string; branch?: string | null },
  projectBranch: string | null | undefined,
): boolean {
  return (employee.role === "Indoor Sales" || employee.role === "Sales Manager")
    && indoorProjectBranches(employee.branch).includes(projectBranch ?? '');
}
