begin;

create or replace function public.protect_employee_branch()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Outdoor staff serve both branches, including after a role transfer.
  if new.role::text = 'Outdoor Sales' then
    new.branch := null;
    return new;
  end if;
  if (tg_op = 'INSERT' and new.branch is not null)
     or (tg_op = 'UPDATE' and new.branch is distinct from old.branch) then
    if coalesce(auth.role(), '') in ('anon', 'authenticated')
       and not coalesce(public.is_active_user() and public.current_user_role()::text = 'Admin', false) then
      raise exception using errcode = '42501', message = 'Only Admin can assign employee branches.';
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger profiles_protect_branch before insert or update of branch, role on public.profiles
for each row execute function public.protect_employee_branch();

-- Remove obsolete employee assignments without changing project history.
update public.profiles set branch = null where role::text = 'Outdoor Sales' and branch is not null;
alter table public.profiles add constraint profiles_outdoor_both_branches_check
  check (role::text <> 'Outdoor Sales' or branch is null);


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
  if p_role = 'Outdoor Sales' then
    p_branch := null;
  end if;
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
