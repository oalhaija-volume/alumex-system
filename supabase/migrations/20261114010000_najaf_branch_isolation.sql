begin;

-- Employee offices and project routing are distinct: Governorates remains
-- Karkh work, while Najaf is an independent office. Never relabel old projects.
alter table public.profiles drop constraint if exists profiles_outdoor_both_branches_check;
alter table public.profiles drop constraint if exists profiles_branch_check;
alter table public.profiles add constraint profiles_branch_check
  check (branch is null or branch in ('Karkh','Rasafa','Najaf'));
alter table public.projects drop constraint if exists projects_branch_check;
alter table public.projects add constraint projects_branch_check
  check (branch is null or branch in ('Karkh','Rasafa','Najaf','Governorates'));

create or replace function public.protect_employee_branch()
returns trigger language plpgsql set search_path=public as $$
begin
  if (tg_op='INSERT' and new.branch is not null)
    or (tg_op='UPDATE' and new.branch is distinct from old.branch) then
    if coalesce(auth.role(),'') in ('anon','authenticated')
      and not coalesce(public.is_active_user() and public.current_user_role()::text='Admin',false) then
      raise exception using errcode='42501',message='Only Admin can assign employee branches.';
    end if;
  end if;
  return new;
end;
$$;

-- These four employees already have an explicit administrative assignment.
-- Other unassigned employees remain unassigned and cannot read project data.
update public.profiles set branch=outdoor_rotation_start_branch
where role::text='Outdoor Sales' and branch is null
  and outdoor_rotation_start_branch in ('Karkh','Rasafa');

create or replace function public.project_branch_matches_employee(employee_branch text,project_branch text)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(employee_branch in ('Karkh','Rasafa','Najaf')
    and (project_branch=employee_branch or (employee_branch='Karkh' and project_branch='Governorates')),false);
$$;

create or replace function public.has_global_project_access()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid()
    and is_active and status='Active' and role::text in ('Admin','Sales Director','Company Owner'));
$$;

create or replace function public.current_employee_branch()
returns text language sql stable security definer set search_path=public as $$
  select branch from public.profiles where id=auth.uid() and is_active and status='Active'
    and branch in ('Karkh','Rasafa','Najaf');
$$;

create or replace function public.employee_can_access_project_branch(actor_user_id uuid,project_branch text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or public.project_branch_matches_employee(employee.branch,project_branch)));
$$;

-- Preserve the old helper signatures: existing policies and every installed
-- current/legacy project RPC already call them. Scope every non-global role.
create or replace function public.current_indoor_sales_branch()
returns text language sql stable security definer set search_path=public as $$
  select branch from public.profiles where id=auth.uid() and role::text='Indoor Sales'
    and is_active and status='Active' and branch in ('Karkh','Rasafa','Najaf');
$$;

create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access() or exists(
    select 1 from public.projects project where project.id=target_project_id
      and public.project_branch_matches_employee(public.current_employee_branch(),project.branch));
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access()
    or (public.current_employee_branch() is not null and (
      exists(select 1 from public.projects project where project.client_id=target_client_id
        and public.project_branch_matches_employee(public.current_employee_branch(),project.branch))
      or exists(select 1 from public.clients customer where customer.id=target_client_id
        and customer.created_by=auth.uid()
        and not exists(select 1 from public.projects project where project.client_id=customer.id))));
$$;

create or replace function public.require_indoor_project_branch(target_project_id uuid,actor_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles; registered_branch text;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or actor_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id=actor_user_id for share;
  select branch into registered_branch from public.projects where id=target_project_id for update;
  if not found or actor.id is null or actor.is_active is not true or actor.status is distinct from 'Active'
    or (actor.role::text not in ('Admin','Sales Director','Company Owner')
      and not public.project_branch_matches_employee(actor.branch,registered_branch)) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
end;
$$;

-- Monthly rotation no longer grants access to another office. Keep the pure
-- historical calendar helper, but authorize new work from the employee office.
create or replace function public.require_outdoor_project_creation_branch(actor_user_id uuid,selected_branch text)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or actor_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id=actor_user_id for share;
  if actor.role::text is distinct from 'Outdoor Sales' then return; end if;
  if actor.is_active is not true or actor.status is distinct from 'Active'
    or not public.project_branch_matches_employee(actor.branch,selected_branch) then
    raise exception using errcode='42501',message='You can only create projects for your assigned branch.';
  end if;
end;
$$;

create or replace function public.assign_indoor_project_branch()
returns trigger language plpgsql security definer set search_path=public as $$
declare creator public.profiles;
begin
  if tg_op='UPDATE' then
    if row(new.branch,new.governorate) is distinct from row(old.branch,old.governorate) then
      raise exception using errcode='42501',message='The originating project branch cannot be changed.';
    end if;
    return new;
  end if;
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or new.created_by is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into creator from public.profiles where id=new.created_by for share;
  if creator.id is null or creator.is_active is not true or creator.status is distinct from 'Active' then
    raise exception using errcode='42501',message='An active employee is required to create a project.';
  end if;
  if creator.role::text not in ('Admin','Sales Director','Company Owner') then
    if creator.branch is null or creator.branch not in ('Karkh','Rasafa','Najaf') then
      raise exception using errcode='22023',message='Ask Admin to assign your branch before creating a project.';
    end if;
    if new.branch is null then new.branch:=creator.branch; end if;
    if not public.project_branch_matches_employee(creator.branch,new.branch) then
      raise exception using errcode='42501',message='You can only create projects for your assigned branch.';
    end if;
  elsif new.branch is null or new.branch not in ('Karkh','Rasafa','Najaf','Governorates') then
    raise exception using errcode='22023',message='Choose the project branch: Karkh, Rasafa, Najaf or Governorates.';
  end if;
  if new.branch<>'Governorates' then new.governorate:=null; end if;
  if public.sales_permission_role(creator.role)='Indoor Sales' then new.original_creator_role:=creator.role; end if;
  return new;
end;
$$;

-- Validate HR scope before the original employee update, retaining its role,
-- last-admin, self-edit, username and optimistic-concurrency protections.
do $employee_management$
declare definition text;
  marker text := 'if not actor_is_admin and (employee.role::text in (''Admin'',''Company Owner'')';
  guarded text := 'if not actor_is_admin and (employee.role::text in (''Admin'',''Sales Director'',''Company Owner'')';
  scope text := $scope$if not actor_is_admin and (actor.branch is null
    or actor.branch not in ('Karkh','Rasafa','Najaf') or employee.branch is distinct from actor.branch) then
    raise exception using errcode='42501',message='Employee not found.';
  end if;
  $scope$;
begin
  select pg_get_functiondef('public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean)'::regprocedure) into definition;
  if position(guarded in definition)>0 and position(scope in definition)>0 then return; end if;
  if position(marker in definition)=0 or position('p_role in (''Admin'',''Company Owner'')' in definition)=0 then
    raise exception 'Unexpected employee update definition; branch isolation was not applied.';
  end if;
  definition:=replace(definition,marker,scope||guarded);
  definition:=replace(definition,'p_role in (''Admin'',''Company Owner'')','p_role in (''Admin'',''Sales Director'',''Company Owner'')');
  execute definition;
end;
$employee_management$;

create or replace function public.update_employee_profile_with_branch(
  p_actor uuid,p_employee uuid,p_expected_updated_at timestamptz,
  p_full_name text,p_username text,p_role text,p_is_active boolean,p_branch text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; employee_branch text; actor public.profiles;
begin
  perform pg_advisory_xact_lock(hashtextextended('alumex-employee-management',0));
  select * into actor from public.profiles where id=p_actor for share;
  select branch into employee_branch from public.profiles where id=p_employee for update;
  if p_branch is not null and p_branch not in ('Karkh','Rasafa','Najaf') then
    raise exception using errcode='22023',message='Choose Karkh, Rasafa or Najaf.';
  end if;
  if p_role not in ('Admin','Sales Director','Company Owner') and p_branch is null then
    raise exception using errcode='22023',message='Choose a branch for this employee.';
  end if;
  if p_branch is distinct from employee_branch and actor.role::text is distinct from 'Admin' then
    raise exception using errcode='42501',message='Only Admin can assign employee branches.';
  end if;
  result:=public.update_employee_profile(p_actor,p_employee,p_expected_updated_at,p_full_name,p_username,p_role,p_is_active);
  update public.profiles set branch=p_branch where id=p_employee;
  return result||jsonb_build_object('branch',p_branch);
exception when serialization_failure then
  raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create or replace function public.outdoor_sales_team_member_ids(actor_user_id uuid)
returns setof uuid language sql stable security definer set search_path=public as $$
  select member.id from public.profiles actor join public.profiles member
    on member.id=actor.id or (actor.outdoor_team_key is not null and member.outdoor_team_key=actor.outdoor_team_key)
  where actor.id=actor_user_id and actor.role='Outdoor Sales' and actor.is_active and actor.status='Active'
    and actor.branch in ('Karkh','Rasafa','Najaf') and member.branch=actor.branch
    and member.role='Outdoor Sales' and member.is_active and member.status='Active';
$$;

create or replace function public.can_view_outdoor_team_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_access_indoor_project_branch(target_project_id) and exists(
    select 1 from public.projects project where project.id=target_project_id and project.archived_at is null
      and public.is_outdoor_assignment_member(auth.uid(),project.assigned_outdoor_sales_id));
$$;

-- Keep field transaction replay, validation, numbering and audit logic intact.
-- In particular the branch guard must run before any saved receipt is returned.
do $registration$
declare definition text;
  old_branch text := 'case when actor_role=''Outdoor Sales'' then p_payload#>>''{project,branch}'' else null end';
  new_branch text := 'nullif(p_payload#>>''{project,branch}'','''')';
  old_validation text := 'p_payload#>>''{project,branch}'' not in (''Karkh'',''Rasafa'',''Governorates'')';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position('require_indoor_project_branch' in definition)=0
    or position('require_indoor_project_branch' in definition)>position('return saved.result;' in definition)
    or position('require_outdoor_project_creation_branch' in definition)=0 then
    raise exception 'Installed field sync is missing a pre-replay branch guard.';
  end if;
  if position(new_branch in definition)>0 and position('''Karkh'',''Rasafa'',''Najaf'',''Governorates''' in definition)>0 then return; end if;
  if position(old_branch in definition)=0 or position(old_validation in definition)=0 then
    raise exception 'Unexpected field registration definition; Najaf routing was not applied.';
  end if;
  definition:=replace(definition,old_branch,new_branch);
  definition:=replace(definition,old_validation,'p_payload#>>''{project,branch}'' not in (''Karkh'',''Rasafa'',''Najaf'',''Governorates'')');
  definition:=replace(definition,'case when actor_role=''Outdoor Sales'' and p_payload#>>''{project,branch}''=''Governorates'' then p_payload#>>''{project,governorate}'' else null end',
    'case when p_payload#>>''{project,branch}''=''Governorates'' then p_payload#>>''{project,governorate}'' else null end');
  definition:=replace(definition,'Choose the project branch: Karkh, Rasafa or Governorates.','Choose the project branch: Karkh, Rasafa, Najaf or Governorates.');
  execute definition;
end;
$registration$;

-- Actor-independent assignment checks also protect service-role RPC writes.
-- Existing stale assignments stay unchanged; every new or changed owner must
-- belong to the project's branch (or be one of the three global roles).
create or replace function public.require_project_employee_branch()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_row jsonb:=to_jsonb(new); previous_row jsonb; column_name text; employee_id uuid; project_branch text;
begin
  if tg_op='UPDATE' then previous_row:=to_jsonb(old); end if;
  if tg_table_name='projects' then project_branch:=new.branch;
  else select branch into project_branch from public.projects where id=(current_row->>'project_id')::uuid; end if;
  foreach column_name in array tg_argv loop
    if tg_op='UPDATE' and current_row->column_name is not distinct from previous_row->column_name then continue; end if;
    employee_id:=nullif(current_row->>column_name,'')::uuid;
    if employee_id is null then continue; end if;
    perform 1 from public.profiles where id=employee_id for share;
    if not public.employee_can_access_project_branch(employee_id,project_branch) then
      raise exception using errcode='42501',message='Choose an active employee from the project branch.';
    end if;
  end loop;
  return new;
end;
$$;
create or replace trigger projects_require_employee_branch
before insert or update of owner_id,responsible_user_id,assigned_outdoor_sales_id,follow_up_owner_id,
  sales_engineer_id,operations_manager_id,project_manager_id,project_engineer_id,site_engineer_id on public.projects
for each row execute function public.require_project_employee_branch('owner_id','responsible_user_id','assigned_outdoor_sales_id','follow_up_owner_id','sales_engineer_id','operations_manager_id','project_manager_id','project_engineer_id','site_engineer_id');
create or replace trigger project_assignments_require_employee_branch
before insert or update of assignee_id on public.project_assignments
for each row execute function public.require_project_employee_branch('assignee_id');
create or replace trigger measurement_requests_require_employee_branch
before insert or update of assigned_to,return_to_user_id on public.measurement_requests
for each row execute function public.require_project_employee_branch('assigned_to','return_to_user_id');
create or replace trigger follow_up_tasks_require_employee_branch
before insert or update of owner_id,assigned_to on public.follow_up_tasks
for each row execute function public.require_project_employee_branch('owner_id','assigned_to');
create or replace trigger appointments_require_employee_branch
before insert or update of assigned_employee_id on public.appointments
for each row execute function public.require_project_employee_branch('assigned_employee_id');

create or replace function public.sales_notification_recipients(target_project uuid)
returns setof uuid language sql stable security definer set search_path=public as $$
  with project as(select * from public.projects where id=target_project),eligible as(
    select employee.id from public.profiles employee cross join project
    where employee.is_active and employee.status='Active' and employee.role::text in ('Indoor Sales','Sales Manager')
      and public.project_branch_matches_employee(employee.branch,project.branch)
  ) select employee.id from eligible employee cross join project
    where employee.id=project.follow_up_owner_id
      or not exists(select 1 from eligible owner where owner.id=project.follow_up_owner_id);
$$;

do $notification_guards$
declare definition text;
  old_guard text := '(employee.role::text <> ''Indoor Sales'' or (employee.branch in (''Karkh'',''Rasafa'') and (p.branch=employee.branch or (p.branch=''Governorates'' and employee.branch=''Karkh''))))';
  new_guard text := 'public.employee_can_access_project_branch(employee.id,p.branch)';
  outdoor_guard text := 'and u.role::text = ''Outdoor Sales'' and u.is_active and u.status = ''Active''';
begin
  select pg_get_functiondef('public.deliver_due_follow_up_notifications()'::regprocedure) into definition;
  if position(new_guard in definition)=0 then
    if cardinality(string_to_array(definition,old_guard))<>3 then
      raise exception 'Unexpected due reminder definition; branch isolation was not applied.';
    end if;
    execute replace(definition,old_guard,new_guard);
  end if;
  select pg_get_functiondef('public.notify_sales_field_change()'::regprocedure) into definition;
  if position('public.employee_can_access_project_branch(u.id,project.branch)' in definition)=0 then
    if position(outdoor_guard in definition)=0 then raise exception 'Unexpected measurement notification definition.'; end if;
    execute replace(definition,outdoor_guard,outdoor_guard||E'\n      and public.employee_can_access_project_branch(u.id,project.branch)');
  end if;
end;
$notification_guards$;

-- Existing entity resolution handles indirect documents and event payloads.
do $entity_guard$
declare definition text;
begin
  select pg_get_functiondef('public.can_access_indoor_entity_branch(text,uuid)'::regprocedure) into definition;
  if position('if public.has_global_project_access() then return true;' in definition)>0 then return; end if;
  if position('if not public.is_indoor_sales_user() then return true;' in definition)=0 then
    raise exception 'Unexpected entity branch definition.';
  end if;
  execute replace(definition,'if not public.is_indoor_sales_user() then return true;','if public.has_global_project_access() then return true;');
end;
$entity_guard$;

-- Restrictive policies combine with all installed permissive role/ownership
-- policies. Add this scope to every project-bearing table, including legacy
-- finance, operations, receipt and document tables, without broadening a role.
do $project_policies$
declare relation record; predicate text;
begin
  for relation in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind='r' and a.attname='project_id' and not a.attisdropped
  loop
    execute format('alter table public.%I enable row level security',relation.relname);
    predicate:=case when relation.relname='client_contacts'
      then 'public.can_access_indoor_client_branch(client_id) and (project_id is null or public.can_access_indoor_project_branch(project_id))'
      when relation.relname='documents' then 'public.has_global_project_access() or case when project_id is not null or quotation_id is not null or contract_id is not null then (project_id is null or public.can_access_indoor_project_branch(project_id)) and (quotation_id is null or exists(select 1 from public.quotations parent where parent.id=documents.quotation_id)) and (contract_id is null or exists(select 1 from public.contracts parent where parent.id=documents.contract_id)) else client_id is not null and public.can_access_indoor_client_branch(client_id) end'
      else 'public.can_access_indoor_project_branch(project_id)' end;
    if exists(select 1 from pg_policies where schemaname='public' and tablename=relation.relname and policyname='employee_branch_boundary') then
      execute format('alter policy employee_branch_boundary on public.%I using (%s) with check (%s)',relation.relname,predicate,predicate);
    else
      execute format('create policy employee_branch_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',relation.relname,predicate,predicate);
    end if;
  end loop;
  predicate:='public.has_global_project_access() or public.project_branch_matches_employee(public.current_employee_branch(),branch)';
  if exists(select 1 from pg_policies where schemaname='public' and tablename='projects' and policyname='employee_branch_boundary') then
    execute format('alter policy employee_branch_boundary on public.projects using (%s) with check (%s)',predicate,predicate);
  else
    execute format('create policy employee_branch_boundary on public.projects as restrictive for all to authenticated using (%s) with check (%s)',predicate,predicate);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='employee_branch_boundary') then
    create policy employee_branch_boundary on public.clients as restrictive for select to authenticated
      using(public.can_access_indoor_client_branch(id));
  end if;
  -- UPDATE without a read/RETURNING must also honor scope. INSERT cannot look
  -- up its not-yet-existing row, so validate the active creator directly.
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='employee_branch_update_boundary') then
    create policy employee_branch_update_boundary on public.clients as restrictive for update to authenticated
      using(public.can_access_indoor_client_branch(id)) with check(public.can_access_indoor_client_branch(id));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='employee_branch_delete_boundary') then
    create policy employee_branch_delete_boundary on public.clients as restrictive for delete to authenticated
      using(public.can_access_indoor_client_branch(id));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='employee_branch_insert_boundary') then
    create policy employee_branch_insert_boundary on public.clients as restrictive for insert to authenticated
      with check(public.has_global_project_access() or (public.current_employee_branch() is not null and created_by=auth.uid()));
  end if;
end;
$project_policies$;

do $indirect_policies$
declare child record; predicate text;
begin
  for child in select * from(values
    ('quotation_items','quotation_id','quotations'),
    ('quotation_versions','quotation_id','quotations'),
    ('quotation_version_items','quotation_version_id','quotation_versions'),
    ('measurement_visits','measurement_request_id','measurement_requests'),
    ('measurement_submissions','measurement_request_id','measurement_requests'),
    ('delivery_vehicles','delivery_assignment_id','delivery_assignments')
  ) children(table_name,parent_column,parent_table)
  loop
    if to_regclass(format('public.%I',child.table_name)) is null then continue; end if;
    predicate:=format('public.has_global_project_access() or exists(select 1 from public.%I parent where parent.id=%I.%I)',child.parent_table,child.table_name,child.parent_column);
    if exists(select 1 from pg_policies where schemaname='public' and tablename=child.table_name and policyname='employee_branch_boundary') then
      execute format('alter policy employee_branch_boundary on public.%I using (%s) with check (%s)',child.table_name,predicate,predicate);
    else
      execute format('create policy employee_branch_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',child.table_name,predicate,predicate);
    end if;
  end loop;
end;
$indirect_policies$;

do $event_policies$
declare relation text;
begin
  foreach relation in array array['notifications','activity_logs','audit_events'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=relation and policyname='employee_branch_boundary') then
      execute format('create policy employee_branch_boundary on public.%I as restrictive for select to authenticated using(public.can_access_indoor_entity_branch(entity_type::text,entity_id))',relation);
    end if;
  end loop;
end;
$event_policies$;

-- Direct storage access remains subject to its existing commercial restrictions.
-- A matching file metadata row or project-prefixed path must also be in scope.
create or replace function public.can_access_project_storage_branch(target_bucket text,target_path text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare prefix text;
begin
  if public.has_global_project_access() then return true; end if;
  if exists(select 1 from public.documents document where document.storage_bucket=target_bucket and document.storage_path=target_path) then
    return not exists(select 1 from public.documents document where document.storage_bucket=target_bucket
      and document.storage_path=target_path and not public.can_access_indoor_entity_branch('document',document.id));
  end if;
  prefix:=split_part(target_path,'/',1);
  if prefix~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.can_access_indoor_project_branch(prefix::uuid);
  end if;
  return false;
end;
$$;
do $storage_policy$
begin
  if to_regclass('storage.objects') is not null and not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='employee_branch_boundary') then
    create policy employee_branch_boundary on storage.objects as restrictive for all to authenticated
      using(bucket_id not in ('project-attachments','signed-contracts-private') or public.can_access_project_storage_branch(bucket_id,name))
      with check(bucket_id not in ('project-attachments','signed-contracts-private') or public.can_access_project_storage_branch(bucket_id,name));
  end if;
end;
$storage_policy$;

revoke all on function public.project_branch_matches_employee(text,text) from public,anon;
grant execute on function public.project_branch_matches_employee(text,text) to authenticated,service_role;
revoke all on function public.has_global_project_access() from public,anon;
grant execute on function public.has_global_project_access() to authenticated,service_role;
revoke all on function public.current_employee_branch() from public,anon;
grant execute on function public.current_employee_branch() to authenticated,service_role;
revoke all on function public.employee_can_access_project_branch(uuid,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_branch(uuid,text) to service_role;
revoke all on function public.can_access_project_storage_branch(text,text) from public,anon;
grant execute on function public.can_access_project_storage_branch(text,text) to authenticated,service_role;
revoke all on function public.require_project_employee_branch() from public,anon,authenticated;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;
revoke all on function public.update_employee_profile_with_branch(uuid,uuid,timestamptz,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.update_employee_profile_with_branch(uuid,uuid,timestamptz,text,text,text,boolean,text) to service_role;

notify pgrst,'reload schema';
commit;
