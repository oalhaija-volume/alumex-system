import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { OperationsWorkspace } from '@/components/workflow/OperationsWorkspace';
export default async function Page(){
 const auth=await requireRole(["Admin", "Operations Manager", "Project Manager"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell><OperationsWorkspace/></RegistrationShell>;
}
