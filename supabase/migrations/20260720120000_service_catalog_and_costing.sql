alter type public.app_role add value if not exists 'Procurement Engineer';

insert into public.product_price_settings
  (product_name, category, unit, unit_price, is_active)
values
  ('Windows & Doors', 'service', 'sqm', 0, true),
  ('Curtain Wall', 'service', 'sqm', 0, true),
  ('Skylight', 'service', 'sqm', 0, true),
  ('Spider System', 'service', 'sqm', 0, true),
  ('Cladding', 'service', 'sqm', 0, true),
  ('Roller Shutters', 'service', 'sqm', 0, true),
  ('Photocell Doors', 'service', 'item', 0, true),
  ('A Swing Door', 'service', 'item', 0, true),
  ('Alumex System', 'aluminum_system', 'sqm', 0, true),
  ('The Address System', 'aluminum_system', 'sqm', 0, true),
  ('Reynaers System', 'aluminum_system', 'sqm', 0, true),
  ('Aluman System', 'aluminum_system', 'sqm', 0, true),
  ('Other System', 'aluminum_system', 'sqm', 0, true),
  ('Roller Shutter - Foam', 'service_variant', 'sqm', 0, true),
  ('Roller Shutter - Extruded', 'service_variant', 'sqm', 0, true),
  ('Photocell Door - GEZE', 'service_variant', 'item', 0, true),
  ('Photocell Door - Turkey', 'service_variant', 'item', 0, true),
  ('Porcelain', 'cladding_material', 'sqm', 0, true),
  ('Fiber Cement', 'cladding_material', 'sqm', 0, true),
  ('Frontek', 'cladding_material', 'sqm', 0, true),
  ('Natural Stone', 'cladding_material', 'sqm', 0, true),
  ('Swiss Pearl', 'cladding_material', 'sqm', 0, true),
  ('Roller Shutter Box', 'addon', 'item', 0, true),
  ('Georgian Bars', 'addon', 'meter', 0, true),
  ('Low-E Glass', 'addon', 'sqm', 25000, true),
  ('Saint-Gobain Glass', 'addon', 'sqm', 20000, true),
  ('Glass Film Shading', 'addon', 'sqm', 0, true),
  ('Sandblasted Glass', 'addon', 'sqm', 0, true),
  ('Curtain Wall Pushout', 'addon', 'item', 0, true),
  ('Tilt & Turn', 'addon', 'item', 0, true),
  ('Lift & Slide', 'addon', 'item', 0, true),
  ('Hydraulic Door Closer - Small', 'addon', 'item', 0, true),
  ('Hydraulic Door Closer - Large', 'addon', 'item', 0, true)
on conflict (product_name) do update
set category = excluded.category,
    unit = excluded.unit;

create table if not exists public.project_costings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  aluminum_system_name text,
  aluminum_system_cost numeric(14, 2) not null default 0 check (aluminum_system_cost >= 0),
  installation_cost numeric(14, 2) not null default 0 check (installation_cost >= 0),
  fabrication_cost numeric(14, 2) not null default 0 check (fabrication_cost >= 0),
  glass_cost numeric(14, 2) not null default 0 check (glass_cost >= 0),
  shipping_cost numeric(14, 2) not null default 0 check (shipping_cost >= 0),
  total_profit numeric(14, 2) not null default 0 check (total_profit >= 0),
  total_project_cost numeric(14, 2) not null default 0 check (total_project_cost >= 0),
  supplier_quotation_path text,
  supplier_quotation_name text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_costings_project_idx
on public.project_costings (project_id);

grant select, insert, update on table public.project_costings to authenticated;
grant all on table public.project_costings to service_role;

alter table public.project_costings enable row level security;

drop policy if exists "project_costings_procurement_access" on public.project_costings;
create policy "project_costings_procurement_access"
on public.project_costings
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text in ('Admin', 'Procurement Engineer')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text in ('Admin', 'Procurement Engineer')
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('costing-quotations', 'costing-quotations', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;
