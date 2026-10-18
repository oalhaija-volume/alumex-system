import { canAccessCRM } from '@/lib/auth/permissions';

type Assignment = { created_by: string; assigned_outdoor_sales_id?: string | null };
type Actor = { id: string; role: string };
export function canDelayMeasurements(project: Assignment, actor: Actor) {
  return actor.role === 'Outdoor Sales' && (project.assigned_outdoor_sales_id === actor.id ||
    (!project.assigned_outdoor_sales_id && project.created_by === actor.id));
}
export function canResumeMeasurements(project: Assignment, actor: Actor) {
  return canDelayMeasurements(project, actor) || canAccessCRM(actor.role);
}
export function normalizeMeasurementDelayNote(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Add a note explaining the client delay.');
  const note = value.trim();
  if (note.length > 2000) throw new Error('Keep the delay note under 2,000 characters.');
  return note;
}
