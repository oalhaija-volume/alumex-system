-- Sales Manager already exists in app_role. Allow it when assigning employee roles.
begin;

create or replace function public.update_employee_profile(
  p_actor uuid,
  p_employee uuid,
  p_expected_updated_at timestamptz,
  p_full_name text,
  p_username text,
  p_role text,
  p_is_active boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  employee public.profiles;
  actor_is_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('alumex-employee-management', 0));
  select * into actor from profiles where id = p_actor for update;
  actor_is_admin := actor.role::text = 'Admin' or lower(actor.email) = 'admin@alumex.com';
  if actor.id is null or actor.is_active is not true or actor.status is distinct from 'Active'
     or not (actor_is_admin or actor.role::text = 'HR') then
    raise exception using errcode = '42501', message = 'Employee management access is required.';
  end if;

  select * into employee from profiles where id = p_employee for update;
  if employee.id is null then
    raise exception using errcode = 'P0002', message = 'Employee not found.';
  end if;
  if not actor_is_admin and (employee.role::text in ('Admin','Company Owner') or lower(employee.email) = 'admin@alumex.com' or p_role in ('Admin','Company Owner')) then
    raise exception using errcode = '42501', message = 'Only Admin can edit Admin or Company Owner accounts or assign these roles.';
  end if;
  if p_expected_updated_at is null or employee.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'This employee was changed by someone else. Reload the employee list and try again.';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 150
     or p_username is null or p_username !~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
     or p_is_active is null or p_role is null then
    raise exception using errcode = '22023', message = 'Enter a valid employee name, username, role and status.';
  end if;
  -- Existing legacy roles may be retained while editing name or username.
  if p_role is distinct from employee.role::text and p_role not in
     ('Admin','HR','Sales Director','CEO','Company Owner','Sales Manager','Indoor Sales','Outdoor Sales','Operations Manager','Project Manager') then
    raise exception using errcode = '22023', message = 'Choose a supported employee role.';
  end if;
  if p_actor = p_employee and (p_role is distinct from employee.role::text or p_is_active is not true) then
    raise exception using errcode = '42501', message = 'You cannot change your own role or deactivate your account.';
  end if;
  if lower(employee.email) = 'admin@alumex.com' and (p_role <> 'Admin' or p_is_active is not true) then
    raise exception using errcode = '42501', message = 'The primary Admin account must remain active with the Admin role.';
  end if;
  if employee.role::text = 'Admin' and employee.is_active and
     (p_role <> 'Admin' or not p_is_active) and not exists (
       select 1 from profiles where id <> p_employee and is_active and status = 'Active'
       and (role::text = 'Admin' or lower(email) = 'admin@alumex.com')
     ) then
    raise exception using errcode = '42501', message = 'At least one active Admin account is required.';
  end if;
  if p_role is distinct from employee.role::text and p_role in ('Operations Manager','Project Manager') then
    if public.commercial_privacy_ready() is not true then
      raise exception using errcode = '22023', message = 'The commercial privacy database update is required.';
    end if;
  end if;
  if p_role is distinct from employee.role::text and p_role in ('Sales Director','CEO') then
    if public.sales_leadership_ready() is not true then
      raise exception using errcode = '22023', message = 'The sales leadership database update is required.';
    end if;
  end if;

  update profiles set full_name = trim(p_full_name), username = p_username,
    role = p_role::public.app_role, is_active = p_is_active,
    status = case when p_is_active then 'Active' else 'Inactive' end
  where id = p_employee returning * into employee;
  return jsonb_build_object('id',employee.id,'email',employee.email,
    'full_name',employee.full_name,'username',employee.username,'role',employee.role,
    'is_active',employee.is_active,'status',employee.status,'updated_at',employee.updated_at);
end;
$$;
revoke all on function public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean) to service_role;

notify pgrst, 'reload schema';
commit;
