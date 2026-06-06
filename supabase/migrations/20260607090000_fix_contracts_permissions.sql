grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.contracts to authenticated;
grant all on table public.contracts to service_role;

alter table public.contracts enable row level security;

drop policy if exists "contracts_select_project_access" on public.contracts;
drop policy if exists "contracts_insert_management" on public.contracts;
drop policy if exists "contracts_update_management" on public.contracts;
drop policy if exists "contracts_delete_admin" on public.contracts;
drop policy if exists "contracts_select_authenticated" on public.contracts;
drop policy if exists "contracts_insert_authenticated" on public.contracts;
drop policy if exists "contracts_update_authenticated" on public.contracts;

create policy "contracts_select_authenticated"
on public.contracts
for select
to authenticated
using (true);

create policy "contracts_insert_authenticated"
on public.contracts
for insert
to authenticated
with check (true);

create policy "contracts_update_authenticated"
on public.contracts
for update
to authenticated
using (true)
with check (true);

create policy "contracts_delete_admin"
on public.contracts
for delete
to authenticated
using (public.is_admin());
