begin;

-- Outdoor employees retain their own entries after an office transfer. This
-- row-specific exception does not change branch choices or creation authority.
create or replace function public.current_employee_can_access_project_row(
  project_branch text,project_creator uuid,outdoor_assignee uuid
) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=auth.uid()
      and employee.id=project_creator and employee.role::text='Outdoor Sales'
      and employee.is_active and employee.status='Active')
    or (public.employee_can_access_project_branch(auth.uid(),project_branch)
      and coalesce(public.has_global_project_access()
        or public.project_branch_matches_employee(public.current_employee_branch(),project_branch)
        or project_creator=auth.uid()
        or public.is_outdoor_assignment_member(auth.uid(),outdoor_assignee),false));
$$;

-- Linked clients inherit the actual project scope, including an active
-- Outdoor creator whose office is currently unassigned. New unlinked clients
-- retain the existing explicit office requirement.
create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access()
    or exists(select 1 from public.projects project where project.client_id=target_client_id
      and public.current_employee_can_access_project_row(project.branch,project.created_by,project.assigned_outdoor_sales_id))
    or (public.current_employee_branch() is not null
      and exists(select 1 from public.clients customer where customer.id=target_client_id
        and customer.created_by=auth.uid()
        and not exists(select 1 from public.projects project where project.client_id=customer.id)));
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
    or (not (actor.role::text is not distinct from 'Outdoor Sales' and project.created_by is not distinct from actor_user_id)
      and (not public.employee_can_access_project_branch(actor_user_id,project.branch)
        or (actor.role::text not in ('Admin','Sales Director','Company Owner')
          and not public.project_branch_matches_employee(actor.branch,project.branch)
          and project.created_by is distinct from actor_user_id
          and not public.is_outdoor_assignment_member(actor_user_id,project.assigned_outdoor_sales_id)))) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
end;
$$;

revoke all on function public.current_employee_can_access_project_row(text,uuid,uuid) from public,anon;
grant execute on function public.current_employee_can_access_project_row(text,uuid,uuid) to authenticated,service_role;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
