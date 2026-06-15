grant usage on schema public to authenticated, service_role;
grant usage on type public.contract_status to authenticated, service_role;

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
drop policy if exists "contracts_select_commercial_finance" on public.contracts;
drop policy if exists "contracts_insert_sales_admin" on public.contracts;
drop policy if exists "contracts_update_admin" on public.contracts;

create policy "contracts_select_commercial_finance"
on public.contracts
for select
to authenticated
using (
  public.is_active_user()
  and public.current_user_role()::text in (
    'Admin',
    'Sales Manager',
    'Sales Rep',
    'Finance / Accountant'
  )
);

create policy "contracts_insert_sales_admin"
on public.contracts
for insert
to authenticated
with check (
  public.is_active_user()
  and public.current_user_role()::text in (
    'Admin',
    'Sales Manager',
    'Sales Rep'
  )
);

create policy "contracts_update_admin"
on public.contracts
for update
to authenticated
using (
  public.is_active_user()
  and public.current_user_role()::text = 'Admin'
)
with check (
  public.is_active_user()
  and public.current_user_role()::text = 'Admin'
);

create policy "contracts_delete_admin"
on public.contracts
for delete
to authenticated
using (
  public.is_active_user()
  and public.current_user_role()::text = 'Admin'
);
