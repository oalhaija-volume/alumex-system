grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant all on table public.documents to service_role;

create or replace function public.is_document_management_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role()::text in (
      'Admin',
      'Sales Manager',
      'Project Manager',
      'Project Engineer',
      'Sales Engineer',
      'Assignee'
    ),
    false
  )
$$;

create or replace function public.can_read_project_documents(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_document_management_role()
        or p.created_by = auth.uid()
        or p.sales_engineer_id = auth.uid()
      )
  )
$$;

create or replace function public.can_write_project_documents(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_document_management_role()
        or p.created_by = auth.uid()
        or p.sales_engineer_id = auth.uid()
      )
  )
$$;

alter table public.documents enable row level security;

drop policy if exists "documents_select_related" on public.documents;
drop policy if exists "documents_insert_related" on public.documents;
drop policy if exists "documents_update_uploader_or_management" on public.documents;
drop policy if exists "documents_delete_management" on public.documents;

create policy "documents_select_project_access"
on public.documents
for select
to authenticated
using (
  public.is_document_management_role()
  or uploaded_by = auth.uid()
  or (
    project_id is not null
    and public.can_read_project_documents(project_id)
  )
  or (
    quotation_id is not null
    and exists (
      select 1
      from public.quotations q
      where q.id = quotation_id
        and public.can_read_project_documents(q.project_id)
    )
  )
  or (
    contract_id is not null
    and exists (
      select 1
      from public.contracts c
      where c.id = contract_id
        and public.can_read_project_documents(c.project_id)
    )
  )
  or (
    client_id is not null
    and public.is_active_user()
  )
);

create policy "documents_insert_project_access"
on public.documents
for insert
to authenticated
with check (
  (
    uploaded_by = auth.uid()
    or uploaded_by is null
  )
  and (
    public.is_document_management_role()
    or (
      project_id is not null
      and public.can_write_project_documents(project_id)
    )
    or (
      quotation_id is not null
      and exists (
        select 1
        from public.quotations q
        where q.id = quotation_id
          and public.can_write_project_documents(q.project_id)
      )
    )
    or (
      contract_id is not null
      and exists (
        select 1
        from public.contracts c
        where c.id = contract_id
          and public.can_write_project_documents(c.project_id)
      )
    )
    or (
      client_id is not null
      and public.is_active_user()
    )
  )
);

create policy "documents_update_project_access"
on public.documents
for update
to authenticated
using (
  public.is_document_management_role()
  or uploaded_by = auth.uid()
  or (
    project_id is not null
    and public.can_write_project_documents(project_id)
  )
)
with check (
  (
    uploaded_by = auth.uid()
    or uploaded_by is null
    or public.is_document_management_role()
  )
  and (
    public.is_document_management_role()
    or (
      project_id is not null
      and public.can_write_project_documents(project_id)
    )
    or uploaded_by = auth.uid()
  )
);

create policy "documents_delete_project_access"
on public.documents
for delete
to authenticated
using (
  public.is_document_management_role()
  or uploaded_by = auth.uid()
  or (
    project_id is not null
    and public.can_write_project_documents(project_id)
  )
);
