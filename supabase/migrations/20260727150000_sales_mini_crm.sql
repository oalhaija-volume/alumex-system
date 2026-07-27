-- Phase 5: mini CRM task execution, append-only activities, reminders, and
-- internal notifications.

alter table public.follow_up_tasks
  add column if not exists interval_source text not null default 'manual',
  add column if not exists reminder_at timestamptz;

alter table public.follow_up_tasks
  drop constraint if exists follow_up_tasks_interval_source_check,
  add constraint follow_up_tasks_interval_source_check check (
    interval_source in (
      'manual',
      'structure_readiness',
      'quotation_default',
      'rescheduled'
    )
  );

create index if not exists follow_up_tasks_assignee_status_due_idx
on public.follow_up_tasks (assigned_to, status, due_at);

create index if not exists notifications_recipient_kind_created_idx
on public.notifications (recipient_id, notification_kind, created_at desc)
where read_at is null;

create or replace function public.create_sales_follow_up_task(
  target_project_id uuid,
  target_task_type text,
  target_due_at timestamptz,
  target_assignee_id uuid default null,
  target_interval_source text default 'manual',
  actor_user_id uuid default auth.uid()
)
returns public.follow_up_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  assignee_profile public.profiles;
  project_row public.projects;
  task_row public.follow_up_tasks;
  task_key text;
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
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    )
  then
    raise exception 'This employee cannot create sales follow-ups.';
  end if;

  if target_task_type not in ('structure_readiness', 'quotation') then
    raise exception 'Select a valid follow-up type.';
  end if;

  if target_due_at is null then
    raise exception 'A follow-up due date is required.';
  end if;

  if target_interval_source not in (
    'manual',
    'structure_readiness',
    'quotation_default',
    'rescheduled'
  ) then
    raise exception 'Select a valid follow-up interval source.';
  end if;

  select * into project_row
  from public.projects
  where id = target_project_id
    and archived_at is null
  for update;

  if project_row.id is null or project_row.client_id is null then
    raise exception 'The project and its client are required.';
  end if;

  select * into assignee_profile
  from public.profiles
  where id = coalesce(target_assignee_id, actor_profile.id)
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive'
    and role in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    );

  if assignee_profile.id is null then
    raise exception 'The selected follow-up assignee is not available.';
  end if;

  task_key := concat_ws(
    ':',
    target_task_type,
    project_row.id::text,
    'manual',
    extract(epoch from target_due_at)::bigint::text
  );

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
    project_row.client_id,
    project_row.id,
    target_task_type,
    actor_profile.id,
    assignee_profile.id,
    target_due_at,
    target_due_at - interval '1 day',
    target_interval_source,
    task_key,
    actor_profile.id
  )
  returning * into task_row;

  update public.projects
  set
    next_follow_up_at = case
      when next_follow_up_at is null then target_due_at
      else least(next_follow_up_at, target_due_at)
    end,
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = project_row.id;

  insert into public.notifications (
    recipient_id,
    notification_kind,
    event_type,
    entity_type,
    entity_id,
    title_key,
    message_key,
    link_path,
    payload,
    deduplication_key
  )
  values (
    assignee_profile.id,
    'action_required',
    'follow_up_assigned',
    'follow_up_task',
    task_row.id,
    'crm.notifications.followUpAssigned',
    'crm.notifications.followUpAssignedMessage',
    '/crm?taskId=' || task_row.id::text,
    jsonb_build_object(
      'project_id', project_row.id,
      'project_name', project_row.project_name,
      'due_at', task_row.due_at,
      'task_type', task_row.task_type
    ),
    'follow-up-assigned:' || task_row.id::text
  );

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
    'follow_up_created',
    'follow_up_task',
    task_row.id,
    to_jsonb(task_row),
    event_id
  );

  return task_row;
end;
$$;

create or replace function public.record_sales_follow_up_activity(
  target_task_id uuid,
  activity_method text,
  activity_client_answered boolean default null,
  activity_client_response text default null,
  activity_internal_notes text default null,
  activity_outcome text default null,
  next_due_at timestamptz default null,
  complete_task boolean default false,
  actor_user_id uuid default auth.uid()
)
returns public.follow_up_activities
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  task_row public.follow_up_tasks;
  activity_row public.follow_up_activities;
  next_task public.follow_up_tasks;
  should_close boolean;
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
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in (
      'Admin',
      'Sales Manager',
      'Indoor Sales',
      'Branch Manager'
    )
  then
    raise exception 'This employee cannot record sales follow-ups.';
  end if;

  if activity_method not in (
    'phone_call',
    'whatsapp',
    'showroom_meeting',
    'site_meeting',
    'email',
    'quotation_sent',
    'quotation_printed',
    'client_visit',
    'internal_note',
    'other',
    'correction'
  ) then
    raise exception 'Select a valid activity method.';
  end if;

  if nullif(btrim(coalesce(activity_client_response, '')), '') is null
    and nullif(btrim(coalesce(activity_internal_notes, '')), '') is null
    and nullif(btrim(coalesce(activity_outcome, '')), '') is null
  then
    raise exception 'Add a response, outcome, or internal note.';
  end if;

  select * into task_row
  from public.follow_up_tasks
  where id = target_task_id
  for update;

  if task_row.id is null or task_row.status <> 'open' then
    raise exception 'The follow-up task is not open.';
  end if;

  if actor_profile.role not in ('Admin', 'Sales Manager')
    and actor_profile.id is distinct from task_row.assigned_to
    and actor_profile.id is distinct from task_row.owner_id
  then
    raise exception 'This follow-up task is assigned to another employee.';
  end if;

  should_close := complete_task or next_due_at is not null;

  insert into public.follow_up_activities (
    follow_up_task_id,
    client_id,
    project_id,
    employee_id,
    employee_role,
    method,
    client_response,
    internal_notes,
    outcome,
    next_follow_up_at,
    client_answered,
    task_completed
  )
  values (
    task_row.id,
    task_row.client_id,
    task_row.project_id,
    actor_profile.id,
    actor_profile.role,
    activity_method,
    nullif(btrim(coalesce(activity_client_response, '')), ''),
    nullif(btrim(coalesce(activity_internal_notes, '')), ''),
    nullif(btrim(coalesce(activity_outcome, '')), ''),
    next_due_at,
    activity_client_answered,
    should_close
  )
  returning * into activity_row;

  if should_close then
    update public.follow_up_tasks
    set
      status = 'completed',
      completed_at = now(),
      completed_by = actor_profile.id,
      completion_outcome = coalesce(
        nullif(btrim(coalesce(activity_outcome, '')), ''),
        case when next_due_at is not null then 'rescheduled' else 'completed' end
      )
    where id = task_row.id;

    update public.notifications
    set read_at = coalesce(read_at, now())
    where entity_type = 'follow_up_task'
      and entity_id = task_row.id;
  end if;

  if next_due_at is not null then
    insert into public.follow_up_tasks (
      client_id,
      project_id,
      quotation_id,
      task_type,
      owner_id,
      assigned_to,
      due_at,
      reminder_at,
      interval_source,
      rescheduled_from_id,
      deduplication_key,
      created_by
    )
    values (
      task_row.client_id,
      task_row.project_id,
      task_row.quotation_id,
      task_row.task_type,
      task_row.owner_id,
      task_row.assigned_to,
      next_due_at,
      next_due_at - interval '1 day',
      'rescheduled',
      task_row.id,
      concat_ws(
        ':',
        task_row.task_type,
        task_row.project_id::text,
        coalesce(task_row.quotation_id::text, 'project'),
        extract(epoch from next_due_at)::bigint::text
      ),
      actor_profile.id
    )
    returning * into next_task;

    insert into public.notifications (
      recipient_id,
      notification_kind,
      event_type,
      entity_type,
      entity_id,
      title_key,
      message_key,
      link_path,
      payload,
      deduplication_key
    )
    values (
      coalesce(next_task.assigned_to, next_task.owner_id, actor_profile.id),
      'action_required',
      'follow_up_rescheduled',
      'follow_up_task',
      next_task.id,
      'crm.notifications.followUpRescheduled',
      'crm.notifications.followUpRescheduledMessage',
      '/crm?taskId=' || next_task.id::text,
      jsonb_build_object(
        'project_id', next_task.project_id,
        'due_at', next_task.due_at,
        'task_type', next_task.task_type
      ),
      'follow-up-rescheduled:' || next_task.id::text
    );
  end if;

  update public.projects
  set
    next_follow_up_at = (
      select min(open_task.due_at)
      from public.follow_up_tasks open_task
      where open_task.project_id = task_row.project_id
        and open_task.status = 'open'
    ),
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
    'follow_up_activity_recorded',
    'follow_up_activity',
    activity_row.id,
    to_jsonb(activity_row),
    event_id
  );

  return activity_row;
end;
$$;

grant execute on function public.create_sales_follow_up_task(
  uuid,
  text,
  timestamptz,
  uuid,
  text,
  uuid
) to authenticated, service_role;

grant execute on function public.record_sales_follow_up_activity(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  timestamptz,
  boolean,
  uuid
) to authenticated, service_role;
