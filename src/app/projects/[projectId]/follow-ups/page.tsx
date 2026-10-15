import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { canAccessCRM, crmRoles } from '@/lib/auth/permissions';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { FollowUpWorkspace } from '@/components/workflow/FollowUpWorkspace';
export default async function Page({params}:{params:Promise<{projectId:string}>}){
 const auth=await requireRole(crmRoles);if(!auth.ok||!canAccessCRM(auth.role))redirect('/unauthorized');
 const {projectId}=await params;
 return <RegistrationShell role={auth.role}><FollowUpWorkspace projectId={projectId}/></RegistrationShell>;
}
