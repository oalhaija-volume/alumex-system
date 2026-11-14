begin;

-- Historical Governorates rows keep their original routing values. Najaf's
-- privacy boundary follows the actual governorate, including legacy rows.
create or replace function public.effective_project_branch(project_branch text,project_governorate text)
returns text language sql immutable set search_path=public as $$
  select case when project_branch='Governorates'
    and (btrim(project_governorate) in ('النجف','نجف') or lower(btrim(project_governorate))='najaf')
    then 'Najaf' else project_branch end;
$$;

-- Both Baghdad Outdoor employees follow the same calendar. The old argument
-- remains for compatibility; either Baghdad office uses Karkh in days 1-15.
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql immutable strict set search_path=public as $$
  select case when start_branch not in ('Karkh','Rasafa') or not isfinite(at_time) then null
    when extract(day from at_time at time zone 'Asia/Baghdad')<=15 then 'Karkh' else 'Rasafa' end;
$$;

-- Read/assignment capability is independent of today's registration area.
-- Indoor follow-up remains office-specific; Governorates follow-up is Karkh.
create or replace function public.employee_can_access_project_branch(actor_user_id uuid,project_branch text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or (employee.role::text='Outdoor Sales' and employee.branch in ('Karkh','Rasafa')
        and project_branch in ('Karkh','Rasafa','Governorates'))
      or public.project_branch_matches_employee(employee.branch,project_branch)));
$$;

create or replace function public.employee_can_access_project_row(
  actor_user_id uuid,project_branch text,project_creator uuid,outdoor_assignee uuid,project_governorate text
) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or (public.effective_project_branch(project_branch,project_governorate)='Najaf' and employee.branch='Najaf')
      or (employee.branch in ('Karkh','Rasafa')
        and public.effective_project_branch(project_branch,project_governorate) in ('Karkh','Rasafa','Governorates')
        and (public.project_branch_matches_employee(employee.branch,project_branch)
          or (employee.role::text='Outdoor Sales'
            and (project_branch in ('Karkh','Rasafa') or project_creator=employee.id
              or public.is_outdoor_assignment_member(employee.id,outdoor_assignee)))))));
$$;

create or replace function public.current_employee_can_access_project_row(
  project_branch text,project_creator uuid,outdoor_assignee uuid,project_governorate text
) returns boolean language sql stable security definer set search_path=public as $$
  select public.employee_can_access_project_row(auth.uid(),project_branch,project_creator,outdoor_assignee,project_governorate);
$$;

-- Preserve installed callers that have no governorate value. Policies and
-- project/client RPC guards below always use the complete row instead.
create or replace function public.current_employee_can_access_project_row(
  project_branch text,project_creator uuid,outdoor_assignee uuid
) returns boolean language sql stable security definer set search_path=public as $$
  select public.current_employee_can_access_project_row(project_branch,project_creator,outdoor_assignee,null);
$$;

create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access() or exists(select 1 from public.projects project
    where project.id=target_project_id and public.current_employee_can_access_project_row(
      project.branch,project.created_by,project.assigned_outdoor_sales_id,project.governorate));
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access()
    or exists(select 1 from public.projects project where project.client_id=target_client_id
      and public.current_employee_can_access_project_row(project.branch,project.created_by,project.assigned_outdoor_sales_id,project.governorate))
    or (public.current_employee_branch() is not null
      and exists(select 1 from public.clients customer where customer.id=target_client_id
        and customer.created_by=auth.uid()
        and not exists(select 1 from public.projects project where project.client_id=customer.id)));
$$;

-- sync_field_change calls this before returning a saved receipt. Originators
-- keep their Baghdad/province work through rotation, never across Najaf.
create or replace function public.require_indoor_project_branch(target_project_id uuid,actor_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare project public.projects;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or actor_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  perform 1 from public.profiles where id=actor_user_id for share;
  select * into project from public.projects where id=target_project_id for update;
  if not found or not public.employee_can_access_project_row(actor_user_id,project.branch,
    project.created_by,project.assigned_outdoor_sales_id,project.governorate) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
end;
$$;

create or replace function public.require_outdoor_project_creation_branch(actor_user_id uuid,selected_branch text)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles; allowed_branch text;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or actor_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id=actor_user_id for share;
  if actor.role::text is distinct from 'Outdoor Sales' then return; end if;
  if actor.is_active is not true or actor.status is distinct from 'Active' then
    raise exception using errcode='42501',message='Sales access required';
  end if;
  -- Older offline registrations omit branch to preserve their receipt hash.
  -- The INSERT trigger derives their area from server time before row checks.
  if selected_branch is null and actor.branch in ('Karkh','Rasafa','Najaf') then return; end if;
  if actor.branch='Najaf' and selected_branch='Najaf' then return; end if;
  if actor.branch in ('Karkh','Rasafa') then
    if selected_branch='Governorates' then return; end if;
    allowed_branch:=public.outdoor_sales_branch_for_date(actor.branch,statement_timestamp());
    if selected_branch=allowed_branch then return; end if;
  end if;
  raise exception using errcode='42501',message='Choose a project from your branch.';
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
  if new.branch='Governorates' and public.effective_project_branch(new.branch,new.governorate)='Najaf' then
    raise exception using errcode='22023',message='Choose a valid project governorate.';
  end if;
  if creator.role::text not in ('Admin','Sales Director','Company Owner') then
    if creator.branch is null or creator.branch not in ('Karkh','Rasafa','Najaf') then
      raise exception using errcode='22023',message='Ask Admin to assign your branch before creating a project.';
    end if;
    if new.branch is null then
      new.branch:=case when creator.role::text='Outdoor Sales' and creator.branch in ('Karkh','Rasafa')
        then public.outdoor_sales_branch_for_date(creator.branch,statement_timestamp()) else creator.branch end;
    end if;
    if creator.role::text='Outdoor Sales' then
      perform public.require_outdoor_project_creation_branch(creator.id,new.branch);
    elsif not public.employee_can_access_project_branch(creator.id,new.branch) then
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

-- Stale employee assignments stay untouched. Any new assignment must satisfy
-- the effective Najaf boundary, including assignments on child tables.
create or replace function public.require_project_employee_branch()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_row jsonb:=to_jsonb(new); previous_row jsonb; column_name text; employee_id uuid; project_branch text;
begin
  if tg_op='UPDATE' then previous_row:=to_jsonb(old); end if;
  if tg_table_name='projects' then project_branch:=public.effective_project_branch(new.branch,new.governorate);
  else select public.effective_project_branch(branch,governorate) into project_branch from public.projects
    where id=(current_row->>'project_id')::uuid; end if;
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

create or replace function public.require_governorate_follow_up_owner()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner public.profiles; follow_up_branch text;
begin
  if new.branch is distinct from 'Governorates' or new.follow_up_owner_id is null then return new; end if;
  if tg_op='UPDATE' and new.follow_up_owner_id is not distinct from old.follow_up_owner_id
    and row(new.branch,new.governorate) is not distinct from row(old.branch,old.governorate) then return new; end if;
  follow_up_branch:=case when public.effective_project_branch(new.branch,new.governorate)='Najaf' then 'Najaf' else 'Karkh' end;
  select * into owner from public.profiles where id=new.follow_up_owner_id for share;
  if owner.role::text in ('Indoor Sales','Sales Manager') and owner.branch is distinct from follow_up_branch then
    raise exception using errcode='42501',message='Choose an active employee from the project branch.';
  end if;
  return new;
end;
$$;

create or replace function public.sales_notification_recipients(target_project uuid)
returns setof uuid language sql stable security definer set search_path=public as $$
  with project as(select * from public.projects where id=target_project),eligible as(
    select employee.id from public.profiles employee cross join project
    where employee.is_active and employee.status='Active' and employee.role::text in ('Indoor Sales','Sales Manager')
      and public.project_branch_matches_employee(employee.branch,public.effective_project_branch(project.branch,project.governorate))
  ) select employee.id from eligible employee cross join project
    where employee.id=project.follow_up_owner_id
      or not exists(select 1 from eligible owner where owner.id=project.follow_up_owner_id);
$$;

-- Existing notification payloads must follow the same legacy Najaf boundary.
do $notification_scope$
declare definition text; routine text; old_guard text; new_guard text;
begin
  foreach routine in array array['deliver_due_follow_up_notifications()','notify_sales_field_change()'] loop
    select pg_get_functiondef(('public.'||routine)::regprocedure) into definition;
    old_guard:=case when routine='deliver_due_follow_up_notifications()'
      then 'public.employee_can_access_project_branch(employee.id,p.branch)'
      else 'public.employee_can_access_project_branch(u.id,project.branch)' end;
    new_guard:=case when routine='deliver_due_follow_up_notifications()'
      then 'public.employee_can_access_project_branch(employee.id,public.effective_project_branch(p.branch,p.governorate))'
      else 'public.employee_can_access_project_branch(u.id,public.effective_project_branch(project.branch,project.governorate))' end;
    if position(new_guard in definition)>0 then continue; end if;
    if position(old_guard in definition)=0 then raise exception 'Unexpected notification scope definition: %',routine; end if;
    execute replace(definition,old_guard,new_guard);
  end loop;
end;
$notification_scope$;

alter policy employee_branch_boundary on public.projects
  using(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id,governorate))
  with check(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id,governorate));

-- The older restrictive Indoor policy must also resolve legacy governorates;
-- otherwise it would hide historical Najaf work from Najaf's own CRM staff.
alter policy indoor_branch_boundary on public.projects
  using(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id,governorate))
  with check(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id,governorate));

revoke all on function public.effective_project_branch(text,text) from public,anon;
grant execute on function public.effective_project_branch(text,text) to authenticated,service_role;
revoke all on function public.employee_can_access_project_row(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_row(uuid,text,uuid,uuid,text) to service_role;
revoke all on function public.current_employee_can_access_project_row(text,uuid,uuid,text) from public,anon;
grant execute on function public.current_employee_can_access_project_row(text,uuid,uuid,text) to authenticated,service_role;
revoke all on function public.employee_can_access_project_branch(uuid,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_branch(uuid,text) to service_role;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
