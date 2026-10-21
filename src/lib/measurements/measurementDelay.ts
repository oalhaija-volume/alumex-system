import { canAccessCRM } from '@/lib/auth/permissions';

type Assignment = { sales_status?: string; created_by: string; assigned_outdoor_sales_id?: string | null };
type Actor = { id: string; role: string };
export const measurementDelayReasons = ['client_delay', 'client_no_answer', 'site_closed'] as const;
export type MeasurementDelayReason = typeof measurementDelayReasons[number];

export function normalizeMeasurementDelay(payload: { reason?: unknown; note?: unknown }) {
  // Older installed clients queued only a note; keep their saved work valid.
  const reason = payload.reason === undefined ? 'client_delay' : payload.reason;
  if (!measurementDelayReasons.some(value => value === reason)) throw new Error('Choose a valid visit outcome.');
  const note = normalizeMeasurementDelayNote(payload.note);
  // Keep omitted fields omitted so retries still match the original operation's
  // payload fingerprint when an older client already submitted the same note.
  return { ...(payload.reason === undefined ? {} : { reason: reason as MeasurementDelayReason }), note };
}

export function canDelayMeasurements(project: Assignment, actor: Actor) {
  return actor.role === 'Outdoor Sales' && project.assigned_outdoor_sales_id === actor.id;
}
export function canResumeMeasurements(project: Assignment, actor: Actor) {
  return canAccessCRM(actor.role) && project.sales_status === 'new_lead';
}
export function normalizeMeasurementDelayNote(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Add a note explaining the client delay.');
  const note = value.trim();
  if (note.length > 2000) throw new Error('Keep the delay note under 2,000 characters.');
  return note;
}

export function canCancelProject(project: Assignment, actor: Actor) {
  const stages = canAccessCRM(actor.role)
    ? ['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated']
    : ['new_lead','ready_for_quotation'];
  return (canAccessCRM(actor.role) || canDelayMeasurements(project, actor)) && stages.includes(project.sales_status ?? '');
}
export function normalizeClientCancellation(payload: { note?: unknown; confirmed?: unknown }) {
  if (payload.confirmed !== true) throw new Error('Confirm that the client cancelled this project.');
  if (typeof payload.note !== 'string' || !payload.note.trim()) throw new Error('Enter the client cancellation reason.');
  const note = payload.note.trim();
  if (note.length > 2000) throw new Error('Keep the cancellation reason under 2,000 characters.');
  return { note, confirmed: true };
}
