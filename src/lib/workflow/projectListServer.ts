import type { createAdminClient } from '@/lib/supabase/admin';
import { canAccessProjectRow, projectBranchesForActor } from '@/lib/auth/projectBranchAccess';
import { loadWorkspaceProjects, loadWorkspaceRows, workspaceProjectColumns } from '@/lib/measurements/visitHistory';
import { selectProjectListPage, type ProjectListQuery } from './projectList';

type Admin = ReturnType<typeof createAdminClient>;
type Actor = Parameters<typeof loadWorkspaceProjects>[1];
// The index excludes notes, visit receipts, assignment proof and opening IDs.
// Those potentially large fields are read only for cards on the current page.
export const workspaceProjectIndexColumns = 'id,client_id,project_name,project_number,address,branch,governorate,governorate_office,created_at,created_by,original_creator_role,legacy_outdoor_sales_id' as const;
export const workspaceDashboardColumns = 'id,additional_openings_state,additional_openings_original_ids,building_type,branch,measurement_branch,measurement_exception_employee_id,measurement_exception_assignment_id,measurement_exception_reason,archived_at,governorate,governorate_office,project_name,project_number,address,location_latitude,location_longitude,client_id,structure_readiness,sales_status,status,next_follow_up_at,follow_up_type,follow_up_detail,follow_up_owner_id,created_by,created_at,updated_at,measurement_delayed,measurement_delay_reason,measurement_delay_note,measurement_delayed_at,measurement_delayed_by,client_cancellation_note,client_cancelled_at,client_cancelled_by,assigned_outdoor_sales_id,measurement_assignment_id,original_creator_role,legacy_outdoor_sales_id' as const;

export async function loadWorkspaceDashboardProjects(admin: Admin, actor: Actor) {
 if (actor.role === 'Outdoor Sales') return loadWorkspaceProjects(admin, actor);
 const branches = projectBranchesForActor(actor);
 const page = (offset: number) => {
  let request = admin.from('projects').select(workspaceDashboardColumns).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
  if (branches !== null) request = request.in('branch', branches.includes('Najaf') ? [...branches, 'Governorates'] : branches);
  return request;
 };
 const result = await page(0);
 if (result.error) return result;
 for (let offset = 1000; result.data.length === offset; offset += 1000) {
  const next = await page(offset);
  if (next.error) return { ...result, data: null, error: next.error };
  result.data.push(...next.data);
  if (next.data.length < 1000) break;
 }
 result.data = result.data.filter(row => canAccessProjectRow(actor, row));
 return result;
}

export async function loadWorkspaceProjectList(admin: Admin, actor: Actor, query: ProjectListQuery,
 directoryRequest: PromiseLike<{ data: { id: string; role: string | null }[] | null; error: unknown }>) {
 const branches = projectBranchesForActor(actor);
 const indexPage = (offset: number) => {
  let request = admin.from('projects').select(workspaceProjectIndexColumns).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
  if (branches !== null) request = request.in('branch', branches.includes('Najaf') ? [...branches, 'Governorates'] : branches);
  return request;
 };
 // Outdoor pages use the separate mobile workspace. Preserve its historical
 // access rules if this optional list mode is requested by an Outdoor actor.
 const indexResult = actor.role === 'Outdoor Sales' ? await loadWorkspaceProjects(admin, actor) : await indexPage(0);
 if (indexResult.error) return { error: 'Unable to load projects.' } as const;
 const index = [...(indexResult.data ?? [])];
 if (actor.role !== 'Outdoor Sales') for (let offset = 1000; index.length === offset; offset += 1000) {
  const result = await indexPage(offset);
  if (result.error) return { error: 'Unable to load projects.' } as const;
  index.push(...result.data);
  if (result.data.length < 1000) break;
 }
 const visible = index.filter(row => canAccessProjectRow(actor, row));
 const clients = await loadWorkspaceRows(visible.map(row => row.client_id), batch => admin.from('clients').select('id,mobile,client_name').in('id', batch));
 if (clients.error) return { error: 'Unable to load client contacts.' } as const;
 const contacts = new Map(clients.data.map(row => [row.id, row]));
 // Attribution of legacy rows also uses active Outdoor directory membership.
 const directory = await directoryRequest;
 if (directory.error) return { error: 'Unable to load employee assignments.' } as const;
 const selected = selectProjectListPage(visible.map(row => ({ ...row, client_name: contacts.get(row.client_id)?.client_name, phone: contacts.get(row.client_id)?.mobile })), query, (directory.data ?? []).filter(row => row.role === 'Outdoor Sales').map(row => ({ id: row.id, name: 'Employee' })));
 const projects = await loadWorkspaceRows(selected.ids, batch => admin.from('projects').select(workspaceProjectColumns).in('id', batch));
 if (projects.error) return { error: 'Unable to load projects.' } as const;
 const byId = new Map(projects.data.filter(row => canAccessProjectRow(actor, row)).map(row => [row.id, row]));
 return { error: null, data: selected.ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []), clients: clients.data, index: visible, pagination: selected.pagination };
}
