import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

type Admin = ReturnType<typeof createAdminClient>;
export type OfflineQuotationOperation = { id: string; recordedAt: string; actorId: string };
type SyncError = { code?: string; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function offlineQuotationOperation(headers: Headers): OfflineQuotationOperation | null {
  const id = headers.get('X-Alumex-Offline-Operation');
  const recordedAt = headers.get('X-Alumex-Offline-Recorded-At');
  const actorId = headers.get('X-Alumex-Offline-Actor');
  if (id === null && recordedAt === null && actorId === null) return null;
  if (!id || !uuid.test(id) || !actorId || !uuid.test(actorId) || !recordedAt
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(recordedAt)
    || !Number.isFinite(Date.parse(recordedAt))) throw new Error('Invalid offline quotation operation headers.');
  return { id, recordedAt: new Date(recordedAt).toISOString(), actorId };
}

export function offlineQuotationFailure(error: SyncError) {
  if (error.code === '42501') return { status: 403, code: 'OFFLINE_QUOTATION_ACCESS_REVOKED' };
  if (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01') {
    return { status: 503, code: 'OFFLINE_QUOTATION_SYNC_UNAVAILABLE' };
  }
  if (/already used for different work/i.test(error.message)) return { status: 409, code: 'OFFLINE_QUOTATION_OPERATION_MISMATCH' };
  if (/signed contracts|project is closed|history is read-only/i.test(error.message)) {
    return { status: 409, code: 'OFFLINE_QUOTATION_LOCKED' };
  }
  if (error.code === '40001' || /project changed|measurements changed|additional measurements|reload|complete measurements/i.test(error.message)) {
    return { status: 409, code: 'OFFLINE_QUOTATION_CONFLICT' };
  }
  return { status: 400, code: 'OFFLINE_QUOTATION_INVALID' };
}

export function replayOfflineQuotation(admin: Admin, operation: OfflineQuotationOperation,
  actorId: string, projectId: string, originalRequest: Record<string, unknown>) {
  return admin.rpc('replay_offline_quotation', { p_operation: operation.id, p_actor: actorId, p_project: projectId,
    p_request: originalRequest as Json, p_recorded_at: operation.recordedAt });
}

export function syncOfflineQuotation(admin: Admin, operation: OfflineQuotationOperation,
  actorId: string, projectId: string, expectedRevision: number,
  payload: Json, originalRequest: Record<string, unknown>) {
  return admin.rpc('sync_offline_quotation', { p_operation: operation.id, p_actor: actorId, p_project: projectId,
    p_expected_revision: expectedRevision, p_payload: payload, p_request: originalRequest as Json,
    p_recorded_at: operation.recordedAt });
}
