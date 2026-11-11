type ProjectBranchActor = { role: string; branch?: string | null };

// Indoor Sales must have a sales branch. Karkh handles Governorates projects.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  if (actor.role !== "Indoor Sales") return true;
  return indoorProjectBranches(actor.branch).includes(projectBranch ?? "");
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  if (branch === "Karkh") return ["Karkh", "Governorates"];
  return branch === "Rasafa" ? ["Rasafa"] : [];
}

export function canOwnProjectFollowUp(
  employee: { role?: string; branch?: string | null },
  projectBranch: string | null | undefined,
): boolean {
  return projectBranch !== "Governorates" || employee.role === "Sales Manager"
    || (employee.role === "Indoor Sales" && employee.branch === "Karkh");
}
