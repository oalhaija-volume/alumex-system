import type { FieldProject, MeasurementVisitEntry } from '@/lib/offline/types';

export function visitOutcomeLabel(reason?: string | null) {
  if (reason === 'client_no_answer') return 'Client did not answer';
  if (reason === 'site_closed') return 'Site was closed';
  return 'Client asked to visit later';
}

export function visitEntryLabel(entry: MeasurementVisitEntry) {
  if (!entry.action || entry.action === 'delay-measurements') return visitOutcomeLabel(entry.reason);
  if (entry.action === 'finish') return 'Measurements submitted';
  if (entry.action === 'request-openings') return 'Additional measurements assigned';
  if (entry.action === 'resume-measurements') return 'Measurement visit resumed';
  return 'Measurement visit assigned';
}

export function projectVisitHistory(project: FieldProject) {
  const entries = [...(project.measurement_attempts ?? [])];
  // Older device snapshots retain the last outcome before downloading full history.
  if (project.measurement_delayed_at && !entries.some(entry =>
    (!entry.action || entry.action === 'delay-measurements') && Date.parse(entry.recordedAt) === Date.parse(project.measurement_delayed_at!))) {
    entries.push({
      id: `last-visit-${project.id}`,
      projectId: project.id,
      action: 'delay-measurements',
      reason: project.measurement_delay_reason,
      note: project.measurement_delay_note ?? '',
      recordedAt: project.measurement_delayed_at,
      recordedBy: project.measurementDelayedBy ?? 'Employee',
      recordedById: project.measurement_delayed_by ?? undefined,
    });
  }
  return entries.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}
