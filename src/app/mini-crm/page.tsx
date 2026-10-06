import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { ProjectWorkspace } from '@/components/workflow/ProjectWorkspace';
export default async function Page(){
 const auth=await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><ProjectWorkspace followUps/></RegistrationShell>;
}
