import { OutdoorMobileWorkspace } from "@/components/workflow/OutdoorMobileWorkspace";
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { appRoles } from '@/lib/auth/roles';
import { CompanyDashboard } from '@/components/workflow/CompanyDashboard';
import { salesRoles } from '@/lib/workflow/access';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { SalesDashboard } from '@/components/workflow/SalesDashboard';
export default async function Page(){
 const auth=await requireRole(appRoles);if(!auth.ok)redirect('/unauthorized');
 return <RegistrationShell role={auth.role} mobileOutdoor={auth.mobileOutdoor}>{auth.mobileOutdoor?<OutdoorMobileWorkspace/>:salesRoles.some(role=>role===auth.role)?<SalesDashboard/>:<CompanyDashboard role={auth.role}/>}</RegistrationShell>;
}
