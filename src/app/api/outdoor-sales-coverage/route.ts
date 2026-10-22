import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { leadershipRoles } from '@/lib/auth/permissions';
import { outdoorSalesCoverage } from '@/lib/dashboard/outdoorSalesCoverage';
import { createAdminClient } from '@/lib/supabase/admin';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
 const auth = await requireRole(leadershipRoles);
 if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
 const admin = createAdminClient();
 const { data, error } = await admin.from('profiles')
  .select('id,full_name,username,outdoor_rotation_start_branch')
  .eq('role', 'Outdoor Sales').eq('is_active', true).eq('status', 'Active')
  .order('full_name');
 if (error) return NextResponse.json({ error: 'Unable to load Outdoor Sales coverage.' }, { status: 503, headers });
 return NextResponse.json(outdoorSalesCoverage(data ?? []), { headers });
}
