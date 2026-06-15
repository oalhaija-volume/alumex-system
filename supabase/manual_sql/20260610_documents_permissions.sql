grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.documents to authenticated;
grant all on table public.documents to service_role;

alter table public.documents enable row level security;

drop policy if exists "documents_select_active" on public.documents;
drop policy if exists "documents_insert_active" on public.documents;
drop policy if exists "documents_update_active" on public.documents;
drop policy if exists "documents_delete_admin" on public.documents;

create policy "documents_select_active"
on public.documents
for select
to authenticated
using (public.is_active_user());

create policy "documents_insert_active"
on public.documents
for insert
to authenticated
with check (
  public.is_active_user()
  and (uploaded_by = auth.uid() or uploaded_by is null)
);

create policy "documents_update_active"
on public.documents
for update
to authenticated
using (public.is_active_user())
with check (public.is_active_user());

create policy "documents_delete_admin"
on public.documents
for delete
to authenticated
using (public.is_admin());
