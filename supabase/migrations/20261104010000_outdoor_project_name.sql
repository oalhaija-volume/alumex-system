begin;

-- Extend the installed transaction so existing branch checks, measurement
-- rules, row locks, saved receipts and retry behavior remain in force.
do $migration$
declare
  definition text;
  declaration_marker text := 'declare actor_role text;';
  action_marker text := 'if p_action=''request-openings'' then';
  result_marker text := '''id'',id,''project_number'',project_number';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position('if p_action=''rename-project'' then' in definition) > 0 then
    if position('''project_name'',project_name' in definition) = 0
      or position('''project_renamed''' in definition) = 0 then
      raise exception 'Unexpected partial Outdoor Sales project name migration.';
    end if;
    return;
  end if;
  if position(declaration_marker in definition) = 0 or position(action_marker in definition) = 0
    or position(result_marker in definition) = 0
    or position('require_indoor_project_branch' in definition) = 0
    or position('require_outdoor_project_creation_branch' in definition) = 0
    or position('return saved.result;' in definition) = 0
    or position('for update;' in definition) = 0 then
    raise exception 'Unexpected sync definition; Outdoor Sales project name migration was not applied.';
  end if;
  definition := replace(definition, declaration_marker,
    declaration_marker || ' renamed_project_name text;');
  definition := replace(definition, action_marker, $action$if p_action='rename-project' then
   if actor_role is distinct from 'Outdoor Sales'
     or (project.created_by is distinct from p_actor and project.assigned_outdoor_sales_id is distinct from p_actor) then
    raise exception using errcode='42501',message='Only the Outdoor Sales employee who created or is assigned to this project can change its name.';
   end if;
   if p_expected_updated_at is null or project.updated_at<>p_expected_updated_at then
    raise exception 'This project changed on another device. Reload the project before changing its name.';
   end if;
   if jsonb_typeof(p_payload->'projectName') is distinct from 'string' then
    raise exception using errcode='22023',message='Enter a project name.';
   end if;
   renamed_project_name := regexp_replace(p_payload->>'projectName','^[[:space:]]+|[[:space:]]+$','','g');
   if renamed_project_name='' then
    raise exception using errcode='22023',message='Enter a project name.';
   end if;
   if length(renamed_project_name)>150 then
    raise exception using errcode='22023',message='Keep the project name under 150 characters.';
   end if;
   if p_recorded_at is null or not isfinite(p_recorded_at) then
    raise exception using errcode='22023',message='A valid recording time is required.';
   end if;
   update projects set project_name=renamed_project_name where id=p_project;
   insert into audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,correlation_id,created_at)
   values(p_actor,actor_role::public.app_role,'project_renamed','project',p_project,
     jsonb_build_object('project_name',project.project_name),jsonb_build_object('project_name',renamed_project_name),p_operation,p_recorded_at);
  elsif p_action='request-openings' then$action$);
  -- All sync receipts include the current name, including registration followed
  -- by an offline rename. Repeated operations still return the original receipt.
  definition := replace(definition, result_marker,
    '''project_name'',project_name,' || result_marker);
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
