begin;

-- Team membership is employee configuration. Project assignment keeps the
-- selected employee so handoff ownership and its audit trail stay explicit.
alter table public.profiles add column if not exists outdoor_team_key text
  check (outdoor_team_key in ('ahmad_mohammad','sajjad_ehab'));
create index if not exists profiles_active_outdoor_team_idx
  on public.profiles(outdoor_team_key)
  where role = 'Outdoor Sales' and is_active and status = 'Active';
comment on column public.profiles.outdoor_team_key is
  'Trusted Outdoor Sales measurement team. Grants shared access to projects assigned to an active teammate, independently of project creator or original sales credit.';

create or replace function public.protect_profile_outdoor_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('anon','authenticated')
    and ((tg_op = 'INSERT' and new.outdoor_team_key is not null)
      or (tg_op = 'UPDATE' and new.outdoor_team_key is distinct from old.outdoor_team_key)) then
    raise exception using errcode = '42501', message = 'Outdoor Sales team membership must be configured by the server.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_outdoor_team() from public, anon, authenticated;
create or replace trigger profiles_protect_outdoor_team
before insert or update of outdoor_team_key on public.profiles
for each row execute function public.protect_profile_outdoor_team();

-- Match exact existing usernames rather than names or prefixes. No unrelated
-- employee is placed into a team when an expected account does not exist.
update public.profiles set outdoor_team_key = 'ahmad_mohammad'
where username in ('aliammar','mohd') and role = 'Outdoor Sales'
  and outdoor_team_key is null;
update public.profiles set outdoor_team_key = 'sajjad_ehab'
where username in ('sajjad','ehab') and role = 'Outdoor Sales'
  and outdoor_team_key is null;

create or replace function public.outdoor_sales_team_member_ids(actor_user_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select member.id
  from public.profiles actor join public.profiles member
    on member.id = actor.id
      or (actor.outdoor_team_key is not null and member.outdoor_team_key = actor.outdoor_team_key)
  where actor.id = actor_user_id and actor.role = 'Outdoor Sales'
    and actor.is_active and actor.status = 'Active'
    and member.role = 'Outdoor Sales' and member.is_active and member.status = 'Active';
$$;
revoke all on function public.outdoor_sales_team_member_ids(uuid) from public, anon, authenticated;
grant execute on function public.outdoor_sales_team_member_ids(uuid) to service_role;

create or replace function public.is_outdoor_assignment_member(actor_user_id uuid, assignee_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (actor_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and exists (
      select 1 from public.outdoor_sales_team_member_ids(actor_user_id) member_id
      where member_id = assignee_user_id
    );
$$;
revoke all on function public.is_outdoor_assignment_member(uuid,uuid) from public, anon;
grant execute on function public.is_outdoor_assignment_member(uuid,uuid) to authenticated, service_role;

create or replace function public.can_view_outdoor_team_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects project
    where project.id = target_project_id and project.archived_at is null
      and public.is_outdoor_assignment_member(auth.uid(), project.assigned_outdoor_sales_id)
  );
$$;
revoke all on function public.can_view_outdoor_team_project(uuid) from public, anon;
grant execute on function public.can_view_outdoor_team_project(uuid) to authenticated, service_role;

-- These policies grant only measurement reads. Generic CRM/commercial/document
-- view and edit helpers are intentionally unchanged.
grant select on public.measurement_completion_reports to authenticated;
do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'outdoor_team_projects_read') then
    create policy outdoor_team_projects_read on public.projects for select to authenticated
      using (archived_at is null and public.is_outdoor_assignment_member(auth.uid(), assigned_outdoor_sales_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'openings' and policyname = 'outdoor_team_openings_read') then
    create policy outdoor_team_openings_read on public.openings for select to authenticated
      using (public.can_view_outdoor_team_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'measurement_completion_reports' and policyname = 'outdoor_team_reports_read') then
    create policy outdoor_team_reports_read on public.measurement_completion_reports for select to authenticated
      using (public.can_view_outdoor_team_project(project_id));
  end if;
end;
$policies$;

-- Extend the installed transaction, preserving receipt replay, row locks,
-- version checks, commercial-stage locks and original measurement snapshots.
do $sync$
declare
  definition text;
  access_marker text := 'not(public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and project.assigned_outdoor_sales_id is not distinct from p_actor)';
  additional_marker text := 'if public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and project.assigned_outdoor_sales_id is distinct from p_actor then';
  rename_marker text := '(project.created_by is distinct from p_actor and project.assigned_outdoor_sales_id is distinct from p_actor)';
  visit_marker text := '(public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and (project.assigned_outdoor_sales_id is not distinct from p_actor))';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position('public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id)' in definition) > 0 then
    if position(access_marker in definition) > 0 or position(additional_marker in definition) > 0
      or position(rename_marker in definition) > 0 or position(visit_marker in definition) > 0 then
      raise exception 'Unexpected partial Outdoor Sales team permission migration.';
    end if;
    return;
  end if;
  if position(access_marker in definition) = 0 or position(additional_marker in definition) = 0
    or position(rename_marker in definition) = 0 or position(visit_marker in definition) = 0
    or position('return saved.result;' in definition) = 0 or position('for update;' in definition) = 0 then
    raise exception 'Unexpected sync definition; Outdoor Sales teams were not applied.';
  end if;
  definition := replace(definition, access_marker,
    'not(public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id))');
  definition := replace(definition, additional_marker,
    'if public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and not public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id) then');
  definition := replace(definition, rename_marker,
    '(project.created_by is distinct from p_actor and not public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id))');
  -- Visit reports are shared. Cancellation remains the named assignee's action.
  definition := replace(definition, visit_marker,
    '(public.sales_permission_role(actor_role::public.app_role)=''Outdoor Sales'' and public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id))');
  execute definition;
end;
$sync$;

-- The receipt trigger already deduplicates per recipient and operation. Send
-- the same assignment alert to both active teammates without duplicating work.
do $notifications$
declare
  definition text;
  marker text := 'from public.profiles u where u.id = project.assigned_outdoor_sales_id';
begin
  select pg_get_functiondef('public.notify_sales_field_change()'::regprocedure) into definition;
  if position('public.outdoor_sales_team_member_ids(project.assigned_outdoor_sales_id)' in definition) > 0 then return; end if;
  if position(marker in definition) = 0 then raise exception 'Unexpected sales notification definition; Outdoor Sales teams were not applied.'; end if;
  definition := replace(definition, marker,
    'from public.profiles u where u.id in (select public.outdoor_sales_team_member_ids(project.assigned_outdoor_sales_id))');
  execute definition;
end;
$notifications$;

notify pgrst, 'reload schema';
commit;
