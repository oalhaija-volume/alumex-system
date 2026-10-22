type ProjectBranchActor = { role: string; branch?: string | null };

// Indoor Sales must belong to an active sales branch. Governorate projects
// are shared by both teams; Baghdad projects remain limited to their branch.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  if (actor.role !== "Indoor Sales") return true;
  return (actor.branch === "Karkh" || actor.branch === "Rasafa")
    && (projectBranch === actor.branch || projectBranch === "Governorates");
}

export function indoorProjectBranches(branch: string | null | undefined): string[] {
  return branch === "Karkh" || branch === "Rasafa" ? [branch, "Governorates"] : [];
}
