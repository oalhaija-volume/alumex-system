import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { quotationRoles } from '@/lib/auth/permissions';
import { canAccessProjectRow, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSupabaseServiceRoleKey } from '@/lib/supabase/config';
import { loadWorkspaceRows } from '@/lib/measurements/visitHistory';
import { hasSharedQuotationPriceAccess } from '@/lib/quotations/sharedAccess';
import { offlineQuotationFlow, offlineQuotationProject, offlineQuotationProjectColumns,
  offlineQuotationOpeningColumns, type OfflineQuotationProject } from '@/lib/offline/quotationSnapshots';
import type { Database } from '@/lib/supabase/database.types';
import type { CatalogItem } from '@/lib/workflow/pricing';

type FlowRow = Database['public']['Tables']['sales_workflows']['Row'];
type ClientRow = { id: string; name: string; mobile: string; client_type: string | null };
type OpeningRow = { project_id: string; id: string; floor: string | null; room: string | null; width: number; height: number;
  quantity: number; work_area: string | null; facade_number: number | null; has_arch: boolean; has_roller_shutter: boolean;
  opening_type: string | null; opening_direction: string | null };

export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)) {
    return NextResponse.json({ error: 'Invalid quotation download cursor.' }, { status: 400 });
  }
  const auth = await requireRole(quotationRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasSupabaseServiceRoleKey()) return NextResponse.json({ error: 'Offline quotation download is unavailable.' }, { status: 503 });
  const admin = createAdminClient();
  const actor = { id: auth.user.id, role: auth.role, branch: auth.profile?.branch ?? null };
  const branches = projectBranchesForActor(actor);
  const projects: OfflineQuotationProject[] = [];
  // The complete authorized set is authoritative for device-side revocations.
  // Database and relation queries still use bounded pages and ID batches.
  if (branches === null || branches.length) {
    for (let offset = 0; ; offset += 1000) {
      let query = admin.from('projects').select(offlineQuotationProjectColumns).is('archived_at', null)
        .order('id').range(offset, offset + 999);
      if (branches !== null) query = query.in('branch', branches.includes('Najaf') ? [...branches, 'Governorates'] : branches);
      const page = await query;
      if (page.error) return NextResponse.json({ error: 'Unable to download quotations.' }, { status: 503 });
      const rows = page.data as OfflineQuotationProject[];
      projects.push(...rows.filter(project => canAccessProjectRow(actor, project)));
      if (rows.length < 1000) break;
    }
  }
  const accessByProject = new Map(projects.map(project => [project.id, 'full' as 'full' | 'prices']));
  if (auth.role === 'Indoor Sales') {
    const grantedIds: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const grants = await admin.from('project_quotation_price_access').select('project_id')
        .eq('employee_id', auth.user.id).is('revoked_at', null).order('project_id').range(offset, offset + 999);
      if (grants.error) return NextResponse.json({ error: 'Unable to verify shared quotation access.' }, { status: 503 });
      const rows = grants.data as { project_id: string }[];
      grantedIds.push(...rows.map(row => row.project_id).filter(id => !accessByProject.has(id)));
      if (rows.length < 1000) break;
    }
    const shared = await loadWorkspaceRows(grantedIds, (batch, offset) => admin.from('projects')
      .select(offlineQuotationProjectColumns).in('id', batch).is('archived_at', null).order('id').range(offset, offset + 999));
    if (shared.error) return NextResponse.json({ error: 'Unable to download shared quotations.' }, { status: 503 });
    for (const project of shared.data as OfflineQuotationProject[]) {
      const grant = await hasSharedQuotationPriceAccess(admin, project.id, auth.user.id);
      if (grant.error) return NextResponse.json({ error: 'Unable to verify shared quotation access.' }, { status: 503 });
      if (!grant.allowed) continue;
      projects.push(project);
      accessByProject.set(project.id, 'prices');
    }
  }
  const remaining = projects.sort((left, right) => left.id.localeCompare(right.id))
    .filter(project => !cursor || project.id.localeCompare(cursor) > 0);
  const pageProjects = remaining.slice(0, 50);
  const nextCursor = remaining.length > pageProjects.length ? pageProjects.at(-1)!.id : null;
  const ids = pageProjects.map(project => project.id);
  const clientIds = [...new Set(pageProjects.map(project => project.client_id))];
  const [flows, openings, clients] = await Promise.all([
    loadWorkspaceRows(ids, (batch, offset) => admin.from('sales_workflows').select('*')
      .in('project_id', batch).order('project_id').range(offset, offset + 999)),
    loadWorkspaceRows(ids, (batch, offset) => admin.from('openings').select(offlineQuotationOpeningColumns)
      .in('project_id', batch).order('id').range(offset, offset + 999)),
    loadWorkspaceRows(clientIds, (batch, offset) => admin.from('clients').select('id,name:client_name,mobile,client_type')
      .in('id', batch).order('id').range(offset, offset + 999)),
  ]);
  if (flows.error || openings.error || clients.error) return NextResponse.json({ error: 'Unable to download quotation details.' }, { status: 503 });
  const catalog: CatalogItem[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await admin.from('product_price_settings').select('id,name:product_name,category,unit,unit_price,is_active')
      .eq('is_active', true).order('product_name').order('id').range(offset, offset + 999);
    if (page.error) return NextResponse.json({ error: 'Unable to download quotation prices.' }, { status: 503 });
    const rows = page.data as CatalogItem[];
    catalog.push(...rows);
    if (rows.length < 1000) break;
  }
  const flowByProject = new Map((flows.data as FlowRow[]).map(flow => [flow.project_id, flow]));
  const clientById = new Map((clients.data as ClientRow[]).map(client => [client.id, client]));
  const openingsByProject = new Map<string, Omit<OpeningRow, 'project_id'>[]>();
  for (const { project_id, ...opening } of openings.data as OpeningRow[]) {
    const rows = openingsByProject.get(project_id) ?? [];
    rows.push(opening);
    openingsByProject.set(project_id, rows);
  }
  if (pageProjects.some(project => !clientById.has(project.client_id))) {
    return NextResponse.json({ error: 'A quotation contact changed. Retry the download.' }, { status: 409 });
  }
  return NextResponse.json({
    actor: { ...actor, name: auth.profile?.full_name ?? auth.profile?.username ?? 'Employee' },
    downloadedAt: new Date().toISOString(), complete: nextCursor === null, nextCursor, catalog,
    quotations: pageProjects.map(project => {
      const quotationAccess = accessByProject.get(project.id)!;
      const client = clientById.get(project.client_id)!;
      return { projectId: project.id, data: { quotationAccess, project: offlineQuotationProject(project, quotationAccess),
        client: { name: client.name, mobile: client.mobile, client_type: client.client_type },
        flow: offlineQuotationFlow(flowByProject.get(project.id) ?? null), openings: openingsByProject.get(project.id) ?? [],
        history: [], sizeHistory: [] } };
    }),
  }, { headers: { 'Cache-Control': 'private, no-store', 'X-Alumex-Actor': auth.user.id } });
}
