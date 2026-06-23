-- Create vehicles table
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_name text not null,
  cubic_size numeric(10, 2) not null check (cubic_size > 0),
  plate_number text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create drivers table
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  license_number text unique,
  phone text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create installation_teams table
create table public.installation_teams (
  id uuid primary key default gen_random_uuid(),
  team_head_name text not null,
  labor_count integer not null check (labor_count > 0),
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add RLS policies for vehicles
alter table public.vehicles enable row level security;

create policy "vehicles_select_all"
  on public.vehicles
  for select
  to authenticated
  using (true);

create policy "vehicles_admin_insert_update_delete"
  on public.vehicles
  for insert
  to authenticated
  with check (is_admin());

create policy "vehicles_admin_update"
  on public.vehicles
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "vehicles_admin_delete"
  on public.vehicles
  for delete
  to authenticated
  using (is_admin());

-- Add RLS policies for drivers
alter table public.drivers enable row level security;

create policy "drivers_select_all"
  on public.drivers
  for select
  to authenticated
  using (true);

create policy "drivers_admin_insert"
  on public.drivers
  for insert
  to authenticated
  with check (is_admin());

create policy "drivers_admin_update"
  on public.drivers
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "drivers_admin_delete"
  on public.drivers
  for delete
  to authenticated
  using (is_admin());

-- Add RLS policies for installation_teams
alter table public.installation_teams enable row level security;

create policy "installation_teams_select_all"
  on public.installation_teams
  for select
  to authenticated
  using (true);

create policy "installation_teams_admin_insert"
  on public.installation_teams
  for insert
  to authenticated
  with check (is_admin());

create policy "installation_teams_admin_update"
  on public.installation_teams
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "installation_teams_admin_delete"
  on public.installation_teams
  for delete
  to authenticated
  using (is_admin());

-- Add to activity_entity_type enum if not exists
alter type public.activity_entity_type add value 'vehicle' if not exists;
alter type public.activity_entity_type add value 'driver' if not exists;
alter type public.activity_entity_type add value 'installation_team' if not exists;
