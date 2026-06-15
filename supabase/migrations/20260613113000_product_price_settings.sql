create table if not exists public.product_price_settings (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  category text,
  unit text not null default 'sqm',
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_name)
);

create index if not exists product_price_settings_active_idx
on public.product_price_settings (is_active);

grant select on table public.product_price_settings to authenticated;
grant all on table public.product_price_settings to service_role;

alter table public.product_price_settings enable row level security;

drop policy if exists "product_price_settings_select_active_users" on public.product_price_settings;
drop policy if exists "product_price_settings_admin_all" on public.product_price_settings;

create policy "product_price_settings_select_active_users"
on public.product_price_settings
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

create policy "product_price_settings_admin_all"
on public.product_price_settings
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
