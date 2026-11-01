begin;

-- Extend the installed workflow rather than replacing its complete definition.
-- Later Sales Manager permission mappings and project-branch guards stay intact.
do $migration$
declare
 definition text;
 patched text;
 previous_check text := $previous$
  -- Check the complete facade snapshot under the project lock as for priced openings.
  if jsonb_typeof(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) is distinct from 'array'
   or coalesce(jsonb_array_length(p_payload->'facadeMeasurements'),0)<>(select count(*) from openings where project_id=p_project and opening_type='Facade')
   or exists(select 1 from openings o where o.project_id=p_project and o.opening_type='Facade' and not exists(
    select 1 from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x
    where x @> jsonb_build_object('id',o.id,'width',o.width,'height',o.height,'opening_type','Facade','facade_number',o.facade_number)
   )) then raise exception 'Facade dimensions changed. Reload the quotation.'; end if;
$previous$;
 facade_check text := $replacement$
  -- Include new whole-building facades without changing any saved measurement.
  if jsonb_typeof(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) is distinct from 'array' then
   raise exception 'Facade dimensions changed. Reload the quotation.';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x)
    <> coalesce(jsonb_array_length(p_payload->'facadeMeasurements'),0) then raise exception 'Duplicate opening'; end if;
  if exists(select 1 from openings o where o.project_id=p_project and o.opening_type='Facade' and not exists(
   select 1 from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x
   where x @> jsonb_build_object('id',o.id,'width',o.width,'height',o.height,'opening_type','Facade','facade_number',o.facade_number)
  )) then raise exception 'Facade dimensions changed. Reload the quotation.'; end if;
  for opening in select value from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) loop
   if jsonb_typeof(opening) is distinct from 'object'
    or jsonb_typeof(opening->'id') is distinct from 'string'
    or opening->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or opening->>'opening_type' is distinct from 'Facade'
    or jsonb_typeof(opening->'width') is distinct from 'number'
    or jsonb_typeof(opening->'height') is distinct from 'number'
    or jsonb_typeof(opening->'facade_number') is distinct from 'number' then
    raise exception 'Facade dimensions changed. Reload the quotation.';
   end if;
   if (opening->>'width')::numeric<=0 or (opening->>'width')::numeric>100000
    or (opening->>'height')::numeric<=0 or (opening->>'height')::numeric>100000
    or (opening->>'facade_number')::numeric not between 1 and 1000
    or (opening->>'facade_number')::numeric<>trunc((opening->>'facade_number')::numeric) then
    raise exception 'Facade dimensions changed. Reload the quotation.';
   end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=opening->>'id') then
    raise exception 'Duplicate opening';
   end if;
   select * into existing from openings where id=(opening->>'id')::uuid;
   if found then
    if existing.project_id is distinct from p_project or existing.opening_type is distinct from 'Facade'
     or not opening @> jsonb_build_object('width',existing.width,'height',existing.height,'facade_number',existing.facade_number)
     or (opening ? 'floor' and opening->>'floor' is distinct from existing.floor)
     or (opening ? 'room' and opening->>'room' is distinct from existing.room)
     or (opening ? 'quantity' and opening->'quantity' is distinct from to_jsonb(existing.quantity))
     or (opening ? 'work_area' and opening->>'work_area' is distinct from existing.work_area)
     or (opening ? 'opening_direction' and opening->>'opening_direction' is distinct from existing.opening_direction)
     or (opening ? 'has_arch' and opening->'has_arch' is distinct from to_jsonb(existing.has_arch))
     or (opening ? 'has_roller_shutter' and opening->'has_roller_shutter' is distinct from to_jsonb(existing.has_roller_shutter)) then
     raise exception 'Facade dimensions changed. Reload the quotation.';
    end if;
   else
    if project.building_type is distinct from 'commercial_building' then
     raise exception 'Facade and Internal works are only available for commercial buildings.';
    end if;
    if (opening->>'width')::numeric<>round((opening->>'width')::numeric,3)
     or (opening->>'height')::numeric<>round((opening->>'height')::numeric,3) then
     raise exception 'Enter a facade number and valid width and length.';
    end if;
    if opening->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or opening->>'floor' is distinct from 'Whole building'
     or opening->>'room' is distinct from ('Facade '||(opening->>'facade_number')::numeric::integer::text)
     or opening->'quantity' is distinct from '1'::jsonb
     or opening->>'work_area' is distinct from 'facade'
     or opening->>'opening_direction' is not null
     or coalesce(opening->'has_arch','false'::jsonb) is distinct from 'false'::jsonb
     or coalesce(opening->'has_roller_shutter','false'::jsonb) is distinct from 'false'::jsonb then
     raise exception 'Facade dimensions changed. Reload the quotation.';
    end if;
   end if;
  end loop;
  if (select count(distinct (x->>'facade_number')::numeric) from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x)
    <> coalesce(jsonb_array_length(p_payload->'facadeMeasurements'),0) then
   raise exception 'This facade number is already saved. Edit it or choose another number.';
  end if;
  if (select count(*) from jsonb_array_elements(p_payload->'lines') x where not exists(select 1 from openings o where o.id::text=x#>>'{opening,id}'))
    + (select count(*) from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x where not exists(select 1 from openings o where o.id::text=x->>'id'))>100 then
   raise exception 'Add up to 100 openings per revision.';
  end if;
$replacement$;
 insertion_anchor text := E'  end loop;\n elsif p_action=''approve'' then';
 facade_insertion text := $insertion$
  end loop;
  -- The exact snapshot is already saved in this transaction when its facades insert.
  for opening in select value from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) loop
   if not exists(select 1 from openings where id=(opening->>'id')::uuid) then
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,has_roller_shutter,work_area,facade_number)
    values((opening->>'id')::uuid,p_project,'OP-'||(opening->>'id'),'Whole building',opening->>'room',(opening->>'width')::numeric,(opening->>'height')::numeric,1,'Facade',null,'ready',p_actor,false,false,'facade',(opening->>'facade_number')::numeric::integer);
   end if;
  end loop;
 elsif p_action='approve' then
$insertion$;
 trigger_anchor text := ' if current_status <> ''new_lead'' then';
 facade_guard text := $guard$
 -- Permit only newly quoted facade dimensions, under the same project lock.
 if TG_OP='INSERT' and NEW.opening_type='Facade' and NEW.quantity=1 and NEW.site_readiness='ready'
  and NEW.work_area='facade' and NEW.floor='Whole building' and NEW.opening_direction is null
  and NEW.has_arch=false and NEW.has_roller_shutter=false and exists(
   select 1 from sales_workflows f cross join lateral jsonb_array_elements(coalesce(f.quotation->'facadeMeasurements','[]'::jsonb)) facade
   where f.project_id=target and f.stage='quotation' and f.signed_at is null
    and facade @> jsonb_build_object('id',NEW.id,'floor',NEW.floor,'room',NEW.room,'width',NEW.width,'height',NEW.height,'quantity',1,'opening_type','Facade','opening_direction',null,'work_area','facade','facade_number',NEW.facade_number)
  ) then return NEW; end if;
 if current_status <> 'new_lead' then
$guard$;
begin
 select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure) into definition;
 if position('-- Include new whole-building facades without changing any saved measurement.' in definition)=0 then
  if position(previous_check in definition)=0 or position(insertion_anchor in definition)=0 then
   raise exception 'Unexpected quotation workflow definition. Apply earlier measurement migrations first.';
  end if;
  patched=replace(replace(definition,previous_check,facade_check),insertion_anchor,trim(both E'\n' from facade_insertion));
  execute patched;
 end if;
 select pg_get_functiondef('public.lock_quoted_openings()'::regprocedure) into definition;
 if position('-- Permit only newly quoted facade dimensions, under the same project lock.' in definition)=0 then
  if position(trigger_anchor in definition)=0 then raise exception 'Unexpected quoted-opening lock definition.'; end if;
  patched=replace(definition,trigger_anchor,trim(both E'\n' from facade_guard));
  execute patched;
 end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
