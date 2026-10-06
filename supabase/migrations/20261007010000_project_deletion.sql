-- Keep deleted IDs as tombstones so an offline registration replay cannot
-- recreate a project after its receipts and other workflow records are removed.
create table if not exists public.deleted_project_ids (
 project_id uuid primary key,
 deleted_at timestamptz not null default now()
);
alter table public.deleted_project_ids enable row level security;
revoke all on public.deleted_project_ids from public,anon,authenticated;
grant all on public.deleted_project_ids to service_role;

create table if not exists public.project_file_cleanup (
 project_id uuid not null,
 path text not null,
 primary key(project_id,path)
);
alter table public.project_file_cleanup enable row level security;
revoke all on public.project_file_cleanup from public,anon,authenticated;
grant all on public.project_file_cleanup to service_role;

create or replace function public.prevent_deleted_project_recreation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,17));
 if exists(select 1 from deleted_project_ids where project_id=new.id) then
  raise exception 'This project was deleted. Its saved offline work cannot be synced.';
 end if;
 return new;
end;
$$;
drop trigger if exists prevent_deleted_project_recreation on public.projects;
create trigger prevent_deleted_project_recreation before insert on public.projects
for each row execute function public.prevent_deleted_project_recreation();
revoke all on function public.prevent_deleted_project_recreation() from public,anon,authenticated;

-- Allow an active Admin to delete one or more projects atomically.
--
-- Project workflow tables intentionally use restrictive foreign keys so that
-- accidental direct deletes fail. This function preserves those constraints
-- and removes the dependent records in a controlled order.

create or replace function public.delete_projects_as_admin(
  target_project_ids uuid[],
  actor_user_id uuid
)
returns table (deleted_project_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_project_ids uuid[];
  actor_role_value public.app_role;
  requested_project_count integer;
  existing_project_count integer;
  deletion_correlation_id uuid := gen_random_uuid();
begin
  select array_agg(distinct project_id)
  into normalized_project_ids
  from unnest(target_project_ids) as requested_projects(project_id)
  where project_id is not null;

  requested_project_count := coalesce(cardinality(normalized_project_ids), 0);

  if requested_project_count = 0 then
    raise exception 'At least one project id is required.';
  end if;

  select profile.role
  into actor_role_value
  from public.profiles as profile
  where profile.id = actor_user_id
    and profile.is_active = true
    and coalesce(profile.status, 'Active') <> 'Inactive';

  if actor_role_value is distinct from 'Admin'::public.app_role then
    raise exception 'Only an active Admin can delete projects.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(project_id::text,17))
  from unnest(normalized_project_ids) as ids(project_id) order by project_id;

  perform 1
  from public.projects
  where id = any(normalized_project_ids)
  for update;

  select count(*)
  into existing_project_count
  from public.projects
  where id = any(normalized_project_ids);

  if existing_project_count <> requested_project_count then
    raise exception 'One or more projects were not found.';
  end if;

  insert into public.audit_events (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    previous_value,
    reason,
    correlation_id
  )
  select
    actor_user_id,
    actor_role_value,
    'project_deleted',
    'project',
    project.id,
    to_jsonb(project),
    'Deleted by Admin',
    deletion_correlation_id
  from public.projects as project
  where project.id = any(normalized_project_ids);

  insert into public.deleted_project_ids(project_id)
  select unnest(normalized_project_ids) on conflict do nothing;

  insert into public.project_file_cleanup(project_id,path)
  select project_id,evidence->>'path' from public.sales_workflows
  where project_id=any(normalized_project_ids)
    and evidence->>'method'='upload' and evidence->>'path' is not null
  on conflict do nothing;

  delete from public.field_sync_receipts where project_id=any(normalized_project_ids);
  delete from public.sales_workflows where project_id=any(normalized_project_ids);

  delete from public.operations_handoffs
  where project_id = any(normalized_project_ids);

  delete from public.contracts
  where project_id = any(normalized_project_ids);

  update public.quotations
  set current_version_id = null
  where project_id = any(normalized_project_ids);

  delete from public.quotation_version_items
  where quotation_version_id in (
    select version.id
    from public.quotation_versions as version
    join public.quotations as quotation
      on quotation.id = version.quotation_id
    where quotation.project_id = any(normalized_project_ids)
  );

  delete from public.quotation_versions
  where quotation_id in (
    select quotation.id
    from public.quotations as quotation
    where quotation.project_id = any(normalized_project_ids)
  );

  delete from public.notifications
  where entity_type = 'follow_up_task'
    and entity_id in (
      select task.id
      from public.follow_up_tasks as task
      where task.project_id = any(normalized_project_ids)
    );

  update public.follow_up_activities
  set correction_of_id = null
  where project_id = any(normalized_project_ids);

  delete from public.follow_up_activities
  where project_id = any(normalized_project_ids);

  delete from public.follow_up_tasks
  where project_id = any(normalized_project_ids);

  delete from public.openings
  where project_id = any(normalized_project_ids);

  delete from public.measurement_submissions
  where measurement_request_id in (
    select request.id
    from public.measurement_requests as request
    where request.project_id = any(normalized_project_ids)
  );

  delete from public.measurement_visits
  where measurement_request_id in (
    select request.id
    from public.measurement_requests as request
    where request.project_id = any(normalized_project_ids)
  );

  delete from public.measurement_requests
  where project_id = any(normalized_project_ids);

  delete from public.appointments
  where project_id = any(normalized_project_ids);

  delete from public.client_contacts
  where project_id = any(normalized_project_ids);

  delete from public.project_assignments
  where project_id = any(normalized_project_ids);

  delete from public.project_ownership_history
  where project_id = any(normalized_project_ids);

  delete from public.project_status_history
  where project_id = any(normalized_project_ids);

  delete from public.quotations
  where project_id = any(normalized_project_ids);

  delete from public.notifications
  where entity_type = 'project'
    and entity_id = any(normalized_project_ids);

  return query
  delete from public.projects as project
  where project.id = any(normalized_project_ids)
  returning project.id;
end;
$$;

revoke all on function public.delete_projects_as_admin(uuid[], uuid)
from public;

revoke all on function public.delete_projects_as_admin(uuid[], uuid)
from authenticated;

grant execute on function public.delete_projects_as_admin(uuid[], uuid)
to service_role;

notify pgrst, 'reload schema';

create or replace function public.lock_quoted_openings() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid; current_status text;
begin
 target=case when TG_OP='DELETE' then OLD.project_id else NEW.project_id end;
 -- Only the Admin deletion transaction can create this private tombstone.
 if TG_OP='DELETE' and exists(select 1 from deleted_project_ids where project_id=target) then return OLD; end if;
 select sales_status into current_status from projects where id=target for update;
 if current_status <> 'new_lead' then raise exception 'Reopen initial measurements before editing openings'; end if;
 if exists(select 1 from sales_workflows where project_id=target) or (TG_OP='UPDATE' and exists(select 1 from sales_workflows where project_id=OLD.project_id)) then raise exception 'Measurements are locked after quotation creation'; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
