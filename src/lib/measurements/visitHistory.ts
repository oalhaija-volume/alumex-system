import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { measurementDelayReasons, type MeasurementDelayReason } from '@/lib/measurements/measurementDelay';
import { indoorProjectBranches } from '@/lib/auth/projectBranchAccess';

type Admin = ReturnType<typeof createAdminClient>;
type Actor = { id: string; role: string; branch?: string | null };

export const workspaceProjectColumns = 'id,additional_openings_state,additional_openings_original_ids,building_type,branch,governorate,project_name,project_number,address,location_latitude,location_longitude,client_id,structure_readiness,sales_status,status,next_follow_up_at,follow_up_type,follow_up_detail,follow_up_owner_id,created_by,created_at,updated_at,project_notes,readiness_note,measurement_delayed,measurement_delay_reason,measurement_delay_note,measurement_delayed_at,measurement_delayed_by,client_cancellation_note,client_cancelled_at,client_cancelled_by,assigned_outdoor_sales_id,measurement_assignment_id,original_creator_role' as const;

export const measurementHistoryActions = ['delay-measurements', 'assign-measurements', 'ready', 'request-openings', 'resume-measurements', 'finish'] as const;
export type MeasurementHistoryAction = typeof measurementHistoryActions[number];
export type MeasurementAttempt = {
  id: string;
  projectId: string;
  action: MeasurementHistoryAction;
  reason: MeasurementDelayReason | null;
  note: string;
  recordedAt: string;
  recordedBy: string;
  recordedById: string;
  assignedOutdoorSales: string | null;
};

export function isHistoricalProject(project: { created_by: string | null; assigned_outdoor_sales_id: string | null }, actor: Actor) {
  return actor.role === 'Outdoor Sales' && project.created_by !== actor.id && project.assigned_outdoor_sales_id !== actor.id;
}

export async function loadWorkspaceProjects(admin: Admin, actor: Actor) {
  let query = admin.from('projects').select(workspaceProjectColumns).order('created_at', { ascending: false });
  if (actor.role === 'Outdoor Sales') query = query.or(`created_by.eq.${actor.id},assigned_outdoor_sales_id.eq.${actor.id}`);
  if (actor.role === 'Indoor Sales') query = query.in('branch', indoorProjectBranches(actor.branch));
  const result = await query;
  if (result.error || actor.role !== 'Outdoor Sales') return result;

  // A reassigned task remains in its previous visitor's read-only log. This
  // does not change project RLS or grant access to measurement write endpoints.
  const previousIds = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const previous = await admin.from('field_sync_receipts').select('project_id')
      .eq('actor_id', actor.id).in('action', ['delay-measurements', 'finish'])
      .order('operation_id').range(offset, offset + 999);
    if (previous.error) return { ...result, data: null, error: previous.error };
    for (const row of previous.data) previousIds.add(row.project_id);
    if (previous.data.length < 1000) break;
  }
  for (const project of result.data) previousIds.delete(project.id);
  const ids = [...previousIds];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const previous = await admin.from('projects').select(workspaceProjectColumns).in('id', ids.slice(offset, offset + 100));
    if (previous.error) return { ...result, data: null, error: previous.error };
    result.data.push(...previous.data);
  }
  result.data.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return result;
}

type Receipt = { operation_id: string; project_id: string; actor_id: string; action: string; recorded_at: string; result: Json };

export function measurementAttemptFromReceipt(row: Receipt, recordedBy: string): MeasurementAttempt {
  const value = row.result && typeof row.result === 'object' && !Array.isArray(row.result) ? row.result : {};
  const reason = measurementDelayReasons.find(reason => reason === value.measurement_delay_reason) ?? 'client_delay';
  return {
    id: row.operation_id,
    projectId: row.project_id,
    action: row.action as MeasurementHistoryAction,
    reason: row.action === 'delay-measurements' ? reason : null,
    note: row.action === 'delay-measurements' && typeof value.measurement_delay_note === 'string' ? value.measurement_delay_note : '',
    recordedAt: row.recorded_at,
    recordedBy,
    recordedById: row.actor_id,
    assignedOutdoorSales: typeof value.assignedOutdoorSales === 'string' ? value.assignedOutdoorSales : null,
  };
}

export async function loadMeasurementAttempts(admin: Admin, projectIds: string[]) {
  const rows: Receipt[] = [];
  for (let start = 0; start < projectIds.length; start += 100) {
    for (let offset = 0; ; offset += 1000) {
      const result = await admin.from('field_sync_receipts')
        .select('operation_id,project_id,actor_id,action,recorded_at,result')
        .in('project_id', projectIds.slice(start, start + 100)).in('action', [...measurementHistoryActions])
        .order('recorded_at', { ascending: false }).order('operation_id').range(offset, offset + 999);
      if (result.error) return { data: null, error: result.error };
      rows.push(...result.data);
      if (result.data.length < 1000) break;
    }
  }
  const actorIds = [...new Set(rows.map(row => row.actor_id))];
  const people = new Map<string, string>();
  for (let offset = 0; offset < actorIds.length; offset += 100) {
    const result = await admin.from('profiles').select('id,full_name,username').in('id', actorIds.slice(offset, offset + 100));
    if (result.error) return { data: null, error: result.error };
    for (const person of result.data) people.set(person.id, person.full_name ?? person.username ?? 'Employee');
  }
  const attempts = new Map<string, MeasurementAttempt[]>();
  for (const row of rows) {
    const entries = attempts.get(row.project_id) ?? [];
    entries.push(measurementAttemptFromReceipt(row, people.get(row.actor_id) ?? 'Employee'));
    attempts.set(row.project_id, entries);
  }
  return { data: attempts, error: null };
}
