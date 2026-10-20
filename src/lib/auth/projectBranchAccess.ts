type ProjectBranchActor = { role: string; branch?: string | null };

// Branch assignments are mandatory for Indoor Sales visibility. Unmarked
// projects remain available to roles that are not restricted to one branch.
export function canAccessProjectBranch(
  actor: ProjectBranchActor,
  projectBranch: string | null | undefined,
): boolean {
  if (actor.role !== "Indoor Sales") return true;
  return (actor.branch === "Karkh" || actor.branch === "Rasafa")
    && projectBranch === actor.branch;
}
