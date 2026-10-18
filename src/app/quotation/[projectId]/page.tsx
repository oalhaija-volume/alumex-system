import { redirect } from 'next/navigation';
import { quotationRoles } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { QuotationWorkspace } from '@/components/workflow/QuotationWorkspace';
export default async function Page({params}:{params:Promise<{projectId:string}>}){
 const auth=await requireRole(quotationRoles);if(!auth.ok)redirect('/unauthorized');const {projectId}=await params;
 return <RegistrationShell role={auth.role}><QuotationWorkspace projectId={projectId}/></RegistrationShell>;
}
