import { canAccessProjectBranch } from '@/lib/auth/projectBranchAccess';

export function canRenameClient(
  project: { branch?: string | null; project_log_only?: boolean },
  actor: { role: string; branch?: string | null },
) {
  return !project.project_log_only
    && (actor.role === 'Admin' || actor.role === 'Indoor Sales' || actor.role === 'Sales Manager')
    && canAccessProjectBranch(actor, project.branch);
}

export function normalizeClientName(input: Record<string, unknown>) {
  const clientName = typeof input.clientName === 'string' ? input.clientName.trim() : '';
  if (!clientName || clientName.length > 150) throw new Error('Enter a client name of 1 to 150 characters.');
  return { clientName };
}
