-- Alumex sales workflow and mini CRM foundation.
-- This migration is additive: it preserves existing clients, projects,
-- openings, quotations, contracts, and downstream workflow records.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Project attribution and responsibility
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists original_source text,
  add column if not exists original_creator_id uuid references public.profiles(id) on delete restrict,
  add column if not exists original_creator_role public.app_role,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsible_department text,
  add column if not exists sales_status text,
  add column if not exists structure_readiness text,
  add column if not exists expected_structure_ready_date date,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists priority text,
  add column if not exists estimated_value numeric(14, 2),
  add column if not exists project_notes text,
  add column if not exists last_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

update public.projects project
set
  original_source = coalesce(project.original_source, 'legacy'),
  original_creator_id = coalesce(
    project.original_creator_id,
    project.created_by,
    project.sales_engineer_id
  ),
  original_creator_role = coalesce(
    project.original_creator_role,
    (
      select profile.role
      from public.profiles profile
      where profile.id = coalesce(
        project.original_creator_id,
        project.created_by,
        project.sales_engineer_id
      )
    )
  ),
  owner_id = coalesce(project.owner_id, project.sales_engineer_id, project.created_by),
  responsible_user_id = coalesce(
    project.responsible_user_id,
    project.sales_engineer_id,
    project.created_by
  ),
  responsible_department = coalesce(
    project.responsible_department,
    case
      when coalesce(project.sales_engineer_id, project.created_by) is null then 'unassigned'
      else 'sales'
    end
  ),
  sales_status = coalesce(
    project.sales_status,
    case project.status::text
      when 'Measuring' then 'measurement_in_progress'
      when 'Quotation' then 'quotation_in_progress'
      when 'Contract' then 'contract_generated'
      when 'Production' then 'transferred_to_operations'
      when 'Completed' then 'transferred_to_operations'
      else 'new_lead'
    end
  ),
  structure_readiness = coalesce(
    project.structure_readiness,
    case
      when exists (
        select 1
        from public.openings opening
        where opening.project_id = project.id
      ) then 'ready'
      else 'unknown'
    end
  ),
  priority = coalesce(project.priority, 'normal')
;

-- Fill any remaining creator-role value after the attribution backfill.
update public.projects project
set original_creator_role = profile.role
from public.profiles profile
where project.original_creator_role is null
  and profile.id = project.original_creator_id;

update public.projects
set
  original_source = coalesce(original_source, 'legacy'),
  responsible_department = coalesce(responsible_department, 'unassigned'),
  sales_status = coalesce(sales_status, 'new_lead'),
  structure_readiness = coalesce(structure_readiness, 'unknown'),
  priority = coalesce(priority, 'normal');

alter table public.projects
  alter column original_source set default 'legacy',
  alter column original_source set not null,
  alter column responsible_department set default 'unassigned',
  alter column responsible_department set not null,
  alter column sales_status set default 'new_lead',
  alter column sales_status set not null,
  alter column structure_readiness set default 'unknown',
  alter column structure_readiness set not null,
  alter column priority set default 'normal',
  alter column priority set not null;

alter table public.projects
  drop constraint if exists projects_original_source_check,
  add constraint projects_original_source_check check (
    original_source in (
      'outdoor_sales',
      'showroom_walk_in',
      'existing_client',
      'referral',
      'phone_inquiry',
      'website',
      'social_media',
      'management_referral',
      'other',
      'legacy'
    )
  ),
  drop constraint if exists projects_responsible_department_check,
  add constraint projects_responsible_department_check check (
    responsible_department in (
      'indoor_sales',
      'outdoor_sales',
      'sales_management',
      'operations',
      'sales',
      'unassigned'
    )
  ),
  drop constraint if exists projects_structure_readiness_check,
  add constraint projects_structure_readiness_check check (
    structure_readiness in ('unknown', 'ready', 'not_ready')
  ),
  drop constraint if exists projects_priority_check,
  add constraint projects_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  drop constraint if exists projects_estimated_value_check,
  add constraint projects_estimated_value_check check (
    estimated_value is null or estimated_value >= 0
  ),
  drop constraint if exists projects_archive_fields_check,
  add constraint projects_archive_fields_check check (
    archived_at is null or archive_reason is not null
  );

-- ---------------------------------------------------------------------------
-- Central sales status catalog and allowed transitions
-- ---------------------------------------------------------------------------

create table if not exists public.sales_status_definitions (
  status_key text primary key,
  sort_order integer not null unique,
  label_key text not null unique,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.sales_status_definitions (
  status_key,
  sort_order,
  label_key,
  is_terminal
)
values
  ('new_lead', 10, 'salesStatus.newLead', false),
  ('client_registered', 20, 'salesStatus.clientRegistered', false),
  ('structure_not_ready', 30, 'salesStatus.structureNotReady', false),
  ('waiting_for_follow_up', 40, 'salesStatus.waitingForFollowUp', false),
  ('measurement_required', 50, 'salesStatus.measurementRequired', false),
  ('measurement_scheduled', 60, 'salesStatus.measurementScheduled', false),
  ('measurement_assigned', 70, 'salesStatus.measurementAssigned', false),
  ('measurement_in_progress', 80, 'salesStatus.measurementInProgress', false),
  ('measurements_submitted', 90, 'salesStatus.measurementsSubmitted', false),
  ('measurements_under_review', 100, 'salesStatus.measurementsUnderReview', false),
  ('measurements_need_correction', 110, 'salesStatus.measurementsNeedCorrection', false),
  ('ready_for_quotation', 120, 'salesStatus.readyForQuotation', false),
  ('quotation_in_progress', 130, 'salesStatus.quotationInProgress', false),
  ('quotation_ready', 140, 'salesStatus.quotationReady', false),
  ('quotation_presented', 150, 'salesStatus.quotationPresented', false),
  ('quotation_sent', 160, 'salesStatus.quotationSent', false),
  ('quotation_follow_up', 170, 'salesStatus.quotationFollowUp', false),
  ('negotiation', 180, 'salesStatus.negotiation', false),
  ('quotation_approved', 190, 'salesStatus.quotationApproved', false),
  ('quotation_rejected', 200, 'salesStatus.quotationRejected', true),
  ('client_postponed', 210, 'salesStatus.clientPostponed', true),
  ('client_not_interested', 220, 'salesStatus.clientNotInterested', true),
  ('lost', 230, 'salesStatus.lost', true),
  ('cancelled', 240, 'salesStatus.cancelled', true),
  ('contract_preparation', 250, 'salesStatus.contractPreparation', false),
  ('contract_generated', 260, 'salesStatus.contractGenerated', false),
  ('contract_sent', 270, 'salesStatus.contractSent', false),
  ('contract_signed', 280, 'salesStatus.contractSigned', false),
  ('transferred_to_operations', 290, 'salesStatus.transferredToOperations', true)
on conflict (status_key) do update
set
  sort_order = excluded.sort_order,
  label_key = excluded.label_key,
  is_terminal = excluded.is_terminal;

alter table public.projects
  drop constraint if exists projects_sales_status_fkey;

alter table public.projects
  add constraint projects_sales_status_fkey
  foreign key (sales_status)
  references public.sales_status_definitions(status_key)
  on update restrict
  on delete restrict;

create table if not exists public.sales_status_transitions (
  from_status text not null references public.sales_status_definitions(status_key) on delete cascade,
  to_status text not null references public.sales_status_definitions(status_key) on delete cascade,
  allowed_roles public.app_role[] not null,
  requires_reason boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_status, to_status),
  constraint sales_status_transition_changes_state check (from_status <> to_status)
);

insert into public.sales_status_transitions (
  from_status,
  to_status,
  allowed_roles,
  requires_reason
)
values
  ('new_lead', 'client_registered', array['Admin', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales']::public.app_role[], false),
  ('client_registered', 'structure_not_ready', array['Admin', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales']::public.app_role[], false),
  ('client_registered', 'measurement_required', array['Admin', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales']::public.app_role[], false),
  ('client_registered', 'measurement_in_progress', array['Admin', 'Sales Manager', 'Outdoor Sales']::public.app_role[], false),
  ('structure_not_ready', 'waiting_for_follow_up', array['Admin', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales']::public.app_role[], false),
  ('waiting_for_follow_up', 'structure_not_ready', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('waiting_for_follow_up', 'measurement_required', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('measurement_required', 'measurement_scheduled', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('measurement_required', 'measurement_assigned', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('measurement_scheduled', 'measurement_assigned', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('measurement_assigned', 'measurement_in_progress', array['Admin', 'Sales Manager', 'Outdoor Sales']::public.app_role[], false),
  ('measurement_in_progress', 'measurements_submitted', array['Admin', 'Sales Manager', 'Outdoor Sales']::public.app_role[], false),
  ('measurements_submitted', 'measurements_under_review', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('measurements_under_review', 'measurements_need_correction', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('measurements_need_correction', 'measurement_in_progress', array['Admin', 'Sales Manager', 'Outdoor Sales']::public.app_role[], false),
  ('measurements_under_review', 'ready_for_quotation', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('ready_for_quotation', 'quotation_in_progress', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_in_progress', 'quotation_ready', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_ready', 'quotation_presented', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_ready', 'quotation_sent', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_presented', 'quotation_follow_up', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_sent', 'quotation_follow_up', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_follow_up', 'negotiation', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('negotiation', 'quotation_follow_up', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_follow_up', 'quotation_approved', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('negotiation', 'quotation_approved', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('quotation_approved', 'contract_preparation', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('contract_preparation', 'contract_generated', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('contract_generated', 'contract_sent', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('contract_generated', 'contract_signed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('contract_sent', 'contract_signed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('contract_signed', 'transferred_to_operations', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], false),
  ('structure_not_ready', 'client_postponed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('waiting_for_follow_up', 'client_postponed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('quotation_follow_up', 'client_postponed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('negotiation', 'client_postponed', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('structure_not_ready', 'client_not_interested', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('waiting_for_follow_up', 'client_not_interested', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('quotation_follow_up', 'quotation_rejected', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true),
  ('negotiation', 'quotation_rejected', array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[], true)
on conflict (from_status, to_status) do update
set
  allowed_roles = excluded.allowed_roles,
  requires_reason = excluded.requires_reason;

-- Open sales states can be lost; unsigned work can be cancelled. A signed
-- contract can only continue to operations. Terminal transitions require a
-- reason.
insert into public.sales_status_transitions (
  from_status,
  to_status,
  allowed_roles,
  requires_reason
)
select
  status.status_key,
  terminal.to_status,
  array['Admin', 'Sales Manager', 'Indoor Sales']::public.app_role[],
  true
from public.sales_status_definitions status
cross join (values ('lost'), ('cancelled')) terminal(to_status)
where status.is_terminal = false
  and status.status_key <> terminal.to_status
  and (
    (terminal.to_status = 'lost' and status.sort_order <= 180)
    or (terminal.to_status = 'cancelled' and status.sort_order < 280)
  )
on conflict (from_status, to_status) do update
set
  allowed_roles = excluded.allowed_roles,
  requires_reason = true;

-- Retain the former Sales Rep role as a compatibility alias until all
-- installations have completed their employee migration.
update public.sales_status_transitions
set allowed_roles = array_append(allowed_roles, 'Sales Rep'::public.app_role)
where 'Indoor Sales'::public.app_role = any(allowed_roles)
  and not ('Sales Rep'::public.app_role = any(allowed_roles));

-- ---------------------------------------------------------------------------
-- Assignments, appointments, CRM tasks, activities, notifications, and audit
-- ---------------------------------------------------------------------------

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  assignment_type text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint project_assignments_type_check check (
    assignment_type in (
      'current_responsible',
      'measurement',
      'follow_up_support',
      'temporary_support'
    )
  ),
  constraint project_assignments_period_check check (
    ended_at is null or ended_at >= assigned_at
  )
);

create unique index if not exists project_assignments_one_active_type_idx
on public.project_assignments (project_id, assignment_type)
where ended_at is null;

create index if not exists project_assignments_assignee_active_idx
on public.project_assignments (assignee_id, assignment_type, assigned_at desc)
where ended_at is null;

create index if not exists project_assignments_project_history_idx
on public.project_assignments (project_id, assigned_at desc);

create table if not exists public.project_ownership_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  previous_owner_id uuid references public.profiles(id) on delete set null,
  new_owner_id uuid references public.profiles(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_role public.app_role,
  reason text not null,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint project_ownership_history_change_check check (
    previous_owner_id is distinct from new_owner_id
  ),
  constraint project_ownership_history_reason_check check (
    nullif(btrim(reason), '') is not null
  )
);

create index if not exists project_ownership_history_project_timeline_idx
on public.project_ownership_history (project_id, created_at desc);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  appointment_type text not null,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  expected_duration_minutes integer,
  location text,
  notes text,
  status text not null default 'proposed',
  completion_result text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_type_check check (
    appointment_type in (
      'site_measurement',
      'showroom_visit',
      'quotation_presentation',
      'contract_signing',
      'client_meeting',
      'follow_up_call'
    )
  ),
  constraint appointments_status_check check (
    status in (
      'proposed',
      'confirmed',
      'assigned',
      'completed',
      'postponed',
      'cancelled',
      'client_unavailable',
      'no_show'
    )
  ),
  constraint appointments_duration_check check (
    expected_duration_minutes is null or expected_duration_minutes > 0
  )
);

create index if not exists appointments_assignee_schedule_idx
on public.appointments (assigned_employee_id, starts_at)
where status in ('proposed', 'confirmed', 'assigned', 'postponed');

create index if not exists appointments_project_schedule_idx
on public.appointments (project_id, starts_at desc);

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete restrict,
  task_type text not null,
  status text not null default 'open',
  owner_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz not null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  completion_outcome text,
  rescheduled_from_id uuid references public.follow_up_tasks(id) on delete set null,
  deduplication_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_tasks_type_check check (
    task_type in ('structure_readiness', 'quotation')
  ),
  constraint follow_up_tasks_status_check check (
    status in ('open', 'completed', 'cancelled')
  ),
  constraint follow_up_tasks_completion_check check (
    (status = 'open' and completed_at is null)
    or status in ('completed', 'cancelled')
  )
);

create index if not exists follow_up_tasks_assignee_due_idx
on public.follow_up_tasks (assigned_to, due_at)
where status = 'open';

create index if not exists follow_up_tasks_owner_due_idx
on public.follow_up_tasks (owner_id, due_at)
where status = 'open';

create index if not exists follow_up_tasks_project_history_idx
on public.follow_up_tasks (project_id, created_at desc);

create unique index if not exists follow_up_tasks_open_deduplication_idx
on public.follow_up_tasks (deduplication_key)
where status = 'open' and deduplication_key is not null;

create table if not exists public.follow_up_activities (
  id uuid primary key default gen_random_uuid(),
  follow_up_task_id uuid references public.follow_up_tasks(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  employee_id uuid references public.profiles(id) on delete set null,
  employee_role public.app_role,
  performed_at timestamptz not null default now(),
  method text not null,
  client_response text,
  internal_notes text,
  outcome text,
  previous_status text,
  new_status text,
  next_follow_up_at timestamptz,
  appointment_id uuid references public.appointments(id) on delete set null,
  client_answered boolean,
  task_completed boolean not null default false,
  correction_of_id uuid references public.follow_up_activities(id) on delete restrict,
  attachment_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint follow_up_activities_method_check check (
    method in (
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
    )
  )
);

create index if not exists follow_up_activities_project_timeline_idx
on public.follow_up_activities (project_id, performed_at desc);

create index if not exists follow_up_activities_task_timeline_idx
on public.follow_up_activities (follow_up_task_id, performed_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_kind text not null default 'information',
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  title_key text not null,
  message_key text not null,
  link_path text,
  payload jsonb not null default '{}'::jsonb,
  deduplication_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_kind_check check (
    notification_kind in ('information', 'action_required', 'overdue')
  ),
  constraint notifications_link_check check (
    link_path is null or left(link_path, 1) = '/'
  )
);

create index if not exists notifications_recipient_unread_idx
on public.notifications (recipient_id, created_at desc)
where read_at is null;

create unique index if not exists notifications_recipient_deduplication_idx
on public.notifications (recipient_id, deduplication_key)
where deduplication_key is not null;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_timeline_idx
on public.audit_events (entity_type, entity_id, created_at desc);

create index if not exists audit_events_actor_timeline_idx
on public.audit_events (actor_id, created_at desc);

create table if not exists public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  previous_status text,
  new_status text not null references public.sales_status_definitions(status_key),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_role public.app_role,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists project_status_history_project_timeline_idx
on public.project_status_history (project_id, created_at desc);

create table if not exists public.workflow_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workflow_settings (setting_key, setting_value, description)
values
  (
    'quotation_follow_up_interval_days',
    '5'::jsonb,
    'Default calendar-day interval after a quotation is shared.'
  ),
  (
    'business_timezone',
    '"Asia/Baghdad"'::jsonb,
    'Timezone used for sales appointments, reminders, and overdue tasks.'
  )
on conflict (setting_key) do nothing;

-- ---------------------------------------------------------------------------
-- Attribution protection and centralized transition service
-- ---------------------------------------------------------------------------

create or replace function public.initialize_project_sales_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  creator_role public.app_role;
begin
  new.original_creator_id := coalesce(
    new.original_creator_id,
    new.created_by,
    new.sales_engineer_id
  );

  if new.original_creator_id is not null then
    select role
    into creator_role
    from public.profiles
    where id = new.original_creator_id;
  end if;

  new.original_creator_role := coalesce(
    new.original_creator_role,
    creator_role
  );
  new.owner_id := coalesce(
    new.owner_id,
    new.sales_engineer_id,
    new.created_by
  );
  new.responsible_user_id := coalesce(
    new.responsible_user_id,
    new.owner_id
  );

  if new.original_source = 'legacy' then
    new.original_source := case creator_role
      when 'Outdoor Sales' then 'outdoor_sales'
      when 'Indoor Sales' then 'showroom_walk_in'
      else new.original_source
    end;
  end if;

  if new.responsible_department = 'unassigned' then
    new.responsible_department := case creator_role
      when 'Outdoor Sales' then 'outdoor_sales'
      when 'Indoor Sales' then 'indoor_sales'
      when 'Sales Manager' then 'sales_management'
      else new.responsible_department
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_initialize_sales_attribution
on public.projects;

create trigger projects_initialize_sales_attribution
before insert on public.projects
for each row
execute function public.initialize_project_sales_attribution();

create or replace function public.protect_project_original_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.created_by is distinct from new.created_by
    or old.original_creator_id is distinct from new.original_creator_id
    or old.original_creator_role is distinct from new.original_creator_role
    or old.original_source is distinct from new.original_source
  then
    raise exception 'Original project attribution cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_protect_original_attribution
on public.projects;

create trigger projects_protect_original_attribution
before update on public.projects
for each row
execute function public.protect_project_original_attribution();

drop trigger if exists appointments_set_updated_at
on public.appointments;
create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists follow_up_tasks_set_updated_at
on public.follow_up_tasks;
create trigger follow_up_tasks_set_updated_at
before update on public.follow_up_tasks
for each row execute function public.set_updated_at();

drop trigger if exists workflow_settings_set_updated_at
on public.workflow_settings;
create trigger workflow_settings_set_updated_at
before update on public.workflow_settings
for each row execute function public.set_updated_at();

insert into public.project_status_history (
  project_id,
  previous_status,
  new_status,
  changed_by,
  changed_by_role,
  reason
)
select
  project.id,
  null,
  project.sales_status,
  project.original_creator_id,
  project.original_creator_role,
  'Initial status recorded during sales CRM foundation migration.'
from public.projects project
where not exists (
  select 1
  from public.project_status_history history
  where history.project_id = project.id
);

insert into public.project_ownership_history (
  project_id,
  previous_owner_id,
  new_owner_id,
  changed_by,
  changed_by_role,
  reason
)
select
  project.id,
  null,
  project.owner_id,
  project.original_creator_id,
  project.original_creator_role,
  'Initial ownership recorded during sales CRM foundation migration.'
from public.projects project
where project.owner_id is not null
  and not exists (
    select 1
    from public.project_ownership_history history
    where history.project_id = project.id
  );

create or replace function public.can_view_sales_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.archived_at is null
      and public.is_active_user()
      and (
        public.current_user_role() in (
          'Admin',
          'Sales Manager',
          'Branch Manager',
          'Indoor Sales'
        )
        or project.created_by = auth.uid()
        or project.original_creator_id = auth.uid()
        or project.owner_id = auth.uid()
        or project.responsible_user_id = auth.uid()
        or exists (
          select 1
          from public.project_assignments assignment
          where assignment.project_id = project.id
            and assignment.assignee_id = auth.uid()
            and assignment.ended_at is null
        )
      )
  )
$$;

create or replace function public.can_manage_sales_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.archived_at is null
      and public.is_active_user()
      and (
        public.current_user_role() in ('Admin', 'Sales Manager')
        or project.owner_id = auth.uid()
        or project.responsible_user_id = auth.uid()
        or (
          public.current_user_role() = 'Outdoor Sales'
          and (
            project.original_creator_id = auth.uid()
            or exists (
              select 1
              from public.project_assignments assignment
              where assignment.project_id = project.id
                and assignment.assignee_id = auth.uid()
                and assignment.ended_at is null
            )
          )
        )
      )
  )
$$;

create or replace function public.reassign_sales_project_owner(
  target_project_id uuid,
  target_owner_id uuid,
  actor_user_id uuid default auth.uid(),
  change_reason text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects;
  actor_profile public.profiles;
  owner_profile public.profiles;
  change_correlation_id uuid := gen_random_uuid();
  target_department text;
begin
  if actor_user_id is null or target_owner_id is null then
    raise exception 'An actor and a new owner are required.';
  end if;

  if nullif(btrim(coalesce(change_reason, '')), '') is null then
    raise exception 'A reason is required to change project ownership.';
  end if;

  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in ('Admin', 'Sales Manager')
  then
    raise exception 'Only an active administrator or sales manager can change ownership.';
  end if;

  select *
  into owner_profile
  from public.profiles
  where id = target_owner_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive'
    and role in ('Sales Manager', 'Indoor Sales', 'Outdoor Sales', 'Sales Rep');

  if owner_profile.id is null then
    raise exception 'The new owner must be an active sales employee.';
  end if;

  select *
  into project_row
  from public.projects
  where id = target_project_id
  for update;

  if project_row.id is null then
    raise exception 'Project was not found.';
  end if;

  if project_row.archived_at is not null then
    raise exception 'Archived projects cannot be reassigned.';
  end if;

  if project_row.owner_id is not distinct from target_owner_id then
    raise exception 'The selected employee already owns this project.';
  end if;

  target_department := case owner_profile.role
    when 'Outdoor Sales' then 'outdoor_sales'
    when 'Sales Manager' then 'sales_management'
    else 'indoor_sales'
  end;

  update public.project_assignments
  set
    ended_at = now(),
    ended_by = actor_profile.id
  where project_id = project_row.id
    and assignment_type = 'current_responsible'
    and ended_at is null;

  insert into public.project_assignments (
    project_id,
    assignment_type,
    assignee_id,
    assigned_by,
    reason
  )
  values (
    project_row.id,
    'current_responsible',
    target_owner_id,
    actor_profile.id,
    nullif(btrim(change_reason), '')
  );

  insert into public.project_ownership_history (
    project_id,
    previous_owner_id,
    new_owner_id,
    changed_by,
    changed_by_role,
    reason,
    correlation_id
  )
  values (
    project_row.id,
    project_row.owner_id,
    target_owner_id,
    actor_profile.id,
    actor_profile.role,
    nullif(btrim(change_reason), ''),
    change_correlation_id
  );

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
    'project_owner_changed',
    'project',
    project_row.id,
    jsonb_build_object('owner_id', project_row.owner_id),
    jsonb_build_object('owner_id', target_owner_id),
    nullif(btrim(change_reason), ''),
    change_correlation_id
  );

  update public.projects
  set
    owner_id = target_owner_id,
    responsible_user_id = target_owner_id,
    responsible_department = target_department,
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = project_row.id
  returning * into project_row;

  return project_row;
end;
$$;

create or replace function public.transition_project_sales_status(
  target_project_id uuid,
  target_status text,
  actor_user_id uuid default auth.uid(),
  transition_reason text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects;
  actor_profile public.profiles;
  transition_row public.sales_status_transitions;
  transition_correlation_id uuid := gen_random_uuid();
begin
  if actor_user_id is null then
    raise exception 'An actor is required.';
  end if;

  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select *
  into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null then
    raise exception 'The actor is not an active employee.';
  end if;

  select *
  into project_row
  from public.projects
  where id = target_project_id
  for update;

  if project_row.id is null then
    raise exception 'Project was not found.';
  end if;

  if project_row.archived_at is not null then
    raise exception 'Archived projects cannot change status.';
  end if;

  select *
  into transition_row
  from public.sales_status_transitions
  where from_status = project_row.sales_status
    and to_status = target_status;

  if transition_row.from_status is null then
    raise exception 'Invalid project status transition: % -> %.',
      project_row.sales_status,
      target_status;
  end if;

  if not (actor_profile.role = any(transition_row.allowed_roles)) then
    raise exception 'The employee role cannot perform this transition.';
  end if;

  if transition_row.requires_reason
    and nullif(btrim(coalesce(transition_reason, '')), '') is null
  then
    raise exception 'A reason is required for this transition.';
  end if;

  if actor_profile.role not in ('Admin', 'Sales Manager')
    and actor_profile.id is distinct from project_row.owner_id
    and actor_profile.id is distinct from project_row.responsible_user_id
    and actor_profile.id is distinct from project_row.original_creator_id
    and not exists (
      select 1
      from public.project_assignments assignment
      where assignment.project_id = project_row.id
        and assignment.assignee_id = actor_profile.id
        and assignment.ended_at is null
    )
  then
    raise exception 'The employee is not assigned to this project.';
  end if;

  update public.projects
  set
    sales_status = target_status,
    last_updated_by = actor_profile.id,
    updated_at = now()
  where id = project_row.id
  returning * into project_row;

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
    transition_row.from_status,
    target_status,
    actor_profile.id,
    actor_profile.role,
    nullif(btrim(coalesce(transition_reason, '')), ''),
    transition_correlation_id
  );

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
    'project_status_changed',
    'project',
    project_row.id,
    jsonb_build_object('sales_status', transition_row.from_status),
    jsonb_build_object('sales_status', target_status),
    nullif(btrim(coalesce(transition_reason, '')), ''),
    transition_correlation_id
  );

  return project_row;
end;
$$;

revoke all on function public.transition_project_sales_status(uuid, text, uuid, text)
from public;

grant execute on function public.transition_project_sales_status(uuid, text, uuid, text)
to authenticated, service_role;

revoke all on function public.reassign_sales_project_owner(uuid, uuid, uuid, text)
from public;

grant execute on function public.reassign_sales_project_owner(uuid, uuid, uuid, text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: new records are readable only through project/recipient access and are
-- append-only for normal users. Mutations are performed by authenticated,
-- permission-checked server routes or narrowly scoped RPCs.
-- ---------------------------------------------------------------------------

alter table public.sales_status_definitions enable row level security;
alter table public.sales_status_transitions enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_ownership_history enable row level security;
alter table public.appointments enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.follow_up_activities enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;
alter table public.project_status_history enable row level security;
alter table public.workflow_settings enable row level security;

drop policy if exists "sales_status_definitions_read_active"
on public.sales_status_definitions;
create policy "sales_status_definitions_read_active"
on public.sales_status_definitions
for select
to authenticated
using (public.is_active_user());

drop policy if exists "sales_status_transitions_read_active"
on public.sales_status_transitions;
create policy "sales_status_transitions_read_active"
on public.sales_status_transitions
for select
to authenticated
using (public.is_active_user());

drop policy if exists "project_assignments_read_project"
on public.project_assignments;
create policy "project_assignments_read_project"
on public.project_assignments
for select
to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "project_ownership_history_read_project"
on public.project_ownership_history;
create policy "project_ownership_history_read_project"
on public.project_ownership_history
for select
to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "appointments_read_project"
on public.appointments;
create policy "appointments_read_project"
on public.appointments
for select
to authenticated
using (
  assigned_employee_id = auth.uid()
  or public.can_view_sales_project(project_id)
);

drop policy if exists "follow_up_tasks_read_project"
on public.follow_up_tasks;
create policy "follow_up_tasks_read_project"
on public.follow_up_tasks
for select
to authenticated
using (
  owner_id = auth.uid()
  or assigned_to = auth.uid()
  or public.can_view_sales_project(project_id)
);

drop policy if exists "follow_up_activities_read_project"
on public.follow_up_activities;
create policy "follow_up_activities_read_project"
on public.follow_up_activities
for select
to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "notifications_read_own"
on public.notifications;
create policy "notifications_read_own"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "notifications_update_read_own"
on public.notifications;
create policy "notifications_update_read_own"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists "audit_events_read_management"
on public.audit_events;
create policy "audit_events_read_management"
on public.audit_events
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Sales Manager'));

drop policy if exists "project_status_history_read_project"
on public.project_status_history;
create policy "project_status_history_read_project"
on public.project_status_history
for select
to authenticated
using (public.can_view_sales_project(project_id));

drop policy if exists "workflow_settings_read_active"
on public.workflow_settings;
create policy "workflow_settings_read_active"
on public.workflow_settings
for select
to authenticated
using (public.is_active_user());

drop policy if exists "workflow_settings_admin_write"
on public.workflow_settings;
create policy "workflow_settings_admin_write"
on public.workflow_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.sales_status_definitions to authenticated;
grant select on public.sales_status_transitions to authenticated;
grant select on public.project_assignments to authenticated;
grant select on public.project_ownership_history to authenticated;
grant select on public.appointments to authenticated;
grant select on public.follow_up_tasks to authenticated;
grant select on public.follow_up_activities to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.audit_events to authenticated;
grant select on public.project_status_history to authenticated;
grant select, insert, update on public.workflow_settings to authenticated;

grant all on public.sales_status_definitions to service_role;
grant all on public.sales_status_transitions to service_role;
grant all on public.project_assignments to service_role;
grant all on public.project_ownership_history to service_role;
grant all on public.appointments to service_role;
grant all on public.follow_up_tasks to service_role;
grant all on public.follow_up_activities to service_role;
grant all on public.notifications to service_role;
grant all on public.audit_events to service_role;
grant all on public.project_status_history to service_role;
grant all on public.workflow_settings to service_role;

create index if not exists projects_owner_created_idx
on public.projects (owner_id, created_at desc);

create index if not exists projects_responsible_created_idx
on public.projects (responsible_user_id, created_at desc);

create index if not exists projects_original_creator_created_idx
on public.projects (original_creator_id, created_at desc);

create index if not exists projects_sales_status_created_idx
on public.projects (sales_status, created_at desc);

create index if not exists projects_structure_readiness_follow_up_idx
on public.projects (structure_readiness, next_follow_up_at);

create index if not exists projects_active_created_idx
on public.projects (created_at desc)
where archived_at is null;
