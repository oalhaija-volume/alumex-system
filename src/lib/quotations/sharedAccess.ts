import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export async function hasSharedQuotationPriceAccess(admin: Admin, projectId: string, employeeId: string) {
  const result = await admin.rpc('employee_has_quotation_price_access', { p_project: projectId, p_employee: employeeId });
  return { allowed: result.data === true, error: result.error };
}
