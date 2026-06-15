create table if not exists public.project_descriptions (
  project_id uuid primary key references public.projects(id) on delete cascade,
  aluminum_system_summary text,
  glass_type text,
  aluminum_color text,
  opening_notes text,
  technical_notes text,
  site_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_audit_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  auditor_id uuid references public.profiles(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected')),
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists project_audit_reviews_project_id_idx
on public.project_audit_reviews (project_id);

create index if not exists project_audit_reviews_auditor_id_idx
on public.project_audit_reviews (auditor_id);

create index if not exists project_audit_reviews_created_at_idx
on public.project_audit_reviews (created_at desc);

drop trigger if exists project_descriptions_set_updated_at on public.project_descriptions;

create trigger project_descriptions_set_updated_at
before update on public.project_descriptions
for each row
execute function public.set_updated_at();

grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.project_descriptions to authenticated;
grant select, insert on table public.project_audit_reviews to authenticated;
grant all on table public.project_descriptions to service_role;
grant all on table public.project_audit_reviews to service_role;

alter table public.project_descriptions enable row level security;
alter table public.project_audit_reviews enable row level security;

drop policy if exists "project_descriptions_select_active" on public.project_descriptions;
drop policy if exists "project_descriptions_insert_project_engineer_admin" on public.project_descriptions;
drop policy if exists "project_descriptions_update_project_engineer_admin" on public.project_descriptions;
drop policy if exists "project_descriptions_delete_admin" on public.project_descriptions;

create policy "project_descriptions_select_active"
on public.project_descriptions
for select
to authenticated
using (public.is_active_user());

create policy "project_descriptions_insert_project_engineer_admin"
on public.project_descriptions
for insert
to authenticated
with check (
  public.is_admin()
  or public.current_user_role()::text = 'Project Engineer'
);

create policy "project_descriptions_update_project_engineer_admin"
on public.project_descriptions
for update
to authenticated
using (
  public.is_admin()
  or public.current_user_role()::text = 'Project Engineer'
)
with check (
  public.is_admin()
  or public.current_user_role()::text = 'Project Engineer'
);

create policy "project_descriptions_delete_admin"
on public.project_descriptions
for delete
to authenticated
using (public.is_admin());

drop policy if exists "project_audit_reviews_select_active" on public.project_audit_reviews;
drop policy if exists "project_audit_reviews_insert_auditor" on public.project_audit_reviews;
drop policy if exists "project_audit_reviews_update_admin" on public.project_audit_reviews;
drop policy if exists "project_audit_reviews_delete_admin" on public.project_audit_reviews;

create policy "project_audit_reviews_select_active"
on public.project_audit_reviews
for select
to authenticated
using (public.is_active_user());

create policy "project_audit_reviews_insert_auditor"
on public.project_audit_reviews
for insert
to authenticated
with check (
  public.is_active_user()
  and public.current_user_role()::text = 'Auditor'
  and auditor_id = auth.uid()
);

create policy "project_audit_reviews_update_admin"
on public.project_audit_reviews
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "project_audit_reviews_delete_admin"
on public.project_audit_reviews
for delete
to authenticated
using (public.is_admin());
