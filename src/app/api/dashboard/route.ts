import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { appRoles } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const auth = await requireRole(appRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // The employee overview contains project status and creation metadata only. Contacts and commercial details
  // stay in the sales workspace behind its own role and project checks.
  const admin = createAdminClient();
  let query = admin.from('projects')
    .select('id,project_name,project_number,structure_readiness,sales_status,status,created_at,created_by,updated_at,measurement_delayed,client_cancelled_at')
    .is('archived_at', null).order('updated_at', { ascending: false });
  if (auth.role === 'Outdoor Sales') {
    query = query.or(`created_by.eq.${auth.user.id},assigned_outdoor_sales_id.eq.${auth.user.id}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load project stages.' }, { status: 500 });
  const creatorIds = [...new Set((data ?? []).map(project => project.created_by).filter((id): id is string => !!id))];
  const creators = creatorIds.length ? await admin.from('profiles').select('id,full_name,username').in('id', creatorIds) : { data: [], error: null };
  if (creators.error) return NextResponse.json({ error: 'Unable to load employee names.' }, { status: 500 });
  const names = new Map((creators.data ?? []).map(employee => [employee.id, employee.full_name ?? employee.username ?? 'Employee']));
  return NextResponse.json({ projects: (data ?? []).map(project => ({ ...project, registeredBy: names.get(project.created_by ?? '') ?? 'Employee' })) }, { headers: { 'Cache-Control': 'no-store' } });
}
