import { isLeadershipRole } from '@/lib/auth/permissions';

export function canAssignIndoorSales(
  project: { id?: string; project_log_only?: boolean },
  actor: { role: string },
) {
  return !project.project_log_only && isLeadershipRole(actor.role);
}

export function normalizeIndoorSalesAssignment(input: Record<string, unknown>) {
  const followUpOwnerId = input.followUpOwnerId;
  if (typeof followUpOwnerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(followUpOwnerId)) {
    throw new Error('Choose the responsible Indoor Sales employee.');
  }
  const expectedUpdatedAt = input.expectedUpdatedAt;
  if (typeof expectedUpdatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedUpdatedAt)
    || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new Error('Reload the project before changing Indoor Sales.');
  }
  // Retain the database timestamp's precision for the conditional update.
  return { followUpOwnerId, expectedUpdatedAt };
}
