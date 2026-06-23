alter table public.profiles
add column if not exists username text;

with profile_username_sources as (
  select
    id,
    lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9._-]', '', 'g')) as raw_username
  from public.profiles
  where username is null
),
normalized_profiles as (
  select
    id,
    case
      when raw_username ~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
        then raw_username
      else 'user' || left(replace(id::text, '-', ''), 12)
    end as base_username
  from profile_username_sources
),
numbered_profiles as (
  select
    id,
    case
      when row_number() over (partition by base_username order by id) = 1
        then left(base_username, 64)
      else
        left(base_username, 55)
        || '-'
        || row_number() over (partition by base_username order by id)::text
    end as next_username
  from normalized_profiles
)
update public.profiles as profiles
set username = numbered_profiles.next_username
from numbered_profiles
where profiles.id = numbered_profiles.id
  and profiles.username is null;

create unique index if not exists profiles_username_unique_idx
on public.profiles (username)
where username is not null;

alter table public.profiles
drop constraint if exists profiles_username_format_check;

alter table public.profiles
add constraint profiles_username_format_check
check (
  username is null
  or username ~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
);

create table if not exists public.project_workflow_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null,
  from_workflow_status public.project_workflow_status,
  to_workflow_status public.project_workflow_status,
  actor_id uuid references public.profiles(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assignment_field text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_workflow_events_project_id_idx
on public.project_workflow_events (project_id);

create index if not exists project_workflow_events_actor_id_idx
on public.project_workflow_events (actor_id);

create index if not exists project_workflow_events_created_at_idx
on public.project_workflow_events (created_at desc);

grant usage on schema public to authenticated, service_role;
grant select, insert on table public.project_workflow_events to authenticated;
grant all on table public.project_workflow_events to service_role;

alter table public.project_workflow_events enable row level security;

drop policy if exists "project_workflow_events_select_active"
on public.project_workflow_events;
drop policy if exists "project_workflow_events_insert_active"
on public.project_workflow_events;
drop policy if exists "project_workflow_events_update_admin"
on public.project_workflow_events;
drop policy if exists "project_workflow_events_delete_admin"
on public.project_workflow_events;

create policy "project_workflow_events_select_active"
on public.project_workflow_events
for select
to authenticated
using (public.is_active_user());

create policy "project_workflow_events_insert_active"
on public.project_workflow_events
for insert
to authenticated
with check (
  public.is_active_user()
  and (actor_id = auth.uid() or actor_id is null)
);

create policy "project_workflow_events_update_admin"
on public.project_workflow_events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "project_workflow_events_delete_admin"
on public.project_workflow_events
for delete
to authenticated
using (public.is_admin());

create table if not exists public.lifecycle_stages (
  stage_key text primary key,
  sequence_number integer not null unique check (sequence_number between 1 and 20),
  stage_name text not null,
  default_sla_days integer check (default_sla_days is null or default_sla_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.lifecycle_stages (stage_key, sequence_number, stage_name, default_sla_days)
values
  ('lead', 1, 'Lead', 2),
  ('opportunity', 2, 'Opportunity', 3),
  ('quotation', 3, 'Quotation', 3),
  ('contract', 4, 'Contract', 5),
  ('advance_payment_received', 5, 'Advance Payment Received', 3),
  ('operations_assignment', 6, 'Operations Assignment', 1),
  ('project_manager_assignment', 7, 'Project Manager Assignment', 1),
  ('project_engineer_assignment', 8, 'Project Engineer Assignment', 1),
  ('site_measurements', 9, 'Site Measurements', 3),
  ('engineering_definition', 10, 'Engineering Definition', 5),
  ('audit_approval', 11, 'Audit Approval', 2),
  ('production', 12, 'Production', 10),
  ('glass_production', 13, 'Glass Production', 5),
  ('assembly', 14, 'Assembly', 4),
  ('final_payment_collection', 15, 'Final Payment Collection', 3),
  ('delivery', 16, 'Delivery', 2),
  ('installation', 17, 'Installation', 7),
  ('quality_control', 18, 'Quality Control', 2),
  ('project_handover', 19, 'Project Handover', 1),
  ('closed', 20, 'Closed', null)
on conflict (stage_key) do update
set
  sequence_number = excluded.sequence_number,
  stage_name = excluded.stage_name,
  default_sla_days = excluded.default_sla_days,
  is_active = true;

create table if not exists public.project_stage_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_key text not null references public.lifecycle_stages(stage_key),
  workflow_status public.project_workflow_status,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  source_event_id uuid references public.project_workflow_events(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint project_stage_history_exit_after_enter check (
    exited_at is null or exited_at >= entered_at
  )
);

create index if not exists project_stage_history_project_id_idx
on public.project_stage_history (project_id, entered_at desc);

create index if not exists project_stage_history_open_stage_idx
on public.project_stage_history (project_id)
where exited_at is null;

create index if not exists project_stage_history_stage_key_idx
on public.project_stage_history (stage_key);

create or replace view public.project_stage_history_metrics as
select
  history.id,
  history.project_id,
  history.stage_key,
  stages.sequence_number,
  stages.stage_name,
  stages.default_sla_days,
  history.workflow_status,
  history.entered_at,
  history.exited_at,
  history.responsible_user_id,
  history.source_event_id,
  history.notes,
  history.metadata,
  greatest(
    0,
    extract(epoch from (coalesce(history.exited_at, now()) - history.entered_at)) / 86400
  )::numeric(12, 2) as days_in_stage,
  case
    when stages.default_sla_days is null then false
    else
      (extract(epoch from (coalesce(history.exited_at, now()) - history.entered_at)) / 86400)
      > stages.default_sla_days
  end as is_delayed
from public.project_stage_history history
join public.lifecycle_stages stages on stages.stage_key = history.stage_key;

grant select on table public.lifecycle_stages to authenticated;
grant select, insert, update on table public.project_stage_history to authenticated;
grant select on table public.project_stage_history_metrics to authenticated;
grant all on table public.lifecycle_stages to service_role;
grant all on table public.project_stage_history to service_role;

alter table public.lifecycle_stages enable row level security;
alter table public.project_stage_history enable row level security;

drop policy if exists "lifecycle_stages_select_active" on public.lifecycle_stages;
drop policy if exists "lifecycle_stages_admin_write" on public.lifecycle_stages;
drop policy if exists "project_stage_history_select_active" on public.project_stage_history;
drop policy if exists "project_stage_history_insert_active" on public.project_stage_history;
drop policy if exists "project_stage_history_update_admin" on public.project_stage_history;

create policy "lifecycle_stages_select_active"
on public.lifecycle_stages
for select
to authenticated
using (is_active);

create policy "lifecycle_stages_admin_write"
on public.lifecycle_stages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "project_stage_history_select_active"
on public.project_stage_history
for select
to authenticated
using (public.is_active_user());

create policy "project_stage_history_insert_active"
on public.project_stage_history
for insert
to authenticated
with check (public.is_active_user());

create policy "project_stage_history_update_admin"
on public.project_stage_history
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
