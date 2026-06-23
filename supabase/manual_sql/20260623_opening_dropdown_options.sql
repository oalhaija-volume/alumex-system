create table if not exists public.opening_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in ('room', 'aluminum_section', 'glass_type', 'glass_color')
  ),
  label text not null,
  sort_order integer not null default 1 check (sort_order > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, label)
);

create index if not exists opening_dropdown_options_category_sort_idx
on public.opening_dropdown_options (category, is_active, sort_order, label);

drop trigger if exists opening_dropdown_options_set_updated_at
on public.opening_dropdown_options;

create trigger opening_dropdown_options_set_updated_at
before update on public.opening_dropdown_options
for each row execute function public.set_updated_at();

insert into public.opening_dropdown_options (category, label, sort_order)
values
  ('room', 'Living Room', 1),
  ('room', 'Bedroom', 2),
  ('room', 'Kitchen', 3),
  ('room', 'Bathroom', 4),
  ('room', 'Majlis', 5),
  ('room', 'Hall', 6),
  ('room', 'Office', 7),
  ('room', 'Balcony', 8),
  ('aluminum_section', 'Sliding', 1),
  ('aluminum_section', 'Hinged', 2),
  ('aluminum_section', 'Fixed', 3),
  ('aluminum_section', 'Curtain Wall', 4),
  ('aluminum_section', 'Skylight', 5),
  ('aluminum_section', 'Louver', 6),
  ('glass_type', 'Single Glass', 1),
  ('glass_type', 'Double Glass', 2),
  ('glass_type', 'Tempered Glass', 3),
  ('glass_type', 'Laminated Glass', 4),
  ('glass_type', 'Low-E Glass', 5),
  ('glass_type', 'Reflective Glass', 6),
  ('glass_color', 'Clear', 1),
  ('glass_color', 'Bronze', 2),
  ('glass_color', 'Grey', 3),
  ('glass_color', 'Green', 4),
  ('glass_color', 'Blue', 5),
  ('glass_color', 'Mirror', 6)
on conflict (category, label) do nothing;

grant select on table public.opening_dropdown_options to authenticated;
grant all on table public.opening_dropdown_options to service_role;

alter table public.opening_dropdown_options enable row level security;

drop policy if exists "opening_dropdown_options_select_active_users"
on public.opening_dropdown_options;
drop policy if exists "opening_dropdown_options_admin_all"
on public.opening_dropdown_options;

create policy "opening_dropdown_options_select_active_users"
on public.opening_dropdown_options
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

create policy "opening_dropdown_options_admin_all"
on public.opening_dropdown_options
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
