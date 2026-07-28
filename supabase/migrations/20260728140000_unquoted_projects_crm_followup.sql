-- Keep every active, unquoted opportunity visible to Indoor Sales without
-- transferring ownership away from the employee who created the project.

create or replace function public.ensure_unquoted_project_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_owner_id uuid;
  task_assignee_id uuid;
  owner_role public.app_role;
begin
  if new.archived_at is not null
    or new.client_id is null
    or new.sales_status not in (
      'measurement_required',
      'measurement_assigned',
      'measurement_in_progress',
      'measurements_submitted',
      'measurements_under_review',
      'ready_for_quotation'
    )
    or exists (
      select 1
      from public.quotations quotation
      where quotation.project_id = new.id
    )
  then
    return new;
  end if;

  task_owner_id := coalesce(new.owner_id, new.original_creator_id);

  select profile.role
  into owner_role
  from public.profiles profile
  where profile.id = task_owner_id;

  task_assignee_id := case
    when owner_role in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    ) then task_owner_id
    else null
  end;

  insert into public.follow_up_tasks (
    client_id,
    project_id,
    task_type,
    owner_id,
    assigned_to,
    due_at,
    reminder_at,
    interval_source,
    deduplication_key,
    created_by
  )
  values (
    new.client_id,
    new.id,
    'quotation',
    task_owner_id,
    task_assignee_id,
    now(),
    now(),
    'manual',
    'unquoted-project:' || new.id::text,
    coalesce(new.original_creator_id, task_owner_id)
  )
  on conflict (deduplication_key)
    where status = 'open' and deduplication_key is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists projects_ensure_unquoted_follow_up
on public.projects;
create trigger projects_ensure_unquoted_follow_up
after insert or update of sales_status
on public.projects
for each row
execute function public.ensure_unquoted_project_follow_up();

-- Connect the pre-quotation follow-up to the quotation once Indoor Sales
-- creates it, so the existing quotation workflow continues the same task.
create or replace function public.link_project_follow_up_to_quotation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.follow_up_tasks
  set
    quotation_id = new.id,
    updated_at = now()
  where project_id = new.project_id
    and task_type = 'quotation'
    and status = 'open'
    and quotation_id is null;

  return new;
end;
$$;

drop trigger if exists quotations_link_project_follow_up
on public.quotations;
create trigger quotations_link_project_follow_up
after insert
on public.quotations
for each row
execute function public.link_project_follow_up_to_quotation();

create or replace function public.claim_sales_follow_up_task(
  target_task_id uuid,
  actor_user_id uuid default auth.uid()
)
returns public.follow_up_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  task_row public.follow_up_tasks;
  event_id uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role'
    and actor_user_id is distinct from auth.uid()
  then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive'
    and role in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    );

  if actor_profile.id is null then
    raise exception 'Only the Indoor Sales team can take a follow-up.';
  end if;

  select * into task_row
  from public.follow_up_tasks
  where id = target_task_id
  for update;

  if task_row.id is null or task_row.status <> 'open' then
    raise exception 'The follow-up task is not open.';
  end if;

  if task_row.assigned_to is not null
    and task_row.assigned_to is distinct from actor_profile.id
  then
    raise exception 'Another employee is already following this project.';
  end if;

  update public.follow_up_tasks
  set
    assigned_to = actor_profile.id,
    updated_at = now()
  where id = task_row.id
  returning * into task_row;

  update public.projects
  set
    responsible_user_id = actor_profile.id,
    responsible_department = 'indoor_sales',
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = task_row.project_id;

  insert into public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    new_value,
    correlation_id
  )
  values (
    actor_profile.id,
    actor_profile.role,
    'follow_up_claimed',
    'follow_up_task',
    task_row.id,
    jsonb_build_object(
      'project_id', task_row.project_id,
      'project_owner_id', task_row.owner_id,
      'followed_by', actor_profile.id
    ),
    event_id
  );

  return task_row;
end;
$$;

grant execute on function public.claim_sales_follow_up_task(uuid, uuid)
to authenticated, service_role;

-- Backfill opportunities already in measurement or quotation preparation.
insert into public.follow_up_tasks (
  client_id,
  project_id,
  task_type,
  owner_id,
  assigned_to,
  due_at,
  reminder_at,
  interval_source,
  deduplication_key,
  created_by
)
select
  project.client_id,
  project.id,
  'quotation',
  coalesce(project.owner_id, project.original_creator_id),
  case
    when owner_profile.role in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    ) then coalesce(project.owner_id, project.original_creator_id)
    else null
  end,
  now(),
  now(),
  'manual',
  'unquoted-project:' || project.id::text,
  coalesce(project.original_creator_id, project.owner_id)
from public.projects project
left join public.profiles owner_profile
  on owner_profile.id = coalesce(project.owner_id, project.original_creator_id)
where project.archived_at is null
  and project.client_id is not null
  and project.sales_status in (
    'measurement_required',
    'measurement_assigned',
    'measurement_in_progress',
    'measurements_submitted',
    'measurements_under_review',
    'ready_for_quotation'
  )
  and not exists (
    select 1
    from public.quotations quotation
    where quotation.project_id = project.id
  )
on conflict (deduplication_key)
  where status = 'open' and deduplication_key is not null
do nothing;
