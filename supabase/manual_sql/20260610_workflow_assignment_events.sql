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
grant select on table public.project_workflow_events to authenticated;
grant insert on table public.project_workflow_events to authenticated;
grant all on table public.project_workflow_events to service_role;

alter table public.project_workflow_events enable row level security;

drop policy if exists "project_workflow_events_select_active" on public.project_workflow_events;
drop policy if exists "project_workflow_events_insert_active" on public.project_workflow_events;
drop policy if exists "project_workflow_events_update_admin" on public.project_workflow_events;
drop policy if exists "project_workflow_events_delete_admin" on public.project_workflow_events;

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
