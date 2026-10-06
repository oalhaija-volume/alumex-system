import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { salesRoles } from '@/lib/workflow/access';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { SalesDashboard } from '@/components/workflow/SalesDashboard';
export default async function Page(){
 const auth=await requireRole(salesRoles);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><SalesDashboard/></RegistrationShell>;
}
