begin;

-- Removing an opening from a quotation omits its charges in that revision.
-- Site measurements and their media remain intact, as do earlier snapshots.
do $removal$
declare
  definition text;
  measured_guard text := $previous$if exists(select 1 from openings o where o.project_id=p_project and o.opening_type is distinct from 'Skylight' and o.opening_type is distinct from 'Facade' and not exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=o.id::text)) then raise exception 'Measurements changed. Reload the quotation.'; end if;$previous$;
  replacement text := $replacement$-- Explicit quotation exclusions share the existing project lock and revision.
  if p_payload ? 'excludedOpeningIds' then
   if jsonb_typeof(p_payload->'excludedOpeningIds') is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid removed openings. Reload the quotation.';
   end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'excludedOpeningIds') entry
     where jsonb_typeof(entry) is distinct from 'string')
    or (select count(distinct entry#>>'{}') from jsonb_array_elements(p_payload->'excludedOpeningIds') entry)
      <> jsonb_array_length(p_payload->'excludedOpeningIds') then
    raise exception using errcode='22023',message='Invalid removed openings. Reload the quotation.';
   end if;
   if exists(select 1 from jsonb_array_elements_text(p_payload->'excludedOpeningIds') entry
     where not exists(select 1 from openings o where o.project_id=p_project and o.id::text=entry
       and o.opening_type is distinct from 'Skylight' and o.opening_type is distinct from 'Facade')
       or exists(select 1 from jsonb_array_elements(p_payload->'lines') quoted_line where quoted_line.value#>>'{opening,id}'=entry)) then
    raise exception using errcode='22023',message='Invalid removed openings. Reload the quotation.';
   end if;
  end if;
  if exists(select 1 from openings o where o.project_id=p_project
    and o.opening_type is distinct from 'Skylight' and o.opening_type is distinct from 'Facade'
    and not exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=o.id::text)
    and not exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'excludedOpeningIds','[]'::jsonb)) entry where entry=o.id::text)) then
   raise exception 'Measurements changed. Reload the quotation.';
  end if;$replacement$;
begin
  select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure) into definition;
  if position('-- Explicit quotation exclusions share the existing project lock and revision.' in definition)>0 then
    if position('Invalid removed openings. Reload the quotation.' in definition)=0
      or position(measured_guard in definition)>0 then
      raise exception 'Unexpected partial quotation opening removal migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition,measured_guard))<>2
    or position('require_indoor_project_branch' in definition)=0
    or position('public.sales_permission_role(' in definition)=0
    or position('This project changed. Reload before continuing.' in definition)=0
    or position('Complete the additional measurements and save a quotation revision before continuing.' in definition)=0
    or position('Signed contracts cannot be changed.' in definition)=0
    or position('insert into quotation_revisions' in definition)=0
    or position('Include new whole-building facades without changing any saved measurement.' in definition)=0
    or position('insert into public.contract_template_corrections' in definition)=0 then
    raise exception 'Unexpected sales workflow definition; quotation opening removal was not applied.';
  end if;
  execute replace(definition,measured_guard,replacement);
end;
$removal$;

notify pgrst, 'reload schema';
commit;
