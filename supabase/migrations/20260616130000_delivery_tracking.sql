-- Create delivery_assignments table
create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  delivery_date date,
  status text not null default 'pending', -- pending, in_progress, completed
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create delivery_vehicles table (vehicles assigned to a specific delivery)
create table public.delivery_vehicles (
  id uuid primary key default gen_random_uuid(),
  delivery_assignment_id uuid not null references public.delivery_assignments(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  cubic_space_used numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add a computed view for cubic_space_available (easier than generated column)
create view public.delivery_vehicles_with_capacity as
select 
  dv.*,
  (v.cubic_size - dv.cubic_space_used) as cubic_space_available,
  v.cubic_size as vehicle_cubic_size
from public.delivery_vehicles dv
join public.vehicles v on v.id = dv.vehicle_id;

-- Add RLS policies for delivery_assignments
alter table public.delivery_assignments enable row level security;

create policy "delivery_assignments_select_all"
  on public.delivery_assignments
  for select
  to authenticated
  using (true);

create policy "delivery_assignments_admin_insert"
  on public.delivery_assignments
  for insert
  to authenticated
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_assignments_admin_update"
  on public.delivery_assignments
  for update
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_assignments_admin_delete"
  on public.delivery_assignments
  for delete
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

-- Add RLS policies for delivery_vehicles
alter table public.delivery_vehicles enable row level security;

create policy "delivery_vehicles_select_all"
  on public.delivery_vehicles
  for select
  to authenticated
  using (true);

create policy "delivery_vehicles_admin_insert"
  on public.delivery_vehicles
  for insert
  to authenticated
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_vehicles_admin_update"
  on public.delivery_vehicles
  for update
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_vehicles_admin_delete"
  on public.delivery_vehicles
  for delete
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

-- Update activity_entity_type enum to include delivery-related types
alter type public.activity_entity_type add value 'delivery_assignment' if not exists;
alter type public.activity_entity_type add value 'delivery_vehicle' if not exists;
