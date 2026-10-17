begin;

create or replace function public.update_employee_profile_with_branch(
  p_actor uuid, p_employee uuid, p_expected_updated_at timestamptz,
  p_full_name text, p_username text, p_role text, p_is_active boolean,
  p_branch text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  employee_branch text;
  actor_is_admin boolean;
begin
  result := public.update_employee_profile(p_actor, p_employee, p_expected_updated_at,
    p_full_name, p_username, p_role, p_is_active);
  select branch into employee_branch from profiles where id = p_employee;
  select (role::text = 'Admin' or lower(email) = 'admin@alumex.com')
    into actor_is_admin from profiles where id = p_actor;
  if p_branch is not null and p_branch not in ('Karkh', 'Rasafa') then
    raise exception using errcode = '22023', message = 'Choose Karkh or Rasafa.';
  end if;
  if p_branch is distinct from employee_branch and not actor_is_admin then
    raise exception using errcode = '42501', message = 'Only Admin can assign employee branches.';
  end if;
  if actor_is_admin and p_role = 'Indoor Sales' and p_branch is null then
    raise exception using errcode = '22023', message = 'Choose a branch for the Indoor Sales employee.';
  end if;
  update profiles set branch = p_branch where id = p_employee;
  return result || jsonb_build_object('branch', p_branch);
exception when serialization_failure then
  -- PostgREST retries 40001 automatically. This is a user edit conflict,
  -- so return HTTP 409 without retrying the same obsolete version.
  raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;
revoke all on function public.update_employee_profile_with_branch(uuid,uuid,timestamptz,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.update_employee_profile_with_branch(uuid,uuid,timestamptz,text,text,text,boolean,text) to service_role;

notify pgrst, 'reload schema';
commit;
