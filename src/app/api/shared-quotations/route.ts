import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { canAccessProjectRow } from '@/lib/auth/projectBranchAccess';
import { createAdminClient } from '@/lib/supabase/admin';
import { quotationRoles } from '@/lib/auth/permissions';

export async function GET() {
  const auth = await requireRole(quotationRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role !== 'Indoor Sales' || auth.profile?.status !== 'Active') return NextResponse.json({ projects: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const admin = createAdminClient();
  const grants = await admin.from('project_quotation_price_access').select('project_id')
    .eq('employee_id', auth.user.id).is('revoked_at', null);
  // Existing installations remain usable while the additive migration rolls out.
  if (grants.error && ['42P01', 'PGRST205'].includes(grants.error.code)) {
    return NextResponse.json({ projects: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (grants.error) return NextResponse.json({ error: 'Unable to load shared quotations.' }, { status: 500 });
  const ids = [...new Set((grants.data ?? []).map(grant => grant.project_id as string))];
  if (!ids.length) return NextResponse.json({ projects: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const projects = await admin.from('projects')
    .select('id,project_number,project_name,branch,governorate,governorate_office,sales_status,updated_at')
    .in('id', ids).is('archived_at', null).order('updated_at', { ascending: false });
  if (projects.error) return NextResponse.json({ error: 'Unable to load shared quotations.' }, { status: 500 });
  const actor = { id: auth.user.id, role: auth.role, branch: auth.profile?.branch };
  return NextResponse.json({ projects: (projects.data ?? []).filter(project => !canAccessProjectRow(actor, project)) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
