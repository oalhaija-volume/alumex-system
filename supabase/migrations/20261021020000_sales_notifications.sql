begin;

-- Resolve CRM ownership using the same Indoor Sales branch boundary as the
-- workspace. An unclaimed project reaches its branch team and Sales Managers.
create function public.sales_notification_recipients(target_project uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with project as (select * from public.projects where id = target_project),
  eligible as (
    select u.id from public.profiles u cross join project p
    where u.is_active and u.status = 'Active'
      and (u.role::text = 'Sales Manager'
        or (u.role::text = 'Indoor Sales' and u.branch = p.branch and p.branch in ('Karkh', 'Rasafa')))
  )
  select e.id from eligible e cross join project p
  where e.id = p.follow_up_owner_id
    or not exists (select 1 from eligible owner where owner.id = p.follow_up_owner_id);
$$;
revoke all on function public.sales_notification_recipients(uuid) from public, anon, authenticated;

-- Receipts are committed with both online and offline sales changes. Retrying
-- an operation returns its saved receipt, so it never generates another alert.
create function public.notify_sales_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  project public.projects;
  title text;
  event_name text;
begin
  if new.action not in ('register','finish','delay-measurements','follow-up','ready','assign-measurements','resume-measurements','request-openings','cancel-project') then
    return new;
  end if;
  select * into project from public.projects where id = new.project_id and archived_at is null;
  if project.id is null then return new; end if;

  -- Retire notifications for work that has just been completed or rescheduled.
  if new.action in ('finish','delay-measurements','assign-measurements','resume-measurements','request-openings','cancel-project') then
    update public.notifications set read_at = now()
    where entity_type = 'project' and entity_id = project.id and read_at is null
      and event_type = 'measurement_assigned';
  end if;
  if new.action in ('follow-up','ready','assign-measurements','resume-measurements','delay-measurements','cancel-project') then
    update public.notifications set read_at = now()
    where entity_type = 'project' and entity_id = project.id and read_at is null
      and event_type in ('follow_up_due','follow_up_assigned','measurement_visit_returned','project_follow_up_assigned');
  end if;

  if new.action in ('register','finish','delay-measurements','follow-up')
    and project.sales_status not in ('contract_signed','transferred_to_operations','cancelled','lost','closed') then
    title := case when new.action = 'delay-measurements' then 'notifications.measurementVisitReturned'
      when new.action = 'follow-up' then 'crm.notifications.followUpAssigned'
      else 'notifications.projectFollowUpAssigned' end;
    event_name := case when new.action = 'delay-measurements' then 'measurement_visit_returned'
      when new.action = 'follow-up' then 'follow_up_assigned' else 'project_follow_up_assigned' end;
    insert into public.notifications (
      recipient_id, notification_kind, event_type, entity_type, entity_id,
      title_key, message_key, link_path, payload, deduplication_key
    ) select recipient, 'action_required', event_name, 'project', project.id,
      title, title, '/mini-crm#project-' || project.id::text,
      jsonb_build_object('project_name', project.project_name, 'project_number', project.project_number,
        'due_at', project.next_follow_up_at, 'visit_outcome', project.measurement_delay_reason),
      'sales-event:' || new.operation_id::text || ':' || event_name
    from public.sales_notification_recipients(project.id) recipient
    where recipient <> new.actor_id
    on conflict (recipient_id, deduplication_key) where deduplication_key is not null do nothing;
  end if;

  if new.action in ('register','ready','assign-measurements','resume-measurements','request-openings')
    and project.structure_readiness = 'ready' and project.sales_status = 'new_lead'
    and not project.measurement_delayed and project.assigned_outdoor_sales_id is not null then
    insert into public.notifications (
      recipient_id, notification_kind, event_type, entity_type, entity_id,
      title_key, message_key, link_path, payload, deduplication_key
    ) select u.id, 'action_required', 'measurement_assigned', 'project', project.id,
      'notifications.measurementAssigned', 'notifications.collectInitialMeasurements',
      '/initial-measurements/' || project.id::text,
      jsonb_build_object('project_name', project.project_name, 'project_number', project.project_number,
        'measurement_assignment_id', project.measurement_assignment_id),
      'measurement-assigned:' || new.operation_id::text
    from public.profiles u where u.id = project.assigned_outdoor_sales_id
      and u.role::text = 'Outdoor Sales' and u.is_active and u.status = 'Active'
    on conflict (recipient_id, deduplication_key) where deduplication_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_sales_field_change() from public, anon, authenticated;
create trigger sales_field_change_notification after insert on public.field_sync_receipts
for each row execute function public.notify_sales_field_change();

-- Called by the signed-in notification poll. No scheduler credentials, browser
-- timers per project, or writes for other employees are required.
create function public.deliver_due_follow_up_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  employee public.profiles;
  inserted_count integer;
begin
  select * into employee from public.profiles where id = auth.uid() and is_active and status = 'Active';
  if employee.id is null or employee.role::text not in ('Indoor Sales','Sales Manager','Admin','Sales Director','CEO','Company Owner') then
    return 0;
  end if;
  -- Commercial handoff and ownership changes can happen outside field sync.
  -- Keep this employee's reminder inbox consistent with the live CRM queue.
  update public.notifications n set read_at = now()
  where n.recipient_id = employee.id and n.event_type = 'follow_up_due'
    and n.entity_type = 'project' and n.read_at is null
    and not exists (
      select 1 from public.projects p
      where p.id = n.entity_id and p.archived_at is null and p.next_follow_up_at <= now()
        and p.sales_status not in ('contract_signed','transferred_to_operations','cancelled','lost','closed')
        and (p.follow_up_owner_id = employee.id or (p.follow_up_owner_id is null and p.created_by = employee.id))
        and (employee.role::text <> 'Indoor Sales' or (employee.branch in ('Karkh','Rasafa') and employee.branch = p.branch))
        and n.deduplication_key = 'follow-up-due:' || p.id::text || ':' || extract(epoch from p.next_follow_up_at)::text
    );
  insert into public.notifications (
    recipient_id, notification_kind, event_type, entity_type, entity_id,
    title_key, message_key, link_path, payload, deduplication_key
  ) select employee.id, 'overdue', 'follow_up_due', 'project', p.id,
    'notifications.followUpDue', 'notifications.followUpDue', '/mini-crm#project-' || p.id::text,
    jsonb_build_object('project_name', p.project_name, 'project_number', p.project_number, 'due_at', p.next_follow_up_at),
    'follow-up-due:' || p.id::text || ':' || extract(epoch from p.next_follow_up_at)::text
  from public.projects p
  where p.archived_at is null and p.next_follow_up_at <= now()
    and p.sales_status not in ('contract_signed','transferred_to_operations','cancelled','lost','closed')
    and (p.follow_up_owner_id = employee.id or (p.follow_up_owner_id is null and p.created_by = employee.id))
    and (employee.role::text <> 'Indoor Sales' or (employee.branch in ('Karkh','Rasafa') and employee.branch = p.branch))
  on conflict (recipient_id, deduplication_key) where deduplication_key is not null do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.deliver_due_follow_up_notifications() from public, anon;
grant execute on function public.deliver_due_follow_up_notifications() to authenticated;

notify pgrst, 'reload schema';
commit;
