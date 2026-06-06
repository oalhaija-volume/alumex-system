create extension if not exists "pgcrypto";

create type public.app_role as enum ('Admin', 'Sales Manager', 'Sales User');
create type public.project_status as enum (
  'Draft',
  'Measuring',
  'Quotation',
  'Contract',
  'Production',
  'Completed'
);
create type public.quotation_status as enum (
  'Draft',
  'Sent',
  'Approved',
  'Rejected',
  'Expired'
);
create type public.contract_status as enum (
  'Draft',
  'Review',
  'Active',
  'Completed',
  'Cancelled'
);
create type public.document_owner_type as enum (
  'client',
  'project',
  'quotation',
  'contract'
);
create type public.activity_entity_type as enum (
  'profile',
  'client',
  'project',
  'opening',
  'quotation',
  'quotation_item',
  'contract',
  'document'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'Sales User',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  mobile text,
  alternate_mobile text,
  address text,
  province text,
  city text,
  email text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique,
  project_name text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  address text,
  project_type text,
  sales_engineer_id uuid references public.profiles(id) on delete set null,
  status public.project_status not null default 'Draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.openings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  floor text,
  room text,
  opening_code text not null,
  width numeric(12, 3) not null check (width >= 0),
  height numeric(12, 3) not null check (height >= 0),
  quantity integer not null default 1 check (quantity > 0),
  area_sqm numeric(14, 3) generated always as (
    greatest(width * height * quantity, 1)
  ) stored,
  product_system text,
  glass_type text,
  aluminum_color text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, opening_code)
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  status public.quotation_status not null default 'Draft',
  quotation_discount_percent numeric(6, 3) not null default 0 check (
    quotation_discount_percent >= 0
    and quotation_discount_percent <= 100
  ),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  line_discount_total numeric(14, 2) not null default 0 check (line_discount_total >= 0),
  quotation_discount_total numeric(14, 2) not null default 0 check (quotation_discount_total >= 0),
  grand_total numeric(14, 2) not null default 0 check (grand_total >= 0),
  notes text,
  prepared_by uuid references public.profiles(id) on delete set null,
  client_representative text,
  valid_until date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  opening_id uuid references public.openings(id) on delete set null,
  opening_code text not null,
  floor text,
  room text,
  width numeric(12, 3) not null check (width >= 0),
  height numeric(12, 3) not null check (height >= 0),
  quantity integer not null default 1 check (quantity > 0),
  area_sqm numeric(14, 3) generated always as (
    greatest(width * height * quantity, 1)
  ) stored,
  product_system text,
  glass_type text,
  aluminum_color text,
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(6, 3) not null default 0 check (
    discount_percent >= 0
    and discount_percent <= 100
  ),
  gross_total numeric(14, 2) generated always as (
    greatest(width * height * quantity, 1) * unit_price
  ) stored,
  discount_total numeric(14, 2) generated always as (
    greatest(width * height * quantity, 1) * unit_price * (discount_percent / 100)
  ) stored,
  net_total numeric(14, 2) generated always as (
    greatest(width * height * quantity, 1) * unit_price * (1 - (discount_percent / 100))
  ) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete restrict,
  status public.contract_status not null default 'Draft',
  contract_value numeric(14, 2) not null default 0 check (contract_value >= 0),
  signed_at date,
  start_date date,
  end_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type public.document_owner_type not null,
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  file_name text not null,
  file_type text,
  storage_bucket text not null,
  storage_path text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_single_owner check (
    num_nonnulls(client_id, project_id, quotation_id, contract_id) = 1
  ),
  constraint documents_owner_type_matches check (
    (owner_type = 'client' and client_id is not null)
    or (owner_type = 'project' and project_id is not null)
    or (owner_type = 'quotation' and quotation_id is not null)
    or (owner_type = 'contract' and contract_id is not null)
  )
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type public.activity_entity_type not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index clients_created_by_idx on public.clients(created_by);
create index clients_name_idx on public.clients(client_name);
create index projects_client_id_idx on public.projects(client_id);
create index projects_sales_engineer_id_idx on public.projects(sales_engineer_id);
create index openings_project_id_idx on public.openings(project_id);
create index quotations_project_id_idx on public.quotations(project_id);
create index quotations_client_id_idx on public.quotations(client_id);
create index quotation_items_quotation_id_idx on public.quotation_items(quotation_id);
create index quotation_items_opening_id_idx on public.quotation_items(opening_id);
create index contracts_project_id_idx on public.contracts(project_id);
create index contracts_client_id_idx on public.contracts(client_id);
create index documents_client_id_idx on public.documents(client_id);
create index documents_project_id_idx on public.documents(project_id);
create index documents_quotation_id_idx on public.documents(quotation_id);
create index documents_contract_id_idx on public.documents(contract_id);
create index activity_logs_actor_id_idx on public.activity_logs(actor_id);
create index activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    'Sales User'
  );
  return new;
end;
$$;

create trigger auth_users_create_profile
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger openings_set_updated_at
before update on public.openings
for each row execute function public.set_updated_at();

create trigger quotations_set_updated_at
before update on public.quotations
for each row execute function public.set_updated_at();

create trigger quotation_items_set_updated_at
before update on public.quotation_items
for each row execute function public.set_updated_at();

create trigger contracts_set_updated_at
before update on public.contracts
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'Admin'
$$;

create or replace function public.is_sales_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('Admin', 'Sales Manager')
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() is not null
$$;

create or replace function public.can_select_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_sales_manager_or_admin()
        or p.created_by = auth.uid()
        or p.sales_engineer_id = auth.uid()
      )
  )
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.is_sales_manager_or_admin()
        or p.created_by = auth.uid()
        or p.sales_engineer_id = auth.uid()
      )
  )
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.openings enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.contracts enable row level security;
alter table public.documents enable row level security;
alter table public.activity_logs enable row level security;

create policy "profiles_select_own_or_management"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_sales_manager_or_admin()
);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own_same_role"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_user_role()
);

create policy "profiles_admin_manage"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "clients_select_active"
on public.clients for select
to authenticated
using (public.is_active_user());

create policy "clients_insert_active"
on public.clients for insert
to authenticated
with check (
  public.is_active_user()
  and (created_by = auth.uid() or created_by is null)
);

create policy "clients_update_owner_or_management"
on public.clients for update
to authenticated
using (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
)
with check (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
  or created_by is null
);

create policy "clients_delete_management"
on public.clients for delete
to authenticated
using (public.is_sales_manager_or_admin());

create policy "projects_select_related"
on public.projects for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
  or sales_engineer_id = auth.uid()
);

create policy "projects_insert_active"
on public.projects for insert
to authenticated
with check (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
  or sales_engineer_id = auth.uid()
);

create policy "projects_update_related"
on public.projects for update
to authenticated
using (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
  or sales_engineer_id = auth.uid()
)
with check (
  public.is_sales_manager_or_admin()
  or created_by = auth.uid()
  or sales_engineer_id = auth.uid()
);

create policy "projects_delete_management"
on public.projects for delete
to authenticated
using (public.is_sales_manager_or_admin());

create policy "openings_select_project_access"
on public.openings for select
to authenticated
using (public.can_select_project(project_id));

create policy "openings_insert_project_access"
on public.openings for insert
to authenticated
with check (
  public.can_edit_project(project_id)
  and (created_by = auth.uid() or created_by is null)
);

create policy "openings_update_project_access"
on public.openings for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

create policy "openings_delete_project_access"
on public.openings for delete
to authenticated
using (public.can_edit_project(project_id));

create policy "quotations_select_project_access"
on public.quotations for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or public.can_select_project(project_id)
);

create policy "quotations_insert_project_access"
on public.quotations for insert
to authenticated
with check (
  public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
);

create policy "quotations_update_project_access"
on public.quotations for update
to authenticated
using (
  public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
)
with check (
  public.is_sales_manager_or_admin()
  or public.can_edit_project(project_id)
);

create policy "quotations_delete_management"
on public.quotations for delete
to authenticated
using (public.is_sales_manager_or_admin());

create policy "quotation_items_select_quotation_access"
on public.quotation_items for select
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_sales_manager_or_admin()
        or public.can_select_project(q.project_id)
      )
  )
);

create policy "quotation_items_insert_quotation_access"
on public.quotation_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);

create policy "quotation_items_update_quotation_access"
on public.quotation_items for update
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);

create policy "quotation_items_delete_quotation_access"
on public.quotation_items for delete
to authenticated
using (
  exists (
    select 1
    from public.quotations q
    where q.id = quotation_id
      and (
        public.is_sales_manager_or_admin()
        or public.can_edit_project(q.project_id)
      )
  )
);

create policy "contracts_select_project_access"
on public.contracts for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or public.can_select_project(project_id)
);

create policy "contracts_insert_management"
on public.contracts for insert
to authenticated
with check (public.is_sales_manager_or_admin());

create policy "contracts_update_management"
on public.contracts for update
to authenticated
using (public.is_sales_manager_or_admin())
with check (public.is_sales_manager_or_admin());

create policy "contracts_delete_admin"
on public.contracts for delete
to authenticated
using (public.is_admin());

create policy "documents_select_related"
on public.documents for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or (project_id is not null and public.can_select_project(project_id))
  or (
    quotation_id is not null
    and exists (
      select 1
      from public.quotations q
      where q.id = quotation_id
        and public.can_select_project(q.project_id)
    )
  )
  or (
    contract_id is not null
    and exists (
      select 1
      from public.contracts c
      where c.id = contract_id
        and public.can_select_project(c.project_id)
    )
  )
  or (client_id is not null and public.is_active_user())
);

create policy "documents_insert_related"
on public.documents for insert
to authenticated
with check (
  public.is_sales_manager_or_admin()
  or uploaded_by = auth.uid()
  or uploaded_by is null
);

create policy "documents_update_uploader_or_management"
on public.documents for update
to authenticated
using (
  public.is_sales_manager_or_admin()
  or uploaded_by = auth.uid()
)
with check (
  public.is_sales_manager_or_admin()
  or uploaded_by = auth.uid()
  or uploaded_by is null
);

create policy "documents_delete_management"
on public.documents for delete
to authenticated
using (public.is_sales_manager_or_admin());

create policy "activity_logs_select_own_or_management"
on public.activity_logs for select
to authenticated
using (
  public.is_sales_manager_or_admin()
  or actor_id = auth.uid()
);

create policy "activity_logs_insert_active"
on public.activity_logs for insert
to authenticated
with check (
  public.is_active_user()
  and (actor_id = auth.uid() or actor_id is null)
);

create policy "activity_logs_delete_admin"
on public.activity_logs for delete
to authenticated
using (public.is_admin());
