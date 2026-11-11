begin;

-- Withdraw only Outdoor Sales title edits. Keep registration, measurements,
-- receipt replay, branch checks, row locks and office-role auditing intact.
do $project_names$
declare
  definition text;
  rename_block text;
  renamed_block text;
  rename_start integer;
  rename_end integer;
  previous_guard text := $guard$public.sales_permission_role(actor_role::public.app_role) is distinct from 'Indoor Sales'
     and (actor_role is distinct from 'Outdoor Sales' or project.created_by is distinct from p_actor)$guard$;
  office_guard text := $guard$public.sales_permission_role(actor_role::public.app_role) is distinct from 'Indoor Sales'$guard$;
  previous_message text := 'Only the employee who registered this project can change its name.';
  office_message text := 'Only Indoor Sales and Sales Managers can change project names.';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure)
    into definition;
  if cardinality(string_to_array(definition,'if p_action=''rename-project'' then'))<>2
    or position('public.require_indoor_project_branch' in definition)=0
    or position('public.require_outdoor_project_creation_branch' in definition)=0
    or position('return saved.result;' in definition)=0
    or position('select * into project from projects where id=p_project for update;' in definition)=0 then
    raise exception 'Unexpected sync definition; Indoor-only project names were not applied.';
  end if;
  rename_start := position('if p_action=''rename-project'' then' in definition);
  rename_end := position('elsif p_action=''request-openings'' then' in substring(definition from rename_start));
  if rename_end=0 then
    raise exception 'Unexpected project name action; Indoor-only project names were not applied.';
  end if;
  rename_block := substring(definition from rename_start for rename_end-1);
  if position('p_expected_updated_at is null or project.updated_at<>p_expected_updated_at' in rename_block)=0
    or position('length(renamed_project_name)>150' in rename_block)=0
    or position('values(p_actor,actor_role::public.app_role,''project_renamed''' in rename_block)=0 then
    raise exception 'Unexpected project name checks; Indoor-only project names were not applied.';
  end if;
  if position(previous_guard in rename_block)=0 then
    if cardinality(string_to_array(rename_block,office_guard))<>2
      or cardinality(string_to_array(rename_block,office_message))<>2
      or position(previous_message in rename_block)>0
      or position('Outdoor Sales' in rename_block)>0 then
      raise exception 'Unexpected partial Indoor-only project name migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition,previous_guard))<>2
    or cardinality(string_to_array(rename_block,previous_message))<>2 then
    raise exception 'Unexpected project name permission; Indoor-only project names were not applied.';
  end if;
  renamed_block := replace(replace(rename_block,previous_guard,office_guard),previous_message,office_message);
  execute replace(definition,rename_block,renamed_block);
end;
$project_names$;

-- Older browser versions can write table rows directly. Reject changed names,
-- including an Outdoor employee's own records; other updates stay unchanged.
-- Inspect the stored role without active-status filtering: a retained token
-- must not restore name-edit permission after an employee is deactivated.
create or replace function public.protect_outdoor_project_name_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'')='authenticated'
    and exists (select 1 from public.profiles where id=auth.uid() and role='Outdoor Sales')
    and new.project_name is distinct from old.project_name then
    raise exception using errcode='42501',message='Only Indoor Sales and Sales Managers can change project names.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_outdoor_project_name_entry() from public, anon, authenticated;

create or replace function public.protect_outdoor_client_name_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'')='authenticated'
    and exists (select 1 from public.profiles where id=auth.uid() and role='Outdoor Sales')
    and new.client_name is distinct from old.client_name then
    raise exception using errcode='42501',message='Only Indoor Sales can change client names.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_outdoor_client_name_entry() from public, anon, authenticated;
create or replace trigger clients_protect_outdoor_name_entry
before update of client_name on public.clients
for each row execute function public.protect_outdoor_client_name_entry();

notify pgrst, 'reload schema';
commit;
