import { NextResponse } from 'next/server';
import { contractRevisionFailure, contractRevisionReadAccess, contractRevisionWriteAccess, loadContractDocumentRevisions, normalizedRevisionEvidence, publicDocumentRevision } from '@/lib/contracts/documentRevisionsServer';
import { overviewHeaders, overviewUuid } from '@/lib/workflow/projectOverview';
import type { Database } from '@/lib/supabase/database.types';

type Context = { params: Promise<{ projectId: string }> };
type RevisionRow = Database['public']['Tables']['contract_document_revisions']['Row'];

export async function GET(_request: Request, { params }: Context) {
 const { projectId } = await params;
 const access = await contractRevisionReadAccess(projectId);
 if (access.response) return access.response;
 try {
  return NextResponse.json({ documentRevisions: await loadContractDocumentRevisions(access.admin, projectId) }, { headers: { ...overviewHeaders, 'X-Alumex-Actor': access.auth.user.id } });
 } catch {
  return NextResponse.json({ error: 'Unable to load contract document revisions.' }, { status: 500, headers: overviewHeaders });
 }
}

export async function POST(request: Request, { params }: Context) {
 const { projectId } = await params;
 const body = await request.json().catch(() => null) as Record<string, unknown> | null;
 if (!body || !['create', 'approve', 'sign'].includes(String(body.action))) return NextResponse.json({ error: 'Choose a supported contract revision action.' }, { status: 400, headers: overviewHeaders });
 const access = await contractRevisionWriteAccess(projectId, body.action === 'create');
 if (access.response) return access.response;
 const { admin, auth } = access;
 const headers = { ...overviewHeaders, 'X-Alumex-Actor': auth.user.id };
 if (body.action === 'create') {
  if (!Number.isInteger(body.sourceRevision) || Number(body.sourceRevision) < 1) return NextResponse.json({ error: 'The source contract revision is required.' }, { status: 400, headers });
  const result = await admin.rpc('create_contract_document_revision', { p_project: projectId, p_source_revision: body.sourceRevision as number, p_actor: auth.user.id });
  if (result.error) { const failure = contractRevisionFailure(result.error); return NextResponse.json({ error: failure.message }, { status: failure.status, headers }); }
  return NextResponse.json({ documentRevision: publicDocumentRevision(result.data as unknown as RevisionRow) }, { headers });
 }
 if (typeof body.id !== 'string' || !overviewUuid.test(body.id) || !Number.isInteger(body.revision) || Number(body.revision) < 1) return NextResponse.json({ error: 'Reload the contract revision before continuing.' }, { status: 400, headers });
 if (body.action === 'approve' && body.confirmed !== true) return NextResponse.json({ error: 'Confirm the client approved this revised contract.' }, { status: 400, headers });
 let evidence;
 if (body.action === 'sign') {
  try { evidence = normalizedRevisionEvidence(body.evidence); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Check the signing details.' }, { status: 400, headers }); }
 }
 const revision = await admin.from('contract_document_revisions').select('id,superseded_at').eq('id', body.id).eq('project_id', projectId).maybeSingle();
 if (revision.error) { const failure = contractRevisionFailure(revision.error); return NextResponse.json({ error: failure.message }, { status: failure.status, headers }); }
 if (!revision.data) return NextResponse.json({ error: 'Contract document revision not found.' }, { status: 404, headers });
 if (revision.data.superseded_at) return NextResponse.json({ error: 'This revision was replaced after a client name correction. Select the latest contract revision.' }, { status: 409, headers });
 const result = body.action === 'approve'
  ? await admin.rpc('approve_contract_document_revision', { p_id: body.id, p_revision: body.revision as number, p_actor: auth.user.id })
  : await admin.rpc('sign_contract_document_revision', { p_id: body.id, p_revision: body.revision as number, p_evidence: evidence!, p_actor: auth.user.id });
 if (result.error) { const failure = contractRevisionFailure(result.error); return NextResponse.json({ error: failure.message }, { status: failure.status, headers }); }
 return NextResponse.json({ documentRevision: publicDocumentRevision(result.data as unknown as RevisionRow) }, { headers });
}
