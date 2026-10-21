import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { OutdoorProjectLog } from '@/components/workflow/OutdoorProjectLog';

export default async function Page() {
  const auth = await requireRole(['Outdoor Sales']);
  if (!auth.ok) redirect('/unauthorized');
  return <RegistrationShell role={auth.role} mobileOutdoor={auth.mobileOutdoor}><OutdoorProjectLog/></RegistrationShell>;
}
