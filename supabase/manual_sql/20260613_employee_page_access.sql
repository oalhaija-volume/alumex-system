create table if not exists public.employee_page_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_path text not null,
  can_access boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, route_path)
);

create index if not exists employee_page_access_user_id_idx
on public.employee_page_access (user_id);

grant select on table public.employee_page_access to authenticated;
grant all on table public.employee_page_access to service_role;

alter table public.employee_page_access enable row level security;

drop policy if exists "employee_page_access_select_own_or_admin" on public.employee_page_access;
drop policy if exists "employee_page_access_admin_all" on public.employee_page_access;

create policy "employee_page_access_select_own_or_admin"
on public.employee_page_access
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text = 'Admin'
  )
);

create policy "employee_page_access_admin_all"
on public.employee_page_access
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
