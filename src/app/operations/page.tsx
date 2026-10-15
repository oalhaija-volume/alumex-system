import { redirect } from 'next/navigation';
import { leadershipRoles } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { OperationsWorkspace } from '@/components/workflow/OperationsWorkspace';
export default async function Page(){
 const auth=await requireRole([...leadershipRoles, "Operations Manager", "Project Manager"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><OperationsWorkspace/></RegistrationShell>;
}
