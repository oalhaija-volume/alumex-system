import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { CatalogWorkspace } from '@/components/workflow/CatalogWorkspace';
export default async function Page(){
 const auth=await requireRole(["Admin"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role}><CatalogWorkspace/></RegistrationShell>;
}
