import { redirect } from 'next/navigation';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { SignedContractsWorkspace } from '@/components/workflow/SignedContractsWorkspace';
import { requireRole } from '@/lib/auth/adminServer';
import { quotationRoles } from '@/lib/auth/permissions';

export default async function Page() {
  const auth = await requireRole(quotationRoles);
  if (!auth.ok) redirect('/unauthorized');
  return <RegistrationShell role={auth.role}><SignedContractsWorkspace /></RegistrationShell>;
}
