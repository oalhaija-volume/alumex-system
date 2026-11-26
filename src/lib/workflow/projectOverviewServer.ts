import 'server-only';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { projectOverviewRoles } from '@/lib/auth/permissions';
import { canAccessProjectRow } from '@/lib/auth/projectBranchAccess';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSupabaseServiceRoleKey } from '@/lib/supabase/config';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { FieldProject } from '@/lib/offline/types';
import { loadMeasurementAttempts, workspaceProjectColumns } from '@/lib/measurements/visitHistory';
import type { MeasurementReport } from '@/lib/measurements/completion';
import type { FollowUpEntry } from './followUps';
import type { OpeningSizeHistory } from './openingSizeChanges';
import type { QuotationRevision, SalesFlow } from './types';
import type { ProjectOverviewClient, ProjectOverviewContact, ProjectOverviewData, ProjectOverviewOpening, ProjectOverviewSection } from './projectOverview';
import { overviewHeaders, overviewUuid } from './projectOverview';
import { loadContractDocumentRevisions } from '@/lib/contracts/documentRevisionsServer';

type Admin = ReturnType<typeof createAdminClient>;
type ProjectRow = Omit<FieldProject, 'registeredBy' | 'phone' | 'created_by'> & { client_id: string; created_by: string | null };
type DatabaseError = { code?: string; message?: string };
type ReadResult<T> = { data: T | null; error: DatabaseError | null };
type Receipt = Pick<Database['public']['Tables']['field_sync_receipts']['Row'], 'operation_id' | 'project_id' | 'actor_id' | 'action' | 'recorded_at' | 'result'>;
type Person = { id: string; full_name: string | null; username: string | null };
type SavedOpening = Omit<ProjectOverviewOpening, 'recordedBy' | 'curtain_wall_capture' | 'skylight_capture'> & Partial<Pick<ProjectOverviewOpening, 'curtain_wall_capture' | 'skylight_capture'>>;

export { overviewHeaders, overviewUuid } from './projectOverview';
const missingTable = (error: DatabaseError | null) => !!error && ['42P01', 'PGRST205'].includes(error.code ?? '');
// Capture JSON can contain large data URLs. The measurement list carries flags;
// an authorized opening-specific request retrieves the saved capture on demand.
export const overviewOpeningColumns = 'id,project_id,created_by,created_at,updated_at,has_arch,has_roller_shutter,work_area,facade_number,has_curtain_wall_capture,has_skylight_capture,floor,room,opening_code,site_readiness,width,height,solid_panel_height,fixed_height,quantity,area_sqm,product_system,glass_type,aluminum_color,shape,opening_type,bottom_frame,opening_direction,glass_color,measurement_request_id,measurement_visit_id,measurement_submission_id,measurement_version,notes';

export class ProjectOverviewLoadError extends Error {}

// The branch guard runs before any client, commercial document, photo or
// history lookup. This endpoint never expands the commercial mutation roles.
export async function projectOverviewAccess(projectId: string) {
 const auth = await requireRole(projectOverviewRoles);
 if (!auth.ok) return { response: NextResponse.json({ error: auth.error }, { status: auth.status, headers: overviewHeaders }) };
 if (!overviewUuid.test(projectId)) return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: overviewHeaders }) };
 if (!hasSupabaseServiceRoleKey()) return { response: NextResponse.json({ error: 'Project details are unavailable.' }, { status: 503, headers: overviewHeaders }) };
 const admin = createAdminClient();
 const result = await admin.from('projects').select(workspaceProjectColumns).eq('id', projectId).maybeSingle();
 if (result.error) return { response: NextResponse.json({ error: 'Unable to load project.' }, { status: 500, headers: overviewHeaders }) };
 const project = result.data as unknown as ProjectRow | null;
 if (!project || project.archived_at || !canAccessProjectRow({ id: auth.user.id, role: auth.role, branch: auth.profile?.branch }, project)) {
  return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: overviewHeaders }) };
 }
 return { auth, admin, project };
}

async function optionalRead<T>(read: PromiseLike<ReadResult<T>>, warnings: string[], message: string, fallback: T): Promise<T> {
 const result = await read;
 if (!result.error) return result.data ?? fallback;
 if (missingTable(result.error)) { warnings.push(message); return fallback; }
 throw new ProjectOverviewLoadError(message);
}

async function rows<T>(read: (offset: number) => PromiseLike<ReadResult<T[]>>, message: string, warnings?: string[]): Promise<T[]> {
 const saved: T[] = [];
 for (let offset = 0; ; offset += 1000) {
  const result = await read(offset);
  if (result.error) {
   if (warnings && missingTable(result.error)) { warnings.push(message); return []; }
   throw new ProjectOverviewLoadError(message);
  }
  saved.push(...(result.data ?? []));
  if (!result.data || result.data.length < 1000) return saved;
 }
}

// Copy JSON snapshots without disclosing private bucket object paths. Saved
// dimensions, charges, signatures, dates and historical prices stay intact.
function withoutStoragePaths<T>(value: T): T {
 if (Array.isArray(value)) return value.map(item => withoutStoragePaths(item)) as T;
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'path' && key !== 'storagePath').map(([key, item]) => [key, withoutStoragePaths(item)])) as T;
 return value;
}

export function hasOverviewSignedCopy(flow: Pick<SalesFlow, 'contract' | 'evidence' | 'signed_at'> | null, projectId: string): boolean {
 if (!flow?.contract || !flow.signed_at || flow.evidence?.method !== 'upload'
  || typeof flow.evidence.path !== 'string' || !flow.evidence.path.startsWith(`${projectId}/`)) return false;
 const objectName = flow.evidence.path.slice(projectId.length + 1);
 return /^[A-Za-z0-9._-]+$/.test(objectName) && objectName !== '.' && objectName !== '..';
}

export async function loadProjectOverview(access: Exclude<Awaited<ReturnType<typeof projectOverviewAccess>>, { response: unknown }>, section: ProjectOverviewSection = 'overview', legacyFull = false): Promise<ProjectOverviewData> {
 const { admin, project, auth } = access;
 const warnings: string[] = [];
 const measurements = legacyFull || section === 'measurements';
 const documents = legacyFull || section === 'quotation' || section === 'contract';
 const [client, contacts, openings, flow, history, reports, sizeHistory, receipts, attempts, documentRevisions] = await Promise.all([
  optionalRead<ProjectOverviewClient | null>(admin.from('clients').select('id,name:client_name,mobile,alternate_mobile,address,province,city,email,notes,client_type,company_name,whatsapp,preferred_language').eq('id', project.client_id).maybeSingle(), warnings, 'Unable to load client information.', null),
  legacyFull || section === 'overview' ? rows<ProjectOverviewContact>(offset => admin.from('client_contacts').select('*').eq('client_id', project.client_id).or(`project_id.is.null,project_id.eq.${project.id}`).order('is_primary', { ascending: false }).order('id').range(offset, offset + 999), 'Unable to load project contacts.', warnings) : [],
  measurements ? rows<SavedOpening>(offset => {
   const query = legacyFull ? admin.from('openings').select('*') : admin.from('openings').select(overviewOpeningColumns);
   return query.eq('project_id', project.id).order('created_at').order('id').range(offset, offset + 999);
  }, 'Unable to load project measurements.') : [],
  documents ? optionalRead<SalesFlow | null>(admin.from('sales_workflows').select('project_id,revision,stage,quotation,contract,evidence,signed_at,accepted_at,accepted_by').eq('project_id', project.id).maybeSingle(), warnings, 'Quotation and contract information is unavailable on this installation.', null) : null,
  documents ? rows<QuotationRevision>(offset => admin.from('quotation_revisions').select('version,quotation,contract,previous_stage,superseded_at').eq('project_id', project.id).order('version', { ascending: false }).range(offset, offset + 999), 'Unable to load quotation history.', warnings) : [],
  measurements ? rows<MeasurementReport>(offset => admin.from('measurement_completion_reports').select('id,project_id,note,has_photo,recorded_by,recorded_by_name,recorded_at').eq('project_id', project.id).order('recorded_at', { ascending: false }).order('id').range(offset, offset + 999), 'Unable to load measurement notes.', warnings) : [],
  measurements ? rows<OpeningSizeHistory>(offset => admin.from('opening_size_history').select('*').eq('project_id', project.id).order('changed_at', { ascending: false }).order('id').range(offset, offset + 999), 'Unable to load size change history.', warnings) : [],
  legacyFull || section === 'follow-ups' ? rows<Receipt>(offset => admin.from('field_sync_receipts').select('operation_id,project_id,actor_id,action,recorded_at,result').eq('project_id', project.id).in('action', ['follow-up', 'ready', 'assign-measurements', 'cancel-project', 'reactivate-project']).order('recorded_at', { ascending: false }).order('operation_id').range(offset, offset + 999), 'Unable to load follow-up history.', warnings) : [],
  measurements ? loadMeasurementAttempts(admin, [project.id]) : { data: null, error: null },
  legacyFull || section === 'contract' ? loadContractDocumentRevisions(admin, project.id) : [],
 ]);
 if (attempts.error) {
  if (missingTable(attempts.error)) warnings.push('Unable to load visit history.');
  else throw new ProjectOverviewLoadError('Unable to load visit history.');
 }
 const personIds = [...new Set([project.created_by, project.assigned_outdoor_sales_id, project.follow_up_owner_id, project.legacy_outdoor_sales_id, project.measurement_delayed_by, project.client_cancelled_by, ...openings.map(opening => opening.created_by), ...receipts.map(receipt => receipt.actor_id), ...sizeHistory.map(change => change.changed_by)].filter((id): id is string => !!id))];
 const people: Person[] = [];
 for (let start = 0; start < personIds.length; start += 100) {
  const batch = await rows<Person>(offset => admin.from('profiles').select('id,full_name,username').in('id', personIds.slice(start, start + 100)).order('id').range(offset, offset + 999), 'Unable to load employee names.');
  people.push(...batch);
 }
 const names = new Map(people.map(person => [person.id, person.full_name ?? person.username ?? 'Employee']));
 const name = (id: string | null | undefined) => id ? names.get(id) ?? 'Employee' : null;
 const entries: FollowUpEntry[] = receipts.map(receipt => {
  const value = receipt.result && typeof receipt.result === 'object' && !Array.isArray(receipt.result) ? receipt.result as Record<string, Json> : {};
  const action = receipt.action as Exclude<FollowUpEntry['action'], 'snapshot'>;
  return {
   id: receipt.operation_id, action, recordedAt: receipt.recorded_at, recordedBy: name(receipt.actor_id) ?? 'Employee',
   note: action === 'reactivate-project' && typeof value.reactivation_note === 'string' ? value.reactivation_note : action === 'cancel-project' && typeof value.client_cancellation_note === 'string' ? value.client_cancellation_note : action === 'follow-up' && typeof value.project_notes === 'string' ? value.project_notes : '',
   nextFollowUp: action === 'follow-up' && typeof value.next_follow_up_at === 'string' ? value.next_follow_up_at : null,
   followUpType: typeof value.follow_up_type === 'string' ? value.follow_up_type : null,
   followUpDetail: typeof value.follow_up_detail === 'string' ? value.follow_up_detail : null,
   followUpOwner: typeof value.follow_up_owner_name === 'string' ? value.follow_up_owner_name : null,
   assignedOutdoorSales: typeof value.assignedOutdoorSales === 'string' ? value.assignedOutdoorSales : null,
  };
 });
 if ((legacyFull || section === 'follow-ups') && !entries.some(entry => entry.action === 'follow-up') && project.project_notes) entries.push({ id: 'previous-note', action: 'snapshot', note: project.project_notes, nextFollowUp: project.next_follow_up_at, recordedAt: null, recordedBy: 'Not recorded' });
 const record: FieldProject = { ...project, created_by: project.created_by ?? '', phone: client?.mobile ?? null, client_name: client?.name, registeredBy: name(project.created_by) ?? 'Employee', assignedOutdoorSales: name(project.assigned_outdoor_sales_id), followUpOwner: name(project.follow_up_owner_id), legacyOutdoorSalesOwner: name(project.legacy_outdoor_sales_id), measurementDelayedBy: name(project.measurement_delayed_by), clientCancelledBy: name(project.client_cancelled_by), measurement_attempts: attempts.data?.get(project.id) ?? [] };
 return {
  section: legacyFull ? undefined : section,
  actor: { id: auth.user.id, role: auth.role, name: auth.profile?.full_name ?? auth.profile?.username ?? undefined, branch: auth.profile?.branch ?? null },
  project: record, client, contacts, openings: openings.map(opening => ({ ...opening, curtain_wall_capture: legacyFull ? opening.curtain_wall_capture ?? null : null, skylight_capture: legacyFull ? opening.skylight_capture ?? null : null, recordedBy: name(opening.created_by) ?? 'Employee' })),
  flow: withoutStoragePaths(flow), history: withoutStoragePaths(history), followUps: { project: record, entries }, measurementReports: reports,
  sizeHistory: sizeHistory.map(change => ({ ...change, changed_by_name: name(change.changed_by) ?? 'Employee' })), warnings: [...new Set(warnings)], signedCopyAvailable: hasOverviewSignedCopy(flow, project.id), documentRevisions,
 };
}

export async function loadOverviewOpeningCapture(admin: Admin, projectId: string, openingId: string) {
 const result = await admin.from('openings').select('curtain_wall_capture,skylight_capture').eq('project_id', projectId).eq('id', openingId).maybeSingle();
 if (result.error) return { response: NextResponse.json({ error: 'Unable to load project measurements.' }, { status: 500, headers: overviewHeaders }) };
 if (!result.data) return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: overviewHeaders }) };
 return { capture: result.data };
}

export async function loadOverviewReportPhoto(admin: Admin, projectId: string, reportId: string) {
 const result = await admin.from('measurement_completion_reports').select('photo').eq('project_id', projectId).eq('id', reportId).maybeSingle();
 if (missingTable(result.error)) return { response: NextResponse.json({ error: 'Measurement report not found.' }, { status: 404, headers: overviewHeaders }) };
 if (result.error) return { response: NextResponse.json({ error: 'Unable to load measurement photo.' }, { status: 500, headers: overviewHeaders }) };
 const report = result.data;
 if (!report) return { response: NextResponse.json({ error: 'Measurement report not found.' }, { status: 404, headers: overviewHeaders }) };
 return { photo: typeof report.photo === 'string' ? report.photo : null };
}
