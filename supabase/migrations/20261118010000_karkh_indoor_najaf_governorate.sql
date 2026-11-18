begin;

-- New Karkh Indoor registrations can serve Najaf as a governorate. Leave
-- historical Governorates/Najaf rows unmarked and within Najaf's boundary.
alter table public.projects add column governorate_office text;
alter table public.projects add constraint projects_governorate_office_check check (
  governorate_office is null or (
    governorate_office='Karkh'
    and branch is not distinct from 'Governorates'
    and governorate is not distinct from 'النجف'
  )
);

create function public.effective_project_branch(
  project_branch text,project_governorate text,governorate_office text
) returns text language sql immutable set search_path=public as $$
  select case when project_branch='Governorates' and project_governorate='النجف'
    and governorate_office='Karkh' then 'Governorates'
    else public.effective_project_branch(project_branch,project_governorate) end;
$$;
revoke all on function public.effective_project_branch(text,text,text) from public,anon;
grant execute on function public.effective_project_branch(text,text,text) to authenticated,service_role;

create or replace function public.assign_indoor_project_branch()
returns trigger language plpgsql security definer set search_path=public as $$
declare creator public.profiles;
begin
  if tg_op='UPDATE' then
    if row(new.branch,new.governorate,new.governorate_office)
      is distinct from row(old.branch,old.governorate,old.governorate_office) then
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
  -- Routing comes from the verified creator, never a client-provided marker.
  new.governorate_office:=null;
  if new.branch='Governorates' and public.effective_project_branch(new.branch,new.governorate)='Najaf' then
    if creator.role::text='Indoor Sales' and creator.branch='Karkh' and new.governorate='النجف' then
      new.governorate_office:='Karkh';
    else
      raise exception using errcode='22023',message='Choose a valid project governorate.';
    end if;
  end if;
  if creator.role::text not in ('Admin','Sales Director','Company Owner') then
    if creator.branch is null or creator.branch not in ('Karkh','Rasafa','Najaf') then
      raise exception using errcode='22023',message='Ask Admin to assign your branch before creating a project.';
    end if;
    if new.branch is null then
      new.branch:=case when creator.role::text='Outdoor Sales' and creator.branch in ('Karkh','Rasafa')
        then public.outdoor_sales_branch_for_date(case when creator.outdoor_rotation_start_branch in ('Karkh','Rasafa')
          then creator.outdoor_rotation_start_branch else 'Karkh' end,statement_timestamp()) else creator.branch end;
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
create or replace trigger projects_assign_indoor_branch
before insert or update of branch,governorate,governorate_office on public.projects
for each row execute function public.assign_indoor_project_branch();

-- Resolve the stored routing before the existing actor/creator/team checks.
-- The older helper signatures retain their legacy geography semantics.
create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access() or exists(select 1 from public.projects project
    where project.id=target_project_id and public.current_employee_can_access_project_row(
      public.effective_project_branch(project.branch,project.governorate,project.governorate_office),
      project.created_by,project.assigned_outdoor_sales_id,null));
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_global_project_access()
    or exists(select 1 from public.projects project where project.client_id=target_client_id
      and public.current_employee_can_access_project_row(
        public.effective_project_branch(project.branch,project.governorate,project.governorate_office),
        project.created_by,project.assigned_outdoor_sales_id,null))
    or (public.current_employee_branch() is not null
      and exists(select 1 from public.clients customer where customer.id=target_client_id
        and customer.created_by=auth.uid()
        and not exists(select 1 from public.projects project where project.client_id=customer.id)));
$$;

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
  if not found or not public.employee_can_access_project_row(actor_user_id,
    public.effective_project_branch(project.branch,project.governorate,project.governorate_office),
    project.created_by,project.assigned_outdoor_sales_id,null) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
end;
$$;

alter policy employee_branch_boundary on public.projects
  using(public.current_employee_can_access_project_row(
    public.effective_project_branch(branch,governorate,governorate_office),created_by,assigned_outdoor_sales_id,null))
  with check(public.current_employee_can_access_project_row(
    public.effective_project_branch(branch,governorate,governorate_office),created_by,assigned_outdoor_sales_id,null));
alter policy indoor_branch_boundary on public.projects
  using(public.current_employee_can_access_project_row(
    public.effective_project_branch(branch,governorate,governorate_office),created_by,assigned_outdoor_sales_id,null))
  with check(public.current_employee_can_access_project_row(
    public.effective_project_branch(branch,governorate,governorate_office),created_by,assigned_outdoor_sales_id,null));

-- Preserve the installed assignment, notification ownership and deduplication
-- logic, changing only calls that have the complete project row available.
do $routing_callers$
declare routine text; definition text; original_definition text; prefix text; old_call text; new_call text;
begin
  foreach routine in array array[
    'require_project_employee_branch()','require_governorate_follow_up_owner()',
    'sales_notification_recipients(uuid)','deliver_due_follow_up_notifications()','notify_sales_field_change()'
  ] loop
    select pg_get_functiondef(('public.'||routine)::regprocedure) into definition;
    original_definition:=definition;
    foreach prefix in array array['new.','project.','p.',''] loop
      old_call:='public.effective_project_branch('||prefix||'branch,'||prefix||'governorate)';
      new_call:='public.effective_project_branch('||prefix||'branch,'||prefix||'governorate,'||prefix||'governorate_office)';
      definition:=replace(definition,old_call,new_call);
    end loop;
    if definition=original_definition then
      raise exception 'Unexpected project routing caller; Karkh Najaf routing was not applied: %',routine;
    end if;
    execute definition;
  end loop;
end;
$routing_callers$;

-- Saved receipt checks remain before fresh-registration validation. An
-- explicit actor guard limits the extra province to Karkh Indoor Sales.
do $registration$
declare definition text;
  old_list text:='''الديوانية'',''الكوت'',''العمارة'',''الناصرية'',''السماوة''';
  new_list text:='''النجف'',''الديوانية'',''الكوت'',''العمارة'',''الناصرية'',''السماوة''';
  creation_marker text:='perform public.require_outdoor_project_creation_branch(p_actor, p_payload#>>''{project,branch}'');';
  result_marker text:='''governorate'',governorate,';
  actor_guard text:=$guard$if p_payload#>>'{project,branch}'='Governorates' and p_payload#>>'{project,governorate}'='النجف'
    and not exists(select 1 from public.profiles creator where creator.id=p_actor
      and creator.role::text='Indoor Sales' and creator.branch='Karkh' and creator.is_active and creator.status='Active') then
    raise exception using errcode='22023',message='Choose the project governorate.';
  end if;
  $guard$;
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if cardinality(string_to_array(definition,old_list))<>2
    or position(new_list in definition)>0
    or cardinality(string_to_array(definition,creation_marker))<>2
    or cardinality(string_to_array(definition,result_marker))<>2
    or position('require_indoor_project_branch' in definition)=0
    or position('require_indoor_project_branch' in definition)>position('return saved.result;' in definition)
    or position('return saved.result;' in definition)>position(old_list in definition) then
    raise exception 'Unexpected field registration definition; Karkh Najaf routing was not applied.';
  end if;
  definition:=replace(definition,old_list,new_list);
  definition:=replace(definition,creation_marker,actor_guard||creation_marker);
  definition:=replace(definition,result_marker,'''governorate'',governorate,''governorate_office'',governorate_office,');
  execute definition;
end;
$registration$;

notify pgrst,'reload schema';
commit;
