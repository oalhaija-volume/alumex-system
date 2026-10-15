import { redirect } from 'next/navigation';
import { leadershipRoles } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { EmployeeWorkspace } from '@/components/workflow/EmployeeWorkspace';
export default async function Page(){
 const auth=await requireRole([...leadershipRoles, "HR"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><EmployeeWorkspace/></RegistrationShell>;
}
