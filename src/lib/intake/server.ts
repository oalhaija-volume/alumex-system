import { cache } from 'react';
import { requireRole, type RoleCheck } from '@/lib/auth/adminServer';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FieldState } from '@/lib/offline/types';
import { hasGlobalProjectAccess } from '@/lib/auth/projectBranchAccess';

// Share verification between the page and layout only within this server render.
export const getIntakeAccess = cache(() => requireRole([
  'Admin', 'Sales Director', 'CEO', 'Company Owner', 'Indoor Sales', 'Sales Manager', 'Outdoor Sales',
]));

export async function getIntakeEmployeeState(auth: Extract<RoleCheck, { ok: true }>): Promise<Pick<FieldState, 'actor' | 'outdoorSales'> | null> {
  const admin = createAdminClient();
  let directoryQuery = admin.from('profiles').select('id,full_name,username,branch')
    .eq('role', 'Outdoor Sales').eq('is_active', true).eq('status', 'Active').order('full_name');
  if (!hasGlobalProjectAccess(auth.role)) directoryQuery = auth.profile?.branch === 'Karkh' || auth.profile?.branch === 'Rasafa'
    ? directoryQuery.in('branch', ['Karkh', 'Rasafa']) : directoryQuery.eq('branch', auth.profile?.branch ?? '');
  const [profile, directory] = await Promise.all([
    admin.from('profiles').select('branch,outdoor_rotation_start_branch').eq('id', auth.user.id).single(),
    auth.role === 'Outdoor Sales' ? { data: [], error: null } : directoryQuery,
  ]);
  if (profile.error || directory.error) return null;
  return {
    actor: {
      id: auth.user.id,
      name: auth.profile?.full_name ?? auth.profile?.username ?? 'Employee',
      role: auth.role,
      branch: profile.data.branch,
      outdoorRotationStartBranch: auth.role === 'Outdoor Sales' ? profile.data.outdoor_rotation_start_branch : null,
    },
    outdoorSales: directory.data.filter(employee => hasGlobalProjectAccess(auth.role) || employee.branch === profile.data.branch
      || ((profile.data.branch === 'Karkh' || profile.data.branch === 'Rasafa') && (employee.branch === 'Karkh' || employee.branch === 'Rasafa')))
      .map(employee => ({ id: employee.id, name: employee.full_name ?? employee.username ?? 'Employee', branch: employee.branch })),
  };
}
