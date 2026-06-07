alter table public.contracts
add column if not exists contract_terms text,
add column if not exists first_party_obligations text,
add column if not exists second_party_obligations text;

create table if not exists public.contract_templates (
  id text primary key default 'default',
  payment_terms text not null default '40% advance payment, 50% upon material delivery, and 10% after installation completion.',
  warranty_terms text not null default 'Alumex provides warranty coverage for supplied aluminum systems according to approved specifications and normal use conditions.',
  execution_terms text not null default 'Execution starts after advance payment, approved drawings, and confirmed site readiness.',
  contract_terms text not null default 'All work shall be executed according to approved shop drawings, site measurements, and written approvals. Any additional work or scope change requires written confirmation before execution.',
  first_party_obligations text not null default 'The First Party shall provide access to the project location, approve drawings and samples in writing, prepare the site for installation, and make payments according to the agreed schedule.',
  second_party_obligations text not null default 'The Second Party shall supply and install the agreed aluminum and glass systems according to approved specifications, professional workmanship, and the agreed execution schedule.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_templates_singleton check (id = 'default')
);

insert into public.contract_templates (id)
values ('default')
on conflict (id) do nothing;

drop trigger if exists contract_templates_set_updated_at on public.contract_templates;
create trigger contract_templates_set_updated_at
before update on public.contract_templates
for each row execute function public.set_updated_at();

grant select on table public.contract_templates to authenticated;
grant update on table public.contract_templates to authenticated;
grant all on table public.contract_templates to service_role;
grant select, insert, update, delete on table public.contracts to authenticated;
grant all on table public.contracts to service_role;

alter table public.contract_templates enable row level security;

drop policy if exists "contract_templates_select_authenticated" on public.contract_templates;
drop policy if exists "contract_templates_update_admin" on public.contract_templates;

create policy "contract_templates_select_authenticated"
on public.contract_templates
for select
to authenticated
using (true);

create policy "contract_templates_update_admin"
on public.contract_templates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
