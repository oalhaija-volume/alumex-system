-- Phase 8: align direct PostgREST/RLS access with the rebuilt role workflow.
-- Server routes still apply object guards; these policies provide the matching
-- database boundary if a client reads tables directly.

drop policy if exists "projects_select_related" on public.projects;
create policy "projects_select_related"
on public.projects
for select
to authenticated
using (public.can_view_sales_project(id));

drop policy if exists "projects_update_related" on public.projects;
create policy "projects_update_related"
on public.projects
for update
to authenticated
using (public.can_manage_sales_project(id))
with check (public.can_manage_sales_project(id));

drop policy if exists "openings_select_project_access" on public.openings;
create policy "openings_select_project_access"
on public.openings
for select
to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "openings_insert_project_access" on public.openings;
create policy "openings_insert_project_access"
on public.openings
for insert
to authenticated
with check (
  public.can_manage_sales_project(project_id)
  and (created_by = auth.uid() or created_by is null)
);

drop policy if exists "openings_update_project_access" on public.openings;
create policy "openings_update_project_access"
on public.openings
for update
to authenticated
using (public.can_manage_sales_project(project_id))
with check (public.can_manage_sales_project(project_id));

drop policy if exists "openings_delete_project_access" on public.openings;
create policy "openings_delete_project_access"
on public.openings
for delete
to authenticated
using (public.can_manage_sales_project(project_id));

drop policy if exists "quotations_select_project_access"
on public.quotations;
create policy "quotations_select_project_access"
on public.quotations
for select
to authenticated
using (
  public.current_user_role() in (
    'Admin',
    'Sales Manager',
    'Indoor Sales',
    'Sales Rep',
    'Branch Manager'
  )
  and public.can_view_sales_project(project_id)
);

drop policy if exists "quotation_items_select_quotation_access"
on public.quotation_items;
create policy "quotation_items_select_quotation_access"
on public.quotation_items
for select
to authenticated
using (
  public.current_user_role() in (
    'Admin',
    'Sales Manager',
    'Indoor Sales',
    'Sales Rep',
    'Branch Manager'
  )
  and exists (
    select 1
    from public.quotations quotation
    where quotation.id = quotation_id
      and public.can_view_sales_project(quotation.project_id)
  )
);

drop policy if exists "contracts_select_project_access"
on public.contracts;
create policy "contracts_select_project_access"
on public.contracts
for select
to authenticated
using (
  public.current_user_role() in (
    'Admin',
    'Sales Manager',
    'Indoor Sales',
    'Sales Rep',
    'Branch Manager',
    'Finance / Accountant'
  )
  and public.can_view_sales_project(project_id)
);

drop policy if exists "quotation_versions_read_project"
on public.quotation_versions;
create policy "quotation_versions_read_project"
on public.quotation_versions
for select
to authenticated
using (
  public.current_user_role() in (
    'Admin',
    'Sales Manager',
    'Indoor Sales',
    'Sales Rep',
    'Branch Manager'
  )
  and exists (
    select 1
    from public.quotations quotation
    where quotation.id = quotation_id
      and public.can_view_sales_project(quotation.project_id)
  )
);

drop policy if exists "quotation_version_items_read_project"
on public.quotation_version_items;
create policy "quotation_version_items_read_project"
on public.quotation_version_items
for select
to authenticated
using (
  public.current_user_role() in (
    'Admin',
    'Sales Manager',
    'Indoor Sales',
    'Sales Rep',
    'Branch Manager'
  )
  and exists (
    select 1
    from public.quotation_versions version
    join public.quotations quotation on quotation.id = version.quotation_id
    where version.id = quotation_version_id
      and public.can_view_sales_project(quotation.project_id)
  )
);
