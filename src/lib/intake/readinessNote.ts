export function normalizeReadinessNote(role: string, readiness: unknown, value: unknown): string | null {
  if (role !== 'Outdoor Sales' || readiness !== 'not_ready') return null;
  const note = typeof value === 'string' ? value.trim() : '';
  if (!note) throw new Error('Add a note explaining why the project is not ready for measurement.');
  if (note.length > 2000) throw new Error('Keep the readiness note under 2,000 characters.');
  return note;
}
