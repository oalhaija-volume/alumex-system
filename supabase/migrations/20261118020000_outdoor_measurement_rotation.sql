begin;

-- Measurement responsibility follows the current Baghdad coverage area.
-- Original sales attribution, saved measurements and postponed visits stay intact.
create function public.rotate_outdoor_measurement_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_at timestamptz := statement_timestamp();
  project_row public.projects;
  replacement_id uuid;
  assignment_id uuid;
  transferred integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('alumex-outdoor-measurement-rotation', 0));

  -- Keep the roster stable throughout the handoff, including employee deactivation.
  perform employee.id from public.profiles employee
  where employee.role::text = 'Outdoor Sales' and employee.branch in ('Karkh', 'Rasafa')
  order by employee.id for share;

  for project_row in
    select project.* from public.projects project
    join public.profiles previous on previous.id = project.assigned_outdoor_sales_id
    where project.archived_at is null and project.branch in ('Karkh', 'Rasafa')
      and project.structure_readiness = 'ready' and project.sales_status = 'new_lead'
      and previous.role::text = 'Outdoor Sales' and previous.branch in ('Karkh', 'Rasafa')
      and (previous.is_active is distinct from true or previous.status is distinct from 'Active'
        or public.outdoor_sales_branch_for_date(
          coalesce(previous.outdoor_rotation_start_branch, 'Karkh'), effective_at
        ) is distinct from project.branch)
    order by project.id
    for update of project
  loop
    -- Both teammates share tasks. Balance the named assignees within the area,
    -- retaining every assignment that already belongs to its current coverage.
    select employee.id into replacement_id from public.profiles employee
    where employee.role::text = 'Outdoor Sales' and employee.is_active and employee.status = 'Active'
      and employee.branch in ('Karkh', 'Rasafa')
      and public.outdoor_sales_branch_for_date(
        coalesce(employee.outdoor_rotation_start_branch, 'Karkh'), effective_at
      ) = project_row.branch
    order by (
      select count(*) from public.projects pending
      where pending.assigned_outdoor_sales_id = employee.id and pending.archived_at is null
        and pending.branch = project_row.branch and pending.structure_readiness = 'ready'
        and pending.sales_status = 'new_lead'
    ), employee.id
    limit 1 for share of employee;

    if replacement_id is null then
      raise warning 'No active Outdoor Sales coverage for %; measurement assignment retained for project %.',
        project_row.branch, project_row.id;
      continue;
    end if;

    assignment_id := gen_random_uuid();
    update public.projects set assigned_outdoor_sales_id = replacement_id,
      measurement_assignment_id = assignment_id
    where id = project_row.id;

    insert into public.activity_logs (actor_id, entity_type, entity_id, action, metadata)
    values (null, 'project', project_row.id, 'outdoor_measurement_rotation', jsonb_build_object(
      'reason', 'coverage_rotation', 'branch', project_row.branch, 'effective_at', effective_at,
      'previous_assignee_id', project_row.assigned_outdoor_sales_id,
      'assigned_outdoor_sales_id', replacement_id,
      'previous_assignment_id', project_row.measurement_assignment_id,
      'measurement_assignment_id', assignment_id,
      'measurement_delayed', project_row.measurement_delayed
    ));

    update public.notifications set read_at = now()
    where entity_type = 'project' and entity_id = project_row.id
      and event_type = 'measurement_assigned' and read_at is null;

    -- Postponed jobs remain with CRM until resumed; do not reactivate them.
    if not project_row.measurement_delayed then
      insert into public.notifications (
        recipient_id, notification_kind, event_type, entity_type, entity_id,
        title_key, message_key, link_path, payload, deduplication_key
      )
      select employee.id, 'action_required', 'measurement_assigned', 'project', project_row.id,
        'notifications.measurementAssigned', 'notifications.collectInitialMeasurements',
        '/initial-measurements/' || project_row.id::text,
        jsonb_build_object('project_name', project_row.project_name,
          'project_number', project_row.project_number, 'measurement_assignment_id', assignment_id,
          'reason', 'coverage_rotation'),
        'measurement-rotation:' || assignment_id::text
      from public.profiles employee
      where employee.id in (select public.outdoor_sales_team_member_ids(replacement_id))
        and employee.branch in ('Karkh', 'Rasafa')
        and public.outdoor_sales_branch_for_date(
          coalesce(employee.outdoor_rotation_start_branch, 'Karkh'), effective_at
        ) = project_row.branch
      on conflict (recipient_id, deduplication_key) where deduplication_key is not null do nothing;
    end if;

    transferred := transferred + 1;
  end loop;

  return transferred;
end;
$$;

revoke all on function public.rotate_outdoor_measurement_tasks() from public, anon, authenticated;
grant execute on function public.rotate_outdoor_measurement_tasks() to service_role;

-- BEGIN SCHEDULER
-- Supabase Cron executes inside the database, without a browser session.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'The measurement rotation schedule requires a UTC Supabase Cron timezone.';
  end if;
end;
$$;

-- 21:00 UTC is Baghdad midnight. Daily retries also recover missed boundaries
-- and employee roster changes; correctly assigned tasks are never rewritten.
select cron.schedule('alumex-outdoor-measurement-rotation', '0 21 * * *',
  'select public.rotate_outdoor_measurement_tasks();');
-- END SCHEDULER

-- Correct existing pending work using the same transaction as future handoffs.
select public.rotate_outdoor_measurement_tasks();

notify pgrst, 'reload schema';
commit;
