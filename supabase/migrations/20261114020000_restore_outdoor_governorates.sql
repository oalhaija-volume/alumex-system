begin;

-- Baghdad Outdoor Sales may register Governorates work. The project remains
-- routed to Karkh for Indoor follow-up; the office-only matcher is unchanged.
create or replace function public.employee_can_access_project_branch(actor_user_id uuid,project_branch text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or public.project_branch_matches_employee(employee.branch,project_branch)
      or (employee.role::text='Outdoor Sales' and employee.branch='Rasafa' and project_branch='Governorates')));
$$;

-- Evaluate actual row values so INSERT checks do not query a row that has not
-- been inserted. Only the newly restored Rasafa -> Governorates scope needs
-- the Outdoor creator/current-team check; existing office permissions remain.
create or replace function public.current_employee_can_access_project_row(
  project_branch text,project_creator uuid,outdoor_assignee uuid
) returns boolean language sql stable security definer set search_path=public as $$
  select public.employee_can_access_project_branch(auth.uid(),project_branch)
    and coalesce(public.has_global_project_access()
      or public.project_branch_matches_employee(public.current_employee_branch(),project_branch)
      or project_creator=auth.uid()
      or public.is_outdoor_assignment_member(auth.uid(),outdoor_assignee),false);
$$;

create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access() or exists(
    select 1 from public.projects project where project.id=target_project_id
      and public.current_employee_can_access_project_row(project.branch,project.created_by,project.assigned_outdoor_sales_id));
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access()
    or (public.current_employee_branch() is not null and (
      exists(select 1 from public.projects project where project.client_id=target_client_id
        and public.current_employee_can_access_project_row(project.branch,project.created_by,project.assigned_outdoor_sales_id))
      or exists(select 1 from public.clients customer where customer.id=target_client_id
        and customer.created_by=auth.uid()
        and not exists(select 1 from public.projects project where project.client_id=customer.id))));
$$;

create or replace function public.require_indoor_project_branch(target_project_id uuid,actor_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.profiles; project public.projects;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or actor_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id=actor_user_id for share;
  select * into project from public.projects where id=target_project_id for update;
  if not found or actor.id is null or actor.is_active is not true or actor.status is distinct from 'Active'
    or not public.employee_can_access_project_branch(actor_user_id,project.branch)
    or (actor.role::text not in ('Admin','Sales Director','Company Owner')
      and not public.project_branch_matches_employee(actor.branch,project.branch)
      and project.created_by is distinct from actor_user_id
      and not public.is_outdoor_assignment_member(actor_user_id,project.assigned_outdoor_sales_id)) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
end;
$$;

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
    or not public.employee_can_access_project_branch(actor_user_id,selected_branch) then
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
    if not public.employee_can_access_project_branch(creator.id,new.branch) then
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

-- Legacy permissive project policies include broad access. Keep the restored
-- Governorates exception restrictive for reads and writes, including INSERT.
alter policy employee_branch_boundary on public.projects
  using(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id))
  with check(public.current_employee_can_access_project_row(branch,created_by,assigned_outdoor_sales_id));

revoke all on function public.employee_can_access_project_branch(uuid,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_branch(uuid,text) to service_role;
revoke all on function public.current_employee_can_access_project_row(text,uuid,uuid) from public,anon;
grant execute on function public.current_employee_can_access_project_row(text,uuid,uuid) to authenticated,service_role;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
