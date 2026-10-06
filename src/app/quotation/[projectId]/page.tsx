import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { QuotationWorkspace } from '@/components/workflow/QuotationWorkspace';
export default async function Page({params}:{params:Promise<{projectId:string}>}){
 const auth=await requireRole(["Admin", "Indoor Sales", "Outdoor Sales"]);if(!auth.ok)redirect('/unauthorized');const {projectId}=await params;
 return <RegistrationShell><QuotationWorkspace projectId={projectId}/></RegistrationShell>;
}
