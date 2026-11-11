import { NextResponse } from 'next/server';
import { canRenameClient, normalizeClientName } from '@/lib/clients/name';
import { salesProject } from '@/lib/workflow/access';

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await salesProject(projectId, true);
  if (access.response) return access.response;
  if (!canRenameClient(access.project, { role: access.auth.role, branch: access.auth.profile?.branch })) {
    return NextResponse.json({ error: 'Only Admin, Indoor Sales and Sales Managers can change client names.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  let payload;
  try {
    payload = normalizeClientName(body ?? {});
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  if (typeof body?.expectedClientName !== 'string') {
    return NextResponse.json({ error: 'Reload the projects before changing the client name.' }, { status: 400 });
  }
  const result = await access.admin.rpc('rename_project_client', {
    p_project: projectId,
    p_actor: access.auth.user.id,
    p_client_name: payload.clientName,
    p_expected_client_name: body.expectedClientName,
  });
  if (result.error) {
    if (result.error.code === 'PGRST202') return NextResponse.json({ error: 'Client name editing is not available yet. Please contact Admin.' }, { status: 503 });
    const status = result.error.code === '42501' ? 403 : result.error.code === '22023' ? 400 : 409;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json({ ok: true, client: result.data });
}
