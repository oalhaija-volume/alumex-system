import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { appRoles } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const auth = await requireRole(appRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // The employee overview contains status only. Contacts and commercial details
  // stay in the sales workspace behind its own role and project checks.
  let query = createAdminClient().from('projects')
    .select('id,project_name,project_number,structure_readiness,sales_status,status,updated_at,measurement_delayed,client_cancelled_at')
    .is('archived_at', null).order('updated_at', { ascending: false });
  if (auth.role === 'Outdoor Sales') {
    query = query.or(`created_by.eq.${auth.user.id},assigned_outdoor_sales_id.eq.${auth.user.id}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load project stages.' }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
