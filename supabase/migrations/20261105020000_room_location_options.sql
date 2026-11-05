begin;

-- Keep stored room names stable while allowing the shared registration presets
-- in edits. Patch only this predicate in the installed measurement transaction.
do $room_options$
declare
  definition text;
  previous_options text := $previous$coalesce(edit->>'room','') not in ('Living room','Bedroom','Kitchen','Bathroom','Dining room','Office','Hallway','Staircase','Balcony','Storage room','Other')$previous$;
  expanded_options text := $expanded$coalesce(edit->>'room','') not in ('Living room','Bedroom','Kitchen','Bathroom','Dining room','Office','Hallway','Staircase','Balcony','Storage room','Hall','Lightwell','Laundry room','Rooftop','Cold kitchen','Hot kitchen','Facade hall','Facade room','Lightwell kitchen','Lightwell room','Hawli','Other')$expanded$;
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure)
    into definition;
  if position(expanded_options in definition)>0 then
    if cardinality(string_to_array(definition,expanded_options))<>2 or position(previous_options in definition)>0 then
      raise exception 'Unexpected partial room location options migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition,previous_options))<>2
    or position('public.require_indoor_project_branch' in definition)=0
    or position('public.require_outdoor_project_creation_branch' in definition)=0
    or position('public.sales_permission_role(' in definition)=0
    or position('public.is_outdoor_assignment_member(p_actor,project.assigned_outdoor_sales_id)' in definition)=0
    or position('You can edit only openings you recorded.' in definition)=0
    or position('return saved.result;' in definition)=0
    or position('select * into project from projects where id=p_project for update;' in definition)=0
    or position('select * into measured from openings where id=(edit->>''id'')::uuid and project_id=p_project for update;' in definition)=0
    or position('This opening changed on another device. Reload measurements before editing it again.' in definition)=0
    or position('Reopen measurements before editing an opening.' in definition)=0
    or position('Resume measurements before recording or completing them.' in definition)=0
    or position('Existing measurements are preserved. Add the new openings separately.' in definition)=0 then
    raise exception 'Unexpected sync definition; room location options were not applied.';
  end if;
  execute replace(definition,previous_options,expanded_options);
end;
$room_options$;

notify pgrst, 'reload schema';
commit;
