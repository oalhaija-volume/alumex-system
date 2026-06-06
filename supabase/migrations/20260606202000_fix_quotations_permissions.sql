grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.quotations to authenticated;
grant select, insert, update, delete on table public.quotation_items to authenticated;
grant all on table public.quotations to service_role;
grant all on table public.quotation_items to service_role;

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

drop policy if exists "quotations_select_project_access" on public.quotations;
drop policy if exists "quotations_insert_project_access" on public.quotations;
drop policy if exists "quotations_update_project_access" on public.quotations;
drop policy if exists "quotations_delete_management" on public.quotations;
drop policy if exists "quotations_delete_admin" on public.quotations;

create policy "quotations_select_project_access"
on public.quotations
for select
to authenticated
using (
  public.is_admin()
  or public.is_sales_manager_or_admin()
  or public.can_select_project(project_id)
);

create policy "quotations_insert_project_access"
on public.quotations
for insert
to authenticated
with check (
  public.is_admin()
  or public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
);

create policy "quotations_update_project_access"
on public.quotations
for update
to authenticated
using (
  public.is_admin()
  or public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
)
with check (
  public.is_admin()
  or public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
);

create policy "quotations_delete_admin"
on public.quotations
for delete
to authenticated
using (public.is_admin());

drop policy if exists "quotation_items_select_quotation_access" on public.quotation_items;
drop policy if exists "quotation_items_insert_quotation_access" on public.quotation_items;
drop policy if exists "quotation_items_update_quotation_access" on public.quotation_items;
drop policy if exists "quotation_items_delete_quotation_access" on public.quotation_items;
drop policy if exists "quotation_items_delete_admin" on public.quotation_items;

create policy "quotation_items_select_quotation_access"
on public.quotation_items
for select
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_admin()
        or public.is_sales_manager_or_admin()
        or public.can_select_project(q.project_id)
      )
  )
);

create policy "quotation_items_insert_quotation_access"
on public.quotation_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_admin()
        or public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);

create policy "quotation_items_update_quotation_access"
on public.quotation_items
for update
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_admin()
        or public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_admin()
        or public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);

create policy "quotation_items_delete_quotation_access"
on public.quotation_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_admin()
        or public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);
