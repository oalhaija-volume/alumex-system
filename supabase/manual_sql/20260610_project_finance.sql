create table if not exists public.project_finance (
  project_id uuid primary key references public.projects(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  down_payment_required numeric(14, 2) not null default 0 check (down_payment_required >= 0),
  down_payment_received numeric(14, 2) not null default 0 check (down_payment_received >= 0),
  payment_status text not null default 'Down payment pending',
  exception_reason text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_finance_contract_id_idx
on public.project_finance (contract_id);

create index if not exists project_finance_confirmed_by_idx
on public.project_finance (confirmed_by);

drop trigger if exists set_project_finance_updated_at on public.project_finance;

create trigger set_project_finance_updated_at
before update on public.project_finance
for each row
execute function public.set_updated_at();

grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.project_finance to authenticated;
grant all on table public.project_finance to service_role;

alter table public.project_finance enable row level security;

drop policy if exists "project_finance_select_active" on public.project_finance;
drop policy if exists "project_finance_insert_finance_or_admin" on public.project_finance;
drop policy if exists "project_finance_update_finance_or_admin" on public.project_finance;
drop policy if exists "project_finance_delete_admin" on public.project_finance;

create policy "project_finance_select_active"
on public.project_finance
for select
to authenticated
using (public.is_active_user());

create policy "project_finance_insert_finance_or_admin"
on public.project_finance
for insert
to authenticated
with check (
  public.is_admin()
  or public.current_user_role()::text = 'Finance / Accountant'
);

create policy "project_finance_update_finance_or_admin"
on public.project_finance
for update
to authenticated
using (
  public.is_admin()
  or public.current_user_role()::text = 'Finance / Accountant'
)
with check (
  public.is_admin()
  or public.current_user_role()::text = 'Finance / Accountant'
);

create policy "project_finance_delete_admin"
on public.project_finance
for delete
to authenticated
using (public.is_admin());
