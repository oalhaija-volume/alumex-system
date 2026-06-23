create table if not exists public.discount_policy_settings (
  role public.app_role primary key,
  max_discount_percent numeric(5, 2) not null default 0 check (
    max_discount_percent >= 0 and max_discount_percent <= 100
  ),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.discount_policy_settings (role, max_discount_percent)
values
  ('Sales Rep'::public.app_role, 2),
  ('Sales Manager'::public.app_role, 4),
  ('Branch Manager'::public.app_role, 6),
  ('Admin'::public.app_role, 100)
on conflict (role) do nothing;

grant select on table public.discount_policy_settings to authenticated;
grant all on table public.discount_policy_settings to service_role;

alter table public.contracts
  add column if not exists source_contract_value numeric(14, 2) not null default 0 check (source_contract_value >= 0),
  add column if not exists contract_discount_percent numeric(5, 2) not null default 0 check (
    contract_discount_percent >= 0 and contract_discount_percent <= 100
  ),
  add column if not exists contract_discount_total numeric(14, 2) not null default 0 check (
    contract_discount_total >= 0
  );

update public.contracts
set source_contract_value = contract_value
where source_contract_value = 0
  and contract_value > 0;

alter table public.discount_policy_settings enable row level security;

drop policy if exists "discount_policy_settings_select_active_users"
on public.discount_policy_settings;
drop policy if exists "discount_policy_settings_admin_all"
on public.discount_policy_settings;

create policy "discount_policy_settings_select_active_users"
on public.discount_policy_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  )
);

create policy "discount_policy_settings_admin_all"
on public.discount_policy_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text = 'Admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text = 'Admin'
  )
);
