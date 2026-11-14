import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { appRoles } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessProjectRow, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { outdoorProjectFilter } from '@/lib/auth/outdoorTeams';

export async function GET() {
  const auth = await requireRole(appRoles);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // The employee overview contains project status and creation metadata only. Contacts and commercial details
  // stay in the sales workspace behind its own role and project checks.
  const admin = createAdminClient();
  let query = admin.from('projects')
    .select('id,branch,project_name,project_number,structure_readiness,sales_status,status,created_at,created_by,assigned_outdoor_sales_id,updated_at,measurement_delayed,client_cancelled_at')
    .is('archived_at', null).order('updated_at', { ascending: false });
  if (auth.role === 'Outdoor Sales') {
    query = query.or(outdoorProjectFilter({id:auth.user.id,role:auth.role,outdoorTeamMemberIds:auth.outdoorTeamMemberIds}));
  }
  const actor = { id: auth.user.id, role: auth.role, branch: auth.profile?.branch, outdoorTeamMemberIds: auth.outdoorTeamMemberIds };
  const branches = projectBranchesForActor(actor);
  if (branches !== null && auth.role !== 'Outdoor Sales') query = query.in('branch', branches);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load project stages.' }, { status: 500 });
  let projects = (data ?? []).filter(project => canAccessProjectRow(actor, project));
  if (auth.role === 'Operations Manager' && projects.length) {
    // This service-role query bypasses RLS. Verify an actual current or legacy
    // contract exists; project status alone can be stale or manually changed.
    const projectIds = projects.map(project => project.id);
    const [contracts, workflows] = await Promise.all([
      admin.from('contracts').select('project_id').in('project_id', projectIds),
      admin.from('sales_workflows').select('project_id').in('project_id', projectIds)
        .in('stage', ['contract', 'signed', 'operations']).not('contract', 'is', null).neq('contract', 'null'),
    ]);
    if (contracts.error || workflows.error) {
      return NextResponse.json({ error: 'Unable to verify project contracts.' }, { status: 500 });
    }
    const contractedProjectIds = new Set([
      ...(contracts.data ?? []).map(contract => contract.project_id),
      ...(workflows.data ?? []).map(workflow => workflow.project_id),
    ]);
    projects = projects.filter(project => contractedProjectIds.has(project.id));
  }
  const creatorIds = [...new Set(projects.map(project => project.created_by).filter((id): id is string => !!id))];
  const creators = creatorIds.length ? await admin.from('profiles').select('id,full_name,username').in('id', creatorIds) : { data: [], error: null };
  if (creators.error) return NextResponse.json({ error: 'Unable to load employee names.' }, { status: 500 });
  const names = new Map((creators.data ?? []).map(employee => [employee.id, employee.full_name ?? employee.username ?? 'Employee']));
  return NextResponse.json({ projects: projects.map(project => ({ ...project, registeredBy: names.get(project.created_by ?? '') ?? 'Employee' })) }, { headers: { 'Cache-Control': 'no-store' } });
}
