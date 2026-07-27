import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function loadOutdoorSalesProjectIds(userId: string) {
  const admin = createAdminClient();
  const ownedProjects = await admin
    .from("projects")
    .select("id")
    .or(
      [
        `sales_engineer_id.eq.${userId}`,
        `original_creator_id.eq.${userId}`,
        `owner_id.eq.${userId}`,
        `responsible_user_id.eq.${userId}`,
      ].join(","),
    );
  const compatibleOwnedProjects = ownedProjects.error
    ? await admin
        .from("projects")
        .select("id")
        .eq("sales_engineer_id", userId)
    : ownedProjects;

  if (compatibleOwnedProjects.error) {
    return {
      ids: new Set<string>(),
      error: compatibleOwnedProjects.error,
    };
  }

  const assignments = await admin
    .from("project_assignments")
    .select("project_id")
    .eq("assignee_id", userId)
    .is("ended_at", null);

  return {
    ids: new Set([
      ...(compatibleOwnedProjects.data ?? []).map((project) => project.id),
      ...(assignments.error ? [] : assignments.data ?? []).map(
        (assignment) => assignment.project_id,
      ),
    ]),
    error: null,
  };
}
