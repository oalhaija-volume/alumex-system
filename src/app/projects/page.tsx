import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { ProjectWorkspace } from '@/components/workflow/ProjectWorkspace';
import { OutdoorProjects } from '@/components/workflow/OutdoorProjects';
export default async function Page(){
 const auth=await requireRole(["Admin", "Sales Director", "CEO", "Company Owner", "Indoor Sales", "Sales Manager", "Outdoor Sales"]);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role} mobileOutdoor={auth.mobileOutdoor}>{auth.role==='Outdoor Sales'?<OutdoorProjects/>:<ProjectWorkspace canDelete={auth.role==='Admin'}/>}</RegistrationShell>;
}
