-- Phase 4: controlled measurement requests, visits, versioned submissions,
-- and Indoor Sales review. This migration is additive and preserves all
-- existing opening records.

create table if not exists public.measurement_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  return_to_user_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  status text not null default 'requested',
  instructions text,
  preferred_at timestamptz,
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_requests_status_check check (
    status in (
      'requested',
      'unassigned',
      'assigned',
      'appointment_scheduled',
      'employee_en_route',
      'in_progress',
      'draft_saved',
      'submitted',
      'under_review',
      'correction_required',
      'approved',
      'cancelled',
      'client_unavailable',
      'postponed'
    )
  )
);

create unique index if not exists measurement_requests_one_open_project_idx
on public.measurement_requests (project_id)
where status not in ('approved', 'cancelled');

create index if not exists measurement_requests_assignee_queue_idx
on public.measurement_requests (assigned_to, status, preferred_at, requested_at desc);

create index if not exists measurement_requests_review_queue_idx
on public.measurement_requests (return_to_user_id, status, updated_at desc);

create table if not exists public.measurement_visits (
  id uuid primary key default gen_random_uuid(),
  measurement_request_id uuid not null references public.measurement_requests(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  performed_by uuid references public.profiles(id) on delete set null,
  visit_number integer not null default 1,
  started_at timestamptz not null default now(),
  draft_saved_at timestamptz,
  completed_at timestamptz,
  outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_visits_number_check check (visit_number > 0),
  constraint measurement_visits_outcome_check check (
    outcome is null or outcome in (
      'measurements_captured',
      'client_unavailable',
      'site_not_ready',
      'postponed',
      'cancelled'
    )
  )
);

create unique index if not exists measurement_visits_request_number_idx
on public.measurement_visits (measurement_request_id, visit_number);

create index if not exists measurement_visits_performer_timeline_idx
on public.measurement_visits (performed_by, started_at desc);

create table if not exists public.measurement_submissions (
  id uuid primary key default gen_random_uuid(),
  measurement_request_id uuid not null references public.measurement_requests(id) on delete restrict,
  measurement_visit_id uuid not null references public.measurement_visits(id) on delete restrict,
  version integer not null,
  status text not null default 'submitted',
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurement_submissions_version_check check (version > 0),
  constraint measurement_submissions_status_check check (
    status in ('submitted', 'under_review', 'correction_required', 'approved')
  ),
  constraint measurement_submissions_review_note_check check (
    status <> 'correction_required'
    or nullif(btrim(coalesce(review_note, '')), '') is not null
  )
);

create unique index if not exists measurement_submissions_request_version_idx
on public.measurement_submissions (measurement_request_id, version);

create index if not exists measurement_submissions_review_idx
on public.measurement_submissions (status, submitted_at desc);

alter table public.openings
  add column if not exists measurement_request_id uuid references public.measurement_requests(id) on delete restrict,
  add column if not exists measurement_visit_id uuid references public.measurement_visits(id) on delete restrict,
  add column if not exists measurement_submission_id uuid references public.measurement_submissions(id) on delete restrict,
  add column if not exists measurement_version integer;

alter table public.openings
  drop constraint if exists openings_project_id_opening_code_key;

create unique index if not exists openings_legacy_project_code_idx
on public.openings (project_id, opening_code)
where measurement_request_id is null;

create unique index if not exists openings_measurement_visit_code_idx
on public.openings (measurement_visit_id, opening_code)
where measurement_visit_id is not null;

create index if not exists openings_measurement_request_idx
on public.openings (measurement_request_id, created_at);

create index if not exists openings_measurement_submission_idx
on public.openings (measurement_submission_id, created_at)
where measurement_submission_id is not null;

drop trigger if exists measurement_requests_set_updated_at
on public.measurement_requests;
create trigger measurement_requests_set_updated_at
before update on public.measurement_requests
for each row execute function public.set_updated_at();

drop trigger if exists measurement_visits_set_updated_at
on public.measurement_visits;
create trigger measurement_visits_set_updated_at
before update on public.measurement_visits
for each row execute function public.set_updated_at();

drop trigger if exists measurement_submissions_set_updated_at
on public.measurement_submissions;
create trigger measurement_submissions_set_updated_at
before update on public.measurement_submissions
for each row execute function public.set_updated_at();

alter table public.measurement_requests enable row level security;
alter table public.measurement_visits enable row level security;
alter table public.measurement_submissions enable row level security;

drop policy if exists "measurement_requests_read_project"
on public.measurement_requests;
create policy "measurement_requests_read_project"
on public.measurement_requests
for select to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "measurement_visits_read_project"
on public.measurement_visits;
create policy "measurement_visits_read_project"
on public.measurement_visits
for select to authenticated
using (
  exists (
    select 1
    from public.measurement_requests request
    where request.id = measurement_visits.measurement_request_id
      and public.can_view_sales_project(request.project_id)
  )
);

drop policy if exists "measurement_submissions_read_project"
on public.measurement_submissions;
create policy "measurement_submissions_read_project"
on public.measurement_submissions
for select to authenticated
using (
  exists (
    select 1
    from public.measurement_requests request
    where request.id = measurement_submissions.measurement_request_id
      and public.can_view_sales_project(request.project_id)
  )
);

grant select on public.measurement_requests to authenticated;
grant select on public.measurement_visits to authenticated;
grant select on public.measurement_submissions to authenticated;
grant all on public.measurement_requests to service_role;
grant all on public.measurement_visits to service_role;
grant all on public.measurement_submissions to service_role;

create or replace function public.create_measurement_request(
  target_project_id uuid,
  target_assignee_id uuid default null,
  target_preferred_at timestamptz default null,
  request_instructions text default null,
  actor_user_id uuid default auth.uid()
)
returns public.measurement_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  assignee_profile public.profiles;
  project_row public.projects;
  request_row public.measurement_requests;
  appointment_row public.appointments;
  request_status text;
  next_project_status text;
  event_id uuid := gen_random_uuid();
begin
  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales')
  then
    raise exception 'This employee cannot request measurements.';
  end if;

  select * into project_row
  from public.projects
  where id = target_project_id
    and archived_at is null
  for update;

  if project_row.id is null then
    raise exception 'Project was not found.';
  end if;

  if exists (
    select 1 from public.measurement_requests existing
    where existing.project_id = project_row.id
      and existing.status not in ('approved', 'cancelled')
  ) then
    raise exception 'This project already has an open measurement request.';
  end if;

  if target_assignee_id is not null then
    select * into assignee_profile
    from public.profiles
    where id = target_assignee_id
      and is_active = true
      and coalesce(status, 'Active') <> 'Inactive'
      and role in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer');

    if assignee_profile.id is null then
      raise exception 'The selected measurement assignee is not available.';
    end if;
  end if;

  request_status := case
    when target_assignee_id is not null and target_preferred_at is not null
      then 'appointment_scheduled'
    when target_assignee_id is not null then 'assigned'
    else 'unassigned'
  end;
  next_project_status := case
    when target_assignee_id is not null and target_preferred_at is not null
      then 'measurement_scheduled'
    when target_assignee_id is not null then 'measurement_assigned'
    else 'measurement_required'
  end;

  insert into public.measurement_requests (
    project_id,
    requested_by,
    return_to_user_id,
    assigned_to,
    status,
    instructions,
    preferred_at,
    assigned_at
  )
  values (
    project_row.id,
    actor_profile.id,
    actor_profile.id,
    target_assignee_id,
    request_status,
    nullif(btrim(coalesce(request_instructions, '')), ''),
    target_preferred_at,
    case when target_assignee_id is not null then now() else null end
  )
  returning * into request_row;

  if target_preferred_at is not null and target_assignee_id is not null then
    if project_row.client_id is null then
      raise exception 'The project needs a client before scheduling a visit.';
    end if;

    insert into public.appointments (
      client_id,
      project_id,
      appointment_type,
      assigned_employee_id,
      created_by,
      starts_at,
      expected_duration_minutes,
      location,
      notes,
      status
    )
    values (
      project_row.client_id,
      project_row.id,
      'site_measurement',
      target_assignee_id,
      actor_profile.id,
      target_preferred_at,
      90,
      project_row.address,
      nullif(btrim(coalesce(request_instructions, '')), ''),
      'assigned'
    )
    returning * into appointment_row;

    update public.measurement_requests
    set appointment_id = appointment_row.id
    where id = request_row.id
    returning * into request_row;
  end if;

  if target_assignee_id is not null then
    update public.project_assignments
    set ended_at = now(), ended_by = actor_profile.id
    where project_id = project_row.id
      and assignment_type = 'measurement'
      and ended_at is null;

    insert into public.project_assignments (
      project_id,
      assignment_type,
      assignee_id,
      assigned_by,
      reason,
      metadata
    )
    values (
      project_row.id,
      'measurement',
      target_assignee_id,
      actor_profile.id,
      'Measurement request assignment',
      jsonb_build_object('measurement_request_id', request_row.id)
    );
  end if;

  update public.projects
  set
    sales_status = next_project_status,
    responsible_user_id = coalesce(target_assignee_id, responsible_user_id),
    responsible_department = case
      when target_assignee_id is null then responsible_department
      else 'outdoor_sales'
    end,
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = project_row.id;

  insert into public.project_status_history (
    project_id,
    previous_status,
    new_status,
    changed_by,
    changed_by_role,
    reason,
    correlation_id
  )
  values (
    project_row.id,
    project_row.sales_status,
    next_project_status,
    actor_profile.id,
    actor_profile.role,
    nullif(btrim(coalesce(request_instructions, '')), ''),
    event_id
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
    'measurement_requested',
    'measurement_request',
    request_row.id,
    to_jsonb(request_row),
    event_id
  );

  return request_row;
end;
$$;

grant execute on function public.create_measurement_request(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid
) to authenticated, service_role;

create or replace function public.assign_measurement_request(
  target_request_id uuid,
  target_assignee_id uuid,
  target_preferred_at timestamptz default null,
  assignment_note text default null,
  actor_user_id uuid default auth.uid()
)
returns public.measurement_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  assignee_profile public.profiles;
  request_row public.measurement_requests;
  project_row public.projects;
  appointment_row public.appointments;
  next_request_status text;
  next_project_status text;
  event_id uuid := gen_random_uuid();
begin
  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales')
  then
    raise exception 'This employee cannot assign measurements.';
  end if;

  select * into assignee_profile
  from public.profiles
  where id = target_assignee_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive'
    and role in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer');

  if assignee_profile.id is null then
    raise exception 'The selected measurement assignee is not available.';
  end if;

  select * into request_row
  from public.measurement_requests
  where id = target_request_id
  for update;

  if request_row.id is null
    or request_row.status not in (
      'requested',
      'unassigned',
      'assigned',
      'appointment_scheduled',
      'postponed'
    )
  then
    raise exception 'This measurement request cannot be assigned.';
  end if;

  select * into project_row
  from public.projects
  where id = request_row.project_id
    and archived_at is null
  for update;

  next_request_status := case
    when target_preferred_at is null then 'assigned'
    else 'appointment_scheduled'
  end;
  next_project_status := case
    when target_preferred_at is null then 'measurement_assigned'
    else 'measurement_scheduled'
  end;

  if request_row.appointment_id is not null then
    update public.appointments
    set
      assigned_employee_id = assignee_profile.id,
      starts_at = coalesce(target_preferred_at, starts_at),
      notes = coalesce(nullif(btrim(coalesce(assignment_note, '')), ''), notes),
      status = case
        when target_preferred_at is null then 'assigned'
        else 'confirmed'
      end
    where id = request_row.appointment_id
    returning * into appointment_row;
  elsif target_preferred_at is not null then
    if project_row.client_id is null then
      raise exception 'The project needs a client before scheduling a visit.';
    end if;

    insert into public.appointments (
      client_id,
      project_id,
      appointment_type,
      assigned_employee_id,
      created_by,
      starts_at,
      expected_duration_minutes,
      location,
      notes,
      status
    )
    values (
      project_row.client_id,
      project_row.id,
      'site_measurement',
      assignee_profile.id,
      actor_profile.id,
      target_preferred_at,
      90,
      project_row.address,
      nullif(btrim(coalesce(assignment_note, '')), ''),
      'assigned'
    )
    returning * into appointment_row;
  end if;

  update public.project_assignments
  set ended_at = now(), ended_by = actor_profile.id
  where project_id = project_row.id
    and assignment_type = 'measurement'
    and ended_at is null;

  insert into public.project_assignments (
    project_id,
    assignment_type,
    assignee_id,
    assigned_by,
    reason,
    metadata
  )
  values (
    project_row.id,
    'measurement',
    assignee_profile.id,
    actor_profile.id,
    coalesce(
      nullif(btrim(coalesce(assignment_note, '')), ''),
      'Measurement request assignment'
    ),
    jsonb_build_object('measurement_request_id', request_row.id)
  );

  update public.measurement_requests
  set
    assigned_to = assignee_profile.id,
    assigned_at = now(),
    preferred_at = coalesce(target_preferred_at, preferred_at),
    appointment_id = coalesce(appointment_row.id, appointment_id),
    status = next_request_status
  where id = request_row.id
  returning * into request_row;

  update public.projects
  set
    sales_status = next_project_status,
    responsible_user_id = assignee_profile.id,
    responsible_department = 'outdoor_sales',
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = project_row.id;

  if project_row.sales_status is distinct from next_project_status then
    insert into public.project_status_history (
      project_id,
      previous_status,
      new_status,
      changed_by,
      changed_by_role,
      reason,
      correlation_id
    )
    values (
      project_row.id,
      project_row.sales_status,
      next_project_status,
      actor_profile.id,
      actor_profile.role,
      nullif(btrim(coalesce(assignment_note, '')), ''),
      event_id
    );
  end if;

  insert into public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    new_value,
    reason,
    correlation_id
  )
  values (
    actor_profile.id,
    actor_profile.role,
    'measurement_assigned',
    'measurement_request',
    request_row.id,
    jsonb_build_object(
      'assigned_to',
      assignee_profile.id,
      'status',
      request_row.status,
      'preferred_at',
      request_row.preferred_at
    ),
    nullif(btrim(coalesce(assignment_note, '')), ''),
    event_id
  );

  return request_row;
end;
$$;

grant execute on function public.assign_measurement_request(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid
) to authenticated, service_role;

-- One transactional entry point keeps request state, project sales status,
-- versioning, opening snapshots, history, and audit aligned.
create or replace function public.advance_measurement_workflow(
  target_request_id uuid,
  workflow_action text,
  actor_user_id uuid default auth.uid(),
  action_note text default null
)
returns public.measurement_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.measurement_requests;
  project_row public.projects;
  actor_profile public.profiles;
  visit_row public.measurement_visits;
  submission_row public.measurement_submissions;
  next_version integer;
  next_request_status text;
  next_project_status text;
  previous_request_status text;
  event_id uuid := gen_random_uuid();
begin
  if actor_user_id is null then
    raise exception 'An actor is required.';
  end if;

  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null then
    raise exception 'The actor is not an active employee.';
  end if;

  select * into request_row
  from public.measurement_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'Measurement request was not found.';
  end if;
  previous_request_status := request_row.status;

  select * into project_row
  from public.projects
  where id = request_row.project_id
  for update;

  if workflow_action = 'en_route' then
    if actor_profile.role not in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer')
      or (actor_profile.role <> 'Admin' and request_row.assigned_to is distinct from actor_profile.id)
      or request_row.status not in ('assigned', 'appointment_scheduled')
    then
      raise exception 'This employee cannot mark the visit as en route.';
    end if;

    next_request_status := 'employee_en_route';
    next_project_status := project_row.sales_status;
  elsif workflow_action = 'start' then
    if actor_profile.role not in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer')
      or (actor_profile.role <> 'Admin' and request_row.assigned_to is distinct from actor_profile.id)
      or request_row.status not in (
        'assigned',
        'appointment_scheduled',
        'employee_en_route',
        'correction_required'
      )
    then
      raise exception 'This measurement request cannot be started by this employee.';
    end if;

    insert into public.measurement_visits (
      measurement_request_id,
      appointment_id,
      performed_by,
      visit_number
    )
    values (
      request_row.id,
      request_row.appointment_id,
      actor_profile.id,
      coalesce((
        select max(visit.visit_number) + 1
        from public.measurement_visits visit
        where visit.measurement_request_id = request_row.id
      ), 1)
    )
    returning * into visit_row;

    if request_row.status = 'correction_required' then
      insert into public.openings (
        project_id,
        floor,
        room,
        opening_code,
        width,
        height,
        solid_panel_height,
        fixed_height,
        quantity,
        product_system,
        glass_type,
        aluminum_color,
        shape,
        opening_type,
        bottom_frame,
        opening_direction,
        glass_color,
        notes,
        created_by,
        measurement_request_id,
        measurement_visit_id
      )
      select
        opening.project_id,
        opening.floor,
        opening.room,
        opening.opening_code,
        opening.width,
        opening.height,
        opening.solid_panel_height,
        opening.fixed_height,
        opening.quantity,
        opening.product_system,
        opening.glass_type,
        opening.aluminum_color,
        opening.shape,
        opening.opening_type,
        opening.bottom_frame,
        opening.opening_direction,
        opening.glass_color,
        opening.notes,
        actor_profile.id,
        request_row.id,
        visit_row.id
      from public.openings opening
      where opening.measurement_request_id = request_row.id
        and opening.measurement_version = (
          select max(version)
          from public.measurement_submissions
          where measurement_request_id = request_row.id
        );
    end if;

    next_request_status := 'in_progress';
    next_project_status := 'measurement_in_progress';
  elsif workflow_action = 'save_draft' then
    if actor_profile.role not in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer')
      or (actor_profile.role <> 'Admin' and request_row.assigned_to is distinct from actor_profile.id)
      or request_row.status not in ('in_progress', 'draft_saved')
    then
      raise exception 'This measurement draft cannot be saved by this employee.';
    end if;

    select * into visit_row
    from public.measurement_visits
    where measurement_request_id = request_row.id
      and completed_at is null
    order by started_at desc
    limit 1
    for update;

    update public.measurement_visits
    set draft_saved_at = now()
    where id = visit_row.id;

    next_request_status := 'draft_saved';
    next_project_status := 'measurement_in_progress';
  elsif workflow_action = 'submit' then
    if actor_profile.role not in ('Admin', 'Outdoor Sales', 'Project Engineer', 'Site Engineer')
      or (actor_profile.role <> 'Admin' and request_row.assigned_to is distinct from actor_profile.id)
      or request_row.status not in ('in_progress', 'draft_saved')
    then
      raise exception 'This measurement request cannot be submitted by this employee.';
    end if;

    select * into visit_row
    from public.measurement_visits
    where measurement_request_id = request_row.id
      and completed_at is null
    order by started_at desc
    limit 1
    for update;

    if visit_row.id is null then
      raise exception 'Start a measurement visit before submitting.';
    end if;

    if not exists (
      select 1 from public.openings opening
      where opening.measurement_request_id = request_row.id
        and opening.measurement_visit_id = visit_row.id
    ) then
      raise exception 'Add at least one opening before submitting measurements.';
    end if;

    select coalesce(max(submission.version), 0) + 1 into next_version
    from public.measurement_submissions submission
    where submission.measurement_request_id = request_row.id;

    insert into public.measurement_submissions (
      measurement_request_id,
      measurement_visit_id,
      version,
      status,
      submitted_by
    )
    values (
      request_row.id,
      visit_row.id,
      next_version,
      'submitted',
      actor_profile.id
    )
    returning * into submission_row;

    update public.openings
    set
      measurement_submission_id = submission_row.id,
      measurement_version = next_version
    where measurement_request_id = request_row.id
      and measurement_visit_id = visit_row.id;

    update public.measurement_visits
    set
      completed_at = now(),
      outcome = 'measurements_captured'
    where id = visit_row.id;

    next_request_status := 'submitted';
    next_project_status := 'measurements_submitted';
  elsif workflow_action = 'begin_review' then
    if actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales')
      or request_row.status <> 'submitted'
    then
      raise exception 'This measurement submission cannot enter review.';
    end if;

    update public.measurement_submissions
    set status = 'under_review'
    where measurement_request_id = request_row.id
      and version = (
        select max(version)
        from public.measurement_submissions
        where measurement_request_id = request_row.id
      );

    next_request_status := 'under_review';
    next_project_status := 'measurements_under_review';
  elsif workflow_action = 'return' then
    if actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales')
      or request_row.status not in ('submitted', 'under_review')
      or nullif(btrim(coalesce(action_note, '')), '') is null
    then
      raise exception 'A correction reason is required to return measurements.';
    end if;

    update public.measurement_submissions
    set
      status = 'correction_required',
      reviewed_by = actor_profile.id,
      reviewed_at = now(),
      review_note = btrim(action_note)
    where measurement_request_id = request_row.id
      and version = (
        select max(version)
        from public.measurement_submissions
        where measurement_request_id = request_row.id
      );

    next_request_status := 'correction_required';
    next_project_status := 'measurements_need_correction';
  elsif workflow_action = 'approve' then
    if actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales')
      or request_row.status not in ('submitted', 'under_review')
    then
      raise exception 'This measurement submission cannot be approved.';
    end if;

    update public.measurement_submissions
    set
      status = 'approved',
      reviewed_by = actor_profile.id,
      reviewed_at = now(),
      review_note = nullif(btrim(coalesce(action_note, '')), '')
    where measurement_request_id = request_row.id
      and version = (
        select max(version)
        from public.measurement_submissions
        where measurement_request_id = request_row.id
      );

    next_request_status := 'approved';
    next_project_status := 'ready_for_quotation';
  else
    raise exception 'Unknown measurement workflow action.';
  end if;

  update public.measurement_requests
  set
    status = next_request_status,
    completed_at = case when next_request_status = 'approved' then now() else completed_at end
  where id = request_row.id
  returning * into request_row;

  if project_row.sales_status is distinct from next_project_status then
    update public.projects
    set
      sales_status = next_project_status,
      last_updated_by = actor_profile.id,
      updated_at = now()
    where id = project_row.id;

    insert into public.project_status_history (
      project_id,
      previous_status,
      new_status,
      changed_by,
      changed_by_role,
      reason,
      correlation_id
    )
    values (
      project_row.id,
      project_row.sales_status,
      next_project_status,
      actor_profile.id,
      actor_profile.role,
      nullif(btrim(coalesce(action_note, '')), ''),
      event_id
    );
  end if;

  insert into public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value,
    reason,
    correlation_id
  )
  values (
    actor_profile.id,
    actor_profile.role,
    'measurement_' || workflow_action,
    'measurement_request',
    request_row.id,
    jsonb_build_object('status', previous_request_status),
    jsonb_build_object('status', next_request_status),
    nullif(btrim(coalesce(action_note, '')), ''),
    event_id
  );

  return request_row;
end;
$$;

grant execute on function public.advance_measurement_workflow(
  uuid,
  text,
  uuid,
  text
) to authenticated, service_role;
