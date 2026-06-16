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
  cubic_space_available numeric(10, 2) generated always as (
    (select cubic_size from vehicles where id = delivery_vehicles.vehicle_id) - cubic_space_used
  ) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add RLS policies for delivery_assignments
alter table public.delivery_assignments enable row level security;

create policy "Authenticated users can view delivery assignments"
  on public.delivery_assignments
  for select
  to authenticated
  using (true);

create policy "Admin and Delivery Head can manage delivery assignments"
  on public.delivery_assignments
  for all
  to authenticated
  using (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Delivery Head'
    )
  );

-- Add RLS policies for delivery_vehicles
alter table public.delivery_vehicles enable row level security;

create policy "Authenticated users can view delivery vehicles"
  on public.delivery_vehicles
  for select
  to authenticated
  using (true);

create policy "Admin and Delivery Head can manage delivery vehicles"
  on public.delivery_vehicles
  for all
  to authenticated
  using (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Delivery Head'
    )
  );

-- Update activity_entity_type enum to include delivery-related types
alter type public.activity_entity_type add value 'delivery_assignment' if not exists;
alter type public.activity_entity_type add value 'delivery_vehicle' if not exists;
