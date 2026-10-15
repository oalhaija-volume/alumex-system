import { redirect } from 'next/navigation';
import { leadershipRoles } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { CatalogWorkspace } from '@/components/workflow/CatalogWorkspace';
export default async function Page(){
 const auth=await requireRole(leadershipRoles);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><CatalogWorkspace canEdit={auth.role==='Admin'}/></RegistrationShell>;
}
