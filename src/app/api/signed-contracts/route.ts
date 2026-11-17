import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { quotationRoles } from '@/lib/auth/permissions';
import { canAccessProjectRow, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { employeeBranches } from '@/lib/intake/projectBranch';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSupabaseServiceRoleKey } from '@/lib/supabase/config';
import { signedContractBranches, signedContractRecord, type SignedContractRow, type SignedContractsData } from '@/lib/contracts/signedContracts';
import type { FieldActor } from '@/lib/offline/types';

const pageSize = 200;
const summaryFields = 'project_id,revision,signed_at,contract_number:contract->>number,contract_total:contract->quotation->>total,contract_currency:contract->quotation->>currency,signer:evidence->>signer,method:evidence->>method,project:projects!inner(id,client_id,branch,governorate,project_name,project_number,address,structure_readiness,sales_status,status,next_follow_up_at,project_notes,created_at,created_by,updated_at)';

export async function GET() {
  const auth = await requireRole(quotationRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasSupabaseServiceRoleKey()) return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 });
  const branch = employeeBranches.find(value => value === auth.profile?.branch) ?? null;
  const actor: FieldActor = {
    id: auth.user.id,
    role: auth.role,
    name: auth.profile?.full_name ?? auth.profile?.username ?? 'Employee',
    branch,
  };
  const branches = signedContractBranches(actor);
  const data: SignedContractsData = { actor, branches, records: [] };
  const responseHeaders = { 'Cache-Control': 'private, no-store' };
  const allowed = projectBranchesForActor(actor);
  if (allowed?.length === 0) return NextResponse.json(data, { headers: responseHeaders });
  const admin = createAdminClient();
  const rows: SignedContractRow[] = [];
  // Page explicitly rather than accepting the database's default row cap.
  // signed_at remains populated when Operations accepts a signed contract.
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from('sales_workflows').select(summaryFields)
      .not('signed_at', 'is', null).not('contract', 'is', null).neq('contract', 'null')
      .order('signed_at', { ascending: false }).order('project_id')
      .range(offset, offset + pageSize - 1);
    if (allowed !== null) {
      // Older Najaf projects can still be stored under Governorates. The row
      // guard checks effective geography before any client lookup or response.
      query = query.in('project.branch', allowed.includes('Najaf') ? [...allowed, 'Governorates'] : allowed);
    }
    const result = await query;
    if (result.error) return NextResponse.json({ error: 'Unable to load signed contracts.' }, { status: 500 });
    const page = (result.data ?? []) as unknown as SignedContractRow[];
    rows.push(...page.filter(row => canAccessProjectRow(actor, row.project)));
    if (page.length < pageSize) break;
  }
  const clients = new Map<string, { client_name: string; mobile: string | null }>();
  const clientIds = [...new Set(rows.map(row => row.project.client_id).filter((id): id is string => !!id))];
  for (let offset = 0; offset < clientIds.length; offset += pageSize) {
    const result = await admin.from('clients').select('id,client_name,mobile').in('id', clientIds.slice(offset, offset + pageSize));
    if (result.error) return NextResponse.json({ error: 'Unable to load contract clients.' }, { status: 500 });
    for (const client of result.data ?? []) clients.set(client.id, client);
  }
  data.records = rows.flatMap(row => {
    const record = signedContractRecord(row, actor, clients.get(row.project.client_id ?? ''));
    return record ? [record] : [];
  });
  return NextResponse.json(data, { headers: responseHeaders });
}
