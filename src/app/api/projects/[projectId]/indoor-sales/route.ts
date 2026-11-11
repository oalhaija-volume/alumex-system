import { NextResponse } from 'next/server';
import { canAccessProjectBranch, canOwnProjectFollowUp } from '@/lib/auth/projectBranchAccess';
import { salesProject } from '@/lib/workflow/access';
import { canAssignIndoorSales, normalizeIndoorSalesAssignment } from '@/lib/workflow/indoorSalesAssignment';

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
  }
  const access = await salesProject(projectId, true);
  if (access.response) return access.response;
  if (!canAssignIndoorSales(access.project, { role: access.auth.role })) {
    return NextResponse.json({ error: 'Only company leadership can change the responsible Indoor Sales employee.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  let input;
  try {
    input = normalizeIndoorSalesAssignment(body ?? {});
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const owner = await access.admin.from('profiles')
    .select('id,full_name,username,role,branch')
    .eq('id', input.followUpOwnerId)
    .in('role', ['Indoor Sales', 'Sales Manager'])
    .eq('is_active', true).eq('status', 'Active').maybeSingle();
  if (owner.error) {
    return NextResponse.json({ error: 'Unable to load employee assignments.' }, { status: 500 });
  }
  if (!owner.data || !canOwnProjectFollowUp(owner.data, access.project.branch)
    || !canAccessProjectBranch(owner.data, access.project.branch)) {
    return NextResponse.json({ error: 'Choose an active Indoor Sales employee from this project’s branch.' }, { status: 400 });
  }
  // A standalone assignment must not fabricate a follow-up or change its date,
  // notes, method, stage, original attribution, or measurement employee.
  let update = access.admin.from('projects')
    .update({ follow_up_owner_id: owner.data.id })
    .eq('id', projectId).eq('updated_at', input.expectedUpdatedAt);
  update = access.project.branch === null
    ? update.is('branch', null)
    : update.eq('branch', access.project.branch);
  const saved = await update.select('id,follow_up_owner_id,updated_at').maybeSingle();
  if (saved.error) {
    const status = saved.error.code === '42501' ? 403 : 409;
    return NextResponse.json({ error: 'Unable to change Indoor Sales. Reload the project and try again.' }, { status });
  }
  if (!saved.data) {
    return NextResponse.json({ error: 'This project changed on another device. Reload before changing Indoor Sales.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, project: {
    ...saved.data, followUpOwner: owner.data.full_name ?? owner.data.username ?? 'Employee',
  } });
}
