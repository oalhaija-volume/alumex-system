-- Phase 3: role-focused client and project intake.

alter table public.clients
  add column if not exists client_type text not null default 'individual',
  add column if not exists company_name text,
  add column if not exists whatsapp text,
  add column if not exists preferred_language text not null default 'ar',
  add column if not exists normalized_mobile text generated always as (
    regexp_replace(coalesce(mobile, ''), '[^0-9]+', '', 'g')
  ) stored,
  add column if not exists normalized_whatsapp text generated always as (
    regexp_replace(coalesce(whatsapp, ''), '[^0-9]+', '', 'g')
  ) stored,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.clients
  drop constraint if exists clients_client_type_check,
  add constraint clients_client_type_check check (
    client_type in ('individual', 'company')
  ),
  drop constraint if exists clients_preferred_language_check,
  add constraint clients_preferred_language_check check (
    preferred_language in ('ar', 'en')
  ),
  drop constraint if exists clients_company_name_check,
  add constraint clients_company_name_check check (
    client_type <> 'company' or nullif(btrim(company_name), '') is not null
  ),
  drop constraint if exists clients_archive_fields_check,
  add constraint clients_archive_fields_check check (
    archived_at is null or nullif(btrim(archive_reason), '') is not null
  );

create index if not exists clients_normalized_mobile_idx
on public.clients (normalized_mobile)
where normalized_mobile <> '' and archived_at is null;

create index if not exists clients_normalized_whatsapp_idx
on public.clients (normalized_whatsapp)
where normalized_whatsapp <> '' and archived_at is null;

create index if not exists clients_lower_name_idx
on public.clients (lower(client_name))
where archived_at is null;

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  contact_type text not null default 'other',
  contact_name text not null,
  role_title text,
  mobile text,
  whatsapp text,
  email text,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contacts_type_check check (
    contact_type in (
      'client',
      'company',
      'engineer',
      'consultant',
      'contractor',
      'procurement',
      'finance',
      'other'
    )
  ),
  constraint client_contacts_channel_check check (
    nullif(btrim(coalesce(mobile, '')), '') is not null
    or nullif(btrim(coalesce(whatsapp, '')), '') is not null
    or nullif(btrim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists client_contacts_one_primary_idx
on public.client_contacts (client_id)
where is_primary;

create index if not exists client_contacts_client_created_idx
on public.client_contacts (client_id, created_at);

create index if not exists client_contacts_project_created_idx
on public.client_contacts (project_id, created_at)
where project_id is not null;

drop trigger if exists client_contacts_set_updated_at
on public.client_contacts;
create trigger client_contacts_set_updated_at
before update on public.client_contacts
for each row execute function public.set_updated_at();

alter table public.projects
  add column if not exists engineer_name text,
  add column if not exists consultant_name text,
  add column if not exists contractor_name text;

alter table public.documents
  add column if not exists attachment_category text not null default 'general',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.documents
  drop constraint if exists documents_attachment_category_check,
  add constraint documents_attachment_category_check check (
    attachment_category in (
      'general',
      'site_photo',
      'drawing',
      'client_document',
      'scope',
      'correspondence'
    )
  ),
  drop constraint if exists documents_archive_fields_check,
  add constraint documents_archive_fields_check check (
    archived_at is null or nullif(btrim(archive_reason), '') is not null
  );

create index if not exists documents_project_category_created_idx
on public.documents (project_id, attachment_category, created_at desc)
where project_id is not null and archived_at is null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-attachments',
  'project-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.client_contacts enable row level security;

drop policy if exists "client_contacts_read_sales"
on public.client_contacts;
create policy "client_contacts_read_sales"
on public.client_contacts
for select
to authenticated
using (
  public.is_active_user()
  and (
    public.current_user_role() in (
      'Admin',
      'Sales Manager',
      'Branch Manager',
      'Indoor Sales',
      'Sales Rep'
    )
    or exists (
      select 1
      from public.projects project
      where project.client_id = client_contacts.client_id
        and public.can_view_sales_project(project.id)
    )
  )
);

grant select on public.client_contacts to authenticated;
grant all on public.client_contacts to service_role;
