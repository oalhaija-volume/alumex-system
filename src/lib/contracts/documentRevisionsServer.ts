import 'server-only';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { projectOverviewRoles, quotationRoles, type AppRole } from '@/lib/auth/permissions';
import { canAccessProjectRow } from '@/lib/auth/projectBranchAccess';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSupabaseServiceRoleKey } from '@/lib/supabase/config';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';
import { overviewHeaders, overviewUuid } from '@/lib/workflow/projectOverview';
import type { ContractDocumentRevision } from './documentRevisions';

type Admin = ReturnType<typeof createAdminClient>;
type RevisionRow = Database['public']['Tables']['contract_document_revisions']['Row'];
type ErrorInfo = { code?: string; message?: string };

export const documentRevisionColumns = 'id,project_id,document_revision,source_workflow_revision,source_signed_at,format_version,revision_reason,superseded_at,status,revision,contract,created_by,created_at,approved_by,approved_at,signed_at,evidence';
const missingTable = (error: ErrorInfo) => ['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? '');

function withoutStoragePaths<T>(value: T): T {
 if (Array.isArray(value)) return value.map(withoutStoragePaths) as T;
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'path' && key !== 'storagePath').map(([key, item]) => [key, withoutStoragePaths(item)])) as T;
 return value;
}

export function publicDocumentRevision(row: Omit<RevisionRow, 'source_contract'>): ContractDocumentRevision {
 return {
  id: row.id, project_id: row.project_id, document_revision: row.document_revision, source_workflow_revision: row.source_workflow_revision,
  source_signed_at: row.source_signed_at, format_version: row.format_version, revision_reason: row.revision_reason, superseded_at: row.superseded_at, status: row.status, revision: row.revision,
  contract: withoutStoragePaths(row.contract) as unknown as ContractSnapshot, created_by: row.created_by, created_at: row.created_at,
  approved_by: row.approved_by, approved_at: row.approved_at, signed_at: row.signed_at, evidence: withoutStoragePaths(row.evidence) as unknown as SignedEvidence | null,
 };
}

export async function loadContractDocumentRevisions(admin: Admin, projectId: string): Promise<ContractDocumentRevision[]> {
 const saved: ContractDocumentRevision[] = [];
 for (let offset = 0; ; offset += 1000) {
  const result = await admin.from('contract_document_revisions').select(documentRevisionColumns).eq('project_id', projectId)
   .order('document_revision', { ascending: false }).range(offset, offset + 999);
  if (result.error) {
   if (missingTable(result.error)) return [];
   throw new Error('Unable to load contract document revisions.');
  }
  const rows = result.data as unknown as RevisionRow[];
  saved.push(...rows.map(publicDocumentRevision));
  if (rows.length < 1000) return saved;
 }
}

async function contractRevisionAccess(projectId: string, roles: readonly AppRole[]) {
 const auth = await requireRole(roles);
 if (!auth.ok) return { response: NextResponse.json({ error: auth.error }, { status: auth.status, headers: overviewHeaders }) };
 if (!overviewUuid.test(projectId)) return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: overviewHeaders }) };
 if (!hasSupabaseServiceRoleKey()) return { response: NextResponse.json({ error: 'Contract document revisions are unavailable.' }, { status: 503, headers: overviewHeaders }) };
 const admin = createAdminClient();
 const result = await admin.from('projects').select('id,branch,governorate,governorate_office,archived_at').eq('id', projectId).maybeSingle();
 if (result.error) return { response: NextResponse.json({ error: 'Unable to load project.' }, { status: 500, headers: overviewHeaders }) };
 if (!result.data || result.data.archived_at || !canAccessProjectRow({ id: auth.user.id, role: auth.role, branch: auth.profile?.branch }, result.data)) {
  return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: overviewHeaders }) };
 }
 return { auth, admin };
}

export function contractRevisionWriteAccess(projectId: string, create: boolean) {
 return contractRevisionAccess(projectId, create ? ['Admin'] : quotationRoles);
}

export function contractRevisionReadAccess(projectId: string) {
 return contractRevisionAccess(projectId, [...projectOverviewRoles, ...quotationRoles]);
}

export function normalizedRevisionEvidence(input: unknown): Json {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Confirm the client signed this revised contract.');
 const value = input as Record<string, unknown>;
 if (value.confirmed !== true) throw new Error('Confirm the client signed this revised contract.');
 const signer = typeof value.signer === 'string' ? value.signer.trim() : '';
 if (signer.length < 2 || signer.length > 200 || !['digital', 'hard_copy'].includes(String(value.method))) throw new Error('Enter the client signer and choose a supported signing method.');
 if (value.method === 'hard_copy') return { method: 'hard_copy', signer, confirmed: true };
 const signature = typeof value.signature === 'string' ? value.signature : '';
 if (signature.length < 500 || signature.length > 2000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(signature)) throw new Error('Please sign in the signature box.');
 if (Buffer.from(signature.split(',')[1], 'base64').subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid signature image.');
 return { method: 'digital', signer, signature, confirmed: true };
}

export function contractRevisionFailure(error: ErrorInfo) {
 if (missingTable(error)) return { status: 503, message: 'The contract document revision database update is required.' };
 if (error.code === '40001' || error.code === '23505') return { status: 409, message: 'The contract revision changed. Reload and try again.' };
 if (error.code === '42501') return { status: 403, message: 'You do not have permission to complete this action.' };
 return { status: error.code === '22023' ? 409 : 500, message: error.code === '22023' ? 'Check that the revised contract has the required client approval and signing details.' : 'Unable to update the contract document revision.' };
}
