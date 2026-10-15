import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { ProjectWorkspace } from '@/components/workflow/ProjectWorkspace';
import { canAccessCRM, crmRoles } from '@/lib/auth/permissions';
export default async function Page(){
 const auth=await requireRole(crmRoles);if(!auth.ok||!canAccessCRM(auth.role))redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><ProjectWorkspace followUps/></RegistrationShell>;
}
