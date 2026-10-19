export function canReactivateProject(project: { sales_status: string; client_cancelled_at?: string | null }, role?: string | null) {
  return (role === 'Indoor Sales' || role === 'Admin') && project.sales_status === 'cancelled' && !!project.client_cancelled_at;
}

export function normalizeReactivation(input: Record<string, unknown>) {
  if (input.confirmed !== true) throw new Error('Confirm that the client wants to reactivate this project.');
  if (typeof input.note !== 'string' || !input.note.trim()) throw new Error('Enter a reactivation note.');
  if (input.note.trim().length > 2000) throw new Error('Keep the reactivation note under 2,000 characters.');
  if (typeof input.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) throw new Error('Reload the project before reactivating it.');
  return { note: input.note.trim(), expectedUpdatedAt: input.expectedUpdatedAt };
}
