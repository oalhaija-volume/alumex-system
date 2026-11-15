begin;

-- Use each employee's saved first-half assignment. Sajjad and Ehab start in
-- Rasafa and switch to Karkh on the 16th; Karkh starters rotate oppositely.
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql immutable strict set search_path=public as $$
  select case when start_branch not in ('Karkh','Rasafa') or not isfinite(at_time) then null
    when extract(day from at_time at time zone 'Asia/Baghdad')<=15 then start_branch
    when start_branch='Karkh' then 'Rasafa' else 'Karkh' end;
$$;

-- Preserve the installed creation and legacy offline-default guards, changing
-- only the source of the calendar seed. Unconfigured employees retain Karkh
-- as their first-half default, matching the preceding shared calendar.
do $employee_rotation$
declare routine text; actor_name text; definition text; old_call text; new_call text;
begin
  foreach routine in array array['require_outdoor_project_creation_branch(uuid,text)','assign_indoor_project_branch()'] loop
    actor_name:=case when routine='assign_indoor_project_branch()' then 'creator' else 'actor' end;
    old_call:='public.outdoor_sales_branch_for_date('||actor_name||'.branch,statement_timestamp())';
    new_call:='public.outdoor_sales_branch_for_date(case when '||actor_name||'.outdoor_rotation_start_branch in (''Karkh'',''Rasafa'') then '
      ||actor_name||'.outdoor_rotation_start_branch else ''Karkh'' end,statement_timestamp())';
    select pg_get_functiondef(('public.'||routine)::regprocedure) into definition;
    if position(new_call in definition)>0 and position(old_call in definition)=0 then continue; end if;
    if position(old_call in definition)=0
      or (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1 then
      raise exception 'Unexpected Outdoor calendar caller; employee rotation was not applied: %',routine;
    end if;
    execute replace(definition,old_call,new_call);
  end loop;
end;
$employee_rotation$;

notify pgrst,'reload schema';
commit;
