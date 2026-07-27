-- Phase 7: role-dashboard appointment actions and dashboard query indexes.

create index if not exists measurement_requests_assignee_status_preferred_idx
on public.measurement_requests (assigned_to, status, preferred_at);

create index if not exists appointments_assignee_status_starts_idx
on public.appointments (assigned_employee_id, status, starts_at);

create index if not exists projects_creator_status_updated_idx
on public.projects (original_creator_id, sales_status, updated_at desc)
where archived_at is null;

create or replace function public.update_sales_appointment_status(
  target_appointment_id uuid,
  target_status text,
  completion_note text default null,
  actor_user_id uuid default auth.uid()
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  appointment_row public.appointments;
  previous_row public.appointments;
begin
  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
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
      'Outdoor Sales',
      'Sales Rep',
      'Branch Manager'
    )
  then
    raise exception 'This employee cannot update sales appointments.';
  end if;

  if target_status not in (
    'completed',
    'postponed',
    'cancelled',
    'client_unavailable'
  ) then
    raise exception 'Select a valid appointment result.';
  end if;

  select * into appointment_row
  from public.appointments
  where id = target_appointment_id
  for update;

  if appointment_row.id is null then
    raise exception 'Appointment was not found.';
  end if;

  if actor_profile.role = 'Outdoor Sales'
    and appointment_row.assigned_employee_id is distinct from actor_user_id
  then
    raise exception 'This appointment is not assigned to you.';
  end if;

  if appointment_row.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'This appointment is already closed.';
  end if;

  previous_row := appointment_row;

  update public.appointments
  set
    status = target_status,
    completion_result = nullif(trim(completion_note), ''),
    completed_at = case
      when target_status in ('completed', 'client_unavailable') then now()
      else null
    end,
    cancelled_at = case when target_status = 'cancelled' then now() else null end,
    updated_at = now()
  where id = appointment_row.id
  returning * into appointment_row;

  insert into public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value
  )
  values (
    actor_user_id,
    actor_profile.role,
    'sales_appointment_status_updated',
    'appointment',
    appointment_row.id,
    jsonb_build_object('status', previous_row.status),
    jsonb_build_object(
      'status', appointment_row.status,
      'completion_result', appointment_row.completion_result
    )
  );

  return appointment_row;
end;
$$;

revoke all on function public.update_sales_appointment_status(
  uuid, text, text, uuid
) from public;

grant execute on function public.update_sales_appointment_status(
  uuid, text, text, uuid
) to service_role;
