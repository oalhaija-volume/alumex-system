import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/adminServer';
import { projectOverviewRoles } from '@/lib/auth/permissions';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { ProjectOverview } from '@/components/workflow/ProjectOverview';

export default async function Page({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ section?: string | string[] }> }) {
 const auth = await requireRole(projectOverviewRoles);
 if (!auth.ok) redirect('/unauthorized');
 const { projectId } = await params;
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) notFound();
 const requestedSection = (await searchParams)?.section;
 return <RegistrationShell role={auth.role}><ProjectOverview projectId={projectId} initialSection={requestedSection === 'contract' ? 'contract' : 'overview'}/></RegistrationShell>;
}
