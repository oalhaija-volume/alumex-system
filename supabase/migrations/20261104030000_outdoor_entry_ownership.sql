begin;

-- Team membership shares the measurement task, not authorship of saved entries.
-- The server transaction checks the stored creator after locking the row. Its
-- existing receipt replay stays before these checks so committed work can clear
-- a device queue even after an employee's assignment changes.
do $ownership$
declare
  definition text;
  rename_marker text := '(project.created_by is distinct from p_actor and not public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id))';
  opening_marker text := 'if not found then raise exception ''Opening not found in this project.''; end if;';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position('You can edit only openings you recorded.' in definition) > 0 then
    if position(rename_marker in definition) > 0
      or position('Only the employee who registered this project can change its name.' in definition) = 0 then
      raise exception 'Unexpected partial Outdoor entry ownership migration.';
    end if;
    return;
  end if;
  if position(rename_marker in definition) = 0 or position(opening_marker in definition) = 0
    or position('return saved.result;' in definition) = 0
    or position('select * into measured from openings' in definition) = 0
    or position('for update;' in definition) = 0 then
    raise exception 'Unexpected sync definition; Outdoor entry ownership was not applied.';
  end if;
  definition := replace(definition, rename_marker, 'project.created_by is distinct from p_actor');
  definition := replace(definition,
    'Only the Outdoor Sales employee who created or is assigned to this project can change its name.',
    'Only the employee who registered this project can change its name.');
  definition := replace(definition, opening_marker, opening_marker || $guard$
   if public.sales_permission_role(actor_role::public.app_role)='Outdoor Sales'
     and measured.created_by is distinct from p_actor then
    raise exception using errcode='42501',message='You can edit only openings you recorded.';
   end if;$guard$);
  execute definition;
end;
$ownership$;

-- A direct browser write or another authenticated RPC must not let an Outdoor
-- employee claim someone else's entry. Service transactions validate p_actor
-- above; existing office/leadership permissions continue to apply unchanged.
create or replace function public.protect_outdoor_opening_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'')='authenticated' and public.current_user_role()='Outdoor Sales' then
    if tg_op='INSERT' then
      if new.created_by is distinct from auth.uid() then
        raise exception using errcode='42501',message='Opening entries must retain their original employee.';
      end if;
    else
      if old.created_by is distinct from auth.uid() then
        raise exception using errcode='42501',message='You can edit only openings you recorded.';
      end if;
      if tg_op='UPDATE' and new.created_by is distinct from old.created_by then
        raise exception using errcode='42501',message='Opening entries must retain their original employee.';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_outdoor_opening_entry() from public, anon, authenticated;
create or replace trigger openings_protect_outdoor_entry
before insert or update or delete on public.openings
for each row execute function public.protect_outdoor_opening_entry();

create or replace function public.protect_outdoor_project_name_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'')='authenticated' and public.current_user_role()='Outdoor Sales'
    and new.project_name is distinct from old.project_name
    and old.created_by is distinct from auth.uid() then
    raise exception using errcode='42501',message='Only the employee who registered this project can change its name.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_outdoor_project_name_entry() from public, anon, authenticated;
create or replace trigger projects_protect_outdoor_name_entry
before update of project_name on public.projects
for each row execute function public.protect_outdoor_project_name_entry();

-- Restrictive policies narrow all existing permissive opening-write policies.
-- Team SELECT policies remain unchanged, and no broad team write is added.
do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='openings' and policyname='outdoor_opening_insert_own_entry') then
    create policy outdoor_opening_insert_own_entry on public.openings as restrictive for insert to authenticated
      with check (public.current_user_role() is distinct from 'Outdoor Sales' or created_by=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='openings' and policyname='outdoor_opening_update_own_entry') then
    create policy outdoor_opening_update_own_entry on public.openings as restrictive for update to authenticated
      using (public.current_user_role() is distinct from 'Outdoor Sales' or created_by=auth.uid())
      with check (public.current_user_role() is distinct from 'Outdoor Sales' or created_by=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='openings' and policyname='outdoor_opening_delete_own_entry') then
    create policy outdoor_opening_delete_own_entry on public.openings as restrictive for delete to authenticated
      using (public.current_user_role() is distinct from 'Outdoor Sales' or created_by=auth.uid());
  end if;
end;
$policies$;

notify pgrst, 'reload schema';
commit;
