begin;

-- Governorates is an Outdoor registration choice in every assigned office.
-- The office-only matcher still routes Governorates follow-up to Karkh.
create or replace function public.employee_can_access_project_branch(actor_user_id uuid,project_branch text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or public.project_branch_matches_employee(employee.branch,project_branch)
      or (employee.role::text='Outdoor Sales' and employee.branch in ('Karkh','Rasafa','Najaf')
        and project_branch='Governorates')));
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
  -- Reject the retired province only for new rows. Historical Governorates
  -- entries in النجف retain their stored routing and remain editable.
  if new.branch='Governorates' and new.governorate='النجف' then
    raise exception using errcode='22023',message='Choose a valid project governorate.';
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

-- Keep transaction identity, ownership, locking and saved receipt replay
-- unchanged. Only the new-registration governorate whitelist is updated.
do $governorate_registration$
declare definition text;
  old_list text := '''النجف'',''الديوانية'',''الكوت'',''العمارة'',''الناصرية'',''السماوة''';
  new_list text := '''الديوانية'',''الكوت'',''العمارة'',''الناصرية'',''السماوة''';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position(old_list in definition)=0 and position(new_list in definition)>0 then return; end if;
  if cardinality(string_to_array(definition,old_list))<>2
    or position('if p_action=''register'' then' in definition)=0
    or position('if p_action=''register'' then' in definition)>position(old_list in definition)
    or position('return saved.result;' in definition)>position(old_list in definition)
    or position('require_outdoor_project_creation_branch' in definition)<position(old_list in definition) then
    raise exception 'Unexpected field registration definition; governorate choices were not applied.';
  end if;
  execute replace(definition,old_list,new_list);
end;
$governorate_registration$;

revoke all on function public.employee_can_access_project_branch(uuid,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_branch(uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
