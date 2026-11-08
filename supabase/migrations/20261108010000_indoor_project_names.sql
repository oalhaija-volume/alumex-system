begin;

-- Expand only the title-edit permission in the installed transaction. Keep its
-- existing branch guard (including the Sales Manager policy), row locks,
-- expected version, receipts, validation and actual-role audit attribution.
do $project_names$
declare
  definition text;
  rename_block text;
  renamed_block text;
  rename_start integer;
  rename_end integer;
  old_guard text := $old$actor_role[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+'Outdoor Sales'[[:space:]]+or[[:space:]]+project\.created_by[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+p_actor$old$;
  indoor_guard text := $guard$public.sales_permission_role(actor_role::public.app_role) is distinct from 'Indoor Sales'
     and (actor_role is distinct from 'Outdoor Sales' or project.created_by is distinct from p_actor)$guard$;
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure)
    into definition;
  if cardinality(string_to_array(definition,'if p_action=''rename-project'' then'))<>2
    or position('public.require_indoor_project_branch' in definition)=0
    or position('public.require_outdoor_project_creation_branch' in definition)=0
    or position('return saved.result;' in definition)=0
    or position('select * into project from projects where id=p_project for update;' in definition)=0
    or position('You can edit only openings you recorded.' in definition)=0 then
    raise exception 'Unexpected sync definition; Indoor Sales project names were not applied.';
  end if;
  rename_start := position('if p_action=''rename-project'' then' in definition);
  rename_end := position('elsif p_action=''request-openings'' then' in substring(definition from rename_start));
  if rename_end=0 then
    raise exception 'Unexpected project name action; Indoor Sales project names were not applied.';
  end if;
  rename_block := substring(definition from rename_start for rename_end-1);
  if position('p_expected_updated_at is null or project.updated_at<>p_expected_updated_at' in rename_block)=0
    or position('length(renamed_project_name)>150' in rename_block)=0
    or position('values(p_actor,actor_role::public.app_role,''project_renamed''' in rename_block)=0
    or cardinality(string_to_array(rename_block,'Only the employee who registered this project can change its name.'))<>2 then
    raise exception 'Unexpected project name checks; Indoor Sales project names were not applied.';
  end if;
  if position(indoor_guard in rename_block)>0 then
    if cardinality(string_to_array(definition,indoor_guard))<>2
      or replace(rename_block,indoor_guard,'') ~ old_guard then
      raise exception 'Unexpected partial Indoor Sales project name migration.';
    end if;
    return;
  end if;
  if (select count(*) from regexp_matches(rename_block,old_guard,'g'))<>1
    or (select count(*) from regexp_matches(definition,old_guard,'g'))<>1 then
    raise exception 'Unexpected project name permission; Indoor Sales project names were not applied.';
  end if;
  renamed_block := regexp_replace(rename_block,old_guard,indoor_guard);
  execute replace(definition,rename_block,renamed_block);
end;
$project_names$;

notify pgrst, 'reload schema';
commit;
