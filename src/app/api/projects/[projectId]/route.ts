import { NextResponse } from 'next/server';
import { hasOverviewSignedCopy, loadOverviewOpeningCapture, loadOverviewReportPhoto, loadProjectOverview, overviewHeaders, overviewUuid, projectOverviewAccess, ProjectOverviewLoadError } from '@/lib/workflow/projectOverviewServer';
import { projectOverviewSections, type ProjectOverviewSection } from '@/lib/workflow/projectOverview';
import type { SalesFlow } from '@/lib/workflow/types';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
 const { projectId } = await params;
 const access = await projectOverviewAccess(projectId);
 if (access.response) return access.response;
 const headers = { ...overviewHeaders, 'X-Alumex-Actor': access.auth.user.id };
 const query = new URL(request.url).searchParams;
 if (query.has('opening')) {
  const openingId = query.get('opening') ?? '';
  if (!overviewUuid.test(openingId) || query.has('report') || query.has('download')) return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers });
  const result = await loadOverviewOpeningCapture(access.admin, projectId, openingId);
  return result.response ?? NextResponse.json(result.capture, { headers });
 }
 if (query.has('report')) {
  const reportId = query.get('report') ?? '';
  if (!overviewUuid.test(reportId) || query.has('download')) return NextResponse.json({ error: 'Measurement report not found.' }, { status: 404, headers });
  const result = await loadOverviewReportPhoto(access.admin, projectId, reportId);
  return result.response ?? NextResponse.json({ photo: result.photo }, { headers });
 }
 if (query.has('download')) {
  if (query.get('download') !== 'signed') return NextResponse.json({ error: 'Signed file not found.' }, { status: 404, headers });
  const result = await access.admin.from('sales_workflows').select('evidence,signed_at,contract').eq('project_id', projectId).maybeSingle();
  if (result.error && ['42P01', 'PGRST205'].includes(result.error.code)) return NextResponse.json({ error: 'Signed file not found.' }, { status: 404, headers });
  if (result.error) return NextResponse.json({ error: 'Unable to load signed document.' }, { status: 500, headers });
  const flow = result.data as unknown as Pick<SalesFlow, 'evidence' | 'signed_at' | 'contract'> | null;
  if (!hasOverviewSignedCopy(flow, projectId) || !flow?.evidence?.path) return NextResponse.json({ error: 'Signed file not found.' }, { status: 404, headers });
  const file = await access.admin.storage.from('signed-contracts-private').download(flow.evidence.path);
  if (file.error || !file.data) return NextResponse.json({ error: 'Unable to retrieve signed file.' }, { status: 500, headers });
  return new Response(file.data, { headers: { ...headers, 'Content-Type': file.data.type || 'application/octet-stream', 'Content-Disposition': 'attachment; filename="signed-contract"', 'X-Content-Type-Options': 'nosniff' } });
 }
 try {
  const section = query.get('section') ?? 'overview';
  if (!projectOverviewSections.includes(section as ProjectOverviewSection)) return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers });
  return NextResponse.json(await loadProjectOverview(access, section as ProjectOverviewSection, !query.has('section')), { headers });
 } catch (error) {
  return NextResponse.json({ error: error instanceof ProjectOverviewLoadError ? error.message : 'Unable to load project details.' }, { status: 500, headers });
 }
}
