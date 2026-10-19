begin;

-- Patch only registration so all existing sync workflows and grants remain intact.
-- Older device queues may omit branch; never guess a branch for that saved work.
do $migration$
declare
 definition text;
 old_columns text := 'assigned_outdoor_sales_id,readiness_note,building_type)';
 old_values text := 'p_payload#>>''{project,buildingType}'');';
begin
 select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
 if position(old_columns in definition)=0 or position(old_values in definition)=0 then
  raise exception 'Unexpected sync registration definition; project branch migration was not applied.';
 end if;
 definition:=replace(definition, 'if p_action=''register'' then', $validation$if p_action='register' then
  if actor_role='Outdoor Sales' and (p_payload->'project') ? 'branch' and (
   jsonb_typeof(p_payload#>'{project,branch}') is distinct from 'string'
   or p_payload#>>'{project,branch}' not in ('Karkh','Rasafa')
  ) then raise exception using errcode='22023',message='Choose the project branch: Karkh or Rasafa.'; end if;$validation$);
 definition:=replace(definition,old_columns,'assigned_outdoor_sales_id,readiness_note,building_type,branch)');
 definition:=replace(definition,old_values,$values$p_payload#>>'{project,buildingType}',case when actor_role='Outdoor Sales' then p_payload#>>'{project,branch}' else null end);$values$);
 execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
