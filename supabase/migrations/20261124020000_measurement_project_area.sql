begin;

-- Keep the originating commercial office immutable. A separately verified site
-- area routes only Baghdad Outdoor visibility and measurement responsibility.
-- Fail before changing schema when any reviewed installed routine has drifted.
do $baseline$
declare routine record; installed text;
begin
  for routine in select * from (values
    ('can_access_indoor_project_branch(uuid)','0e6a6a2b28f850b5285962c70220028b'),
    ('can_access_indoor_client_branch(uuid)','9e70ae0d5998626e479338b1d0e42243'),
    ('require_indoor_project_branch(uuid,uuid)','02eb37b941dacdccd29f1789219864f4'),
    ('acknowledge_hidden_field_receipt(uuid,uuid,uuid,text,jsonb)','9ed09ba9ea5d57bebef35a71aef242de'),
    ('rotate_outdoor_measurement_tasks()','b77c5047583647d72be3c621a53dc4ac'),
    ('sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','85be2fc17cd33e379ebbb216ac673b81')
  ) expected(signature,body_md5) loop
    select prosrc into strict installed from pg_proc where oid=('public.'||routine.signature)::regprocedure;
    if md5(installed) is distinct from routine.body_md5 then
      raise exception 'Unexpected installed routine; measurement area was not applied: %',routine.signature;
    end if;
  end loop;
end;
$baseline$;

alter table public.projects add column measurement_branch text;
alter table public.projects add constraint projects_measurement_branch_check check (
  measurement_branch is null or (
    coalesce(branch in ('Karkh','Rasafa'),false) and measurement_branch in ('Karkh','Rasafa')
  )
);
comment on column public.projects.measurement_branch is
  'Verified Baghdad site area for Outdoor measurements; null retains the originating office. Does not change commercial ownership or Indoor branch access.';

create function public.employee_can_access_project_row(
  actor_user_id uuid,project_branch text,project_creator uuid,outdoor_assignee uuid,
  project_governorate text,project_governorate_office text,project_measurement_branch text
) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((project_measurement_branch is null or (
    project_branch in ('Karkh','Rasafa') and project_measurement_branch in ('Karkh','Rasafa')
  )) and public.employee_can_access_project_row(actor_user_id,
    case when project_branch in ('Karkh','Rasafa') and exists(
      select 1 from public.profiles employee where employee.id=actor_user_id and employee.role::text='Outdoor Sales'
    ) then coalesce(project_measurement_branch,project_branch)
      else public.effective_project_branch(project_branch,project_governorate,project_governorate_office) end,
    project_creator,outdoor_assignee,null),false);
$$;
revoke all on function public.employee_can_access_project_row(uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.employee_can_access_project_row(uuid,text,uuid,uuid,text,text,text) to service_role;

create function public.current_employee_can_access_project_row(
  project_branch text,project_creator uuid,outdoor_assignee uuid,project_governorate text,
  project_governorate_office text,project_measurement_branch text
) returns boolean language sql stable security definer set search_path=public as $$
  select public.employee_can_access_project_row(auth.uid(),project_branch,project_creator,outdoor_assignee,
    project_governorate,project_governorate_office,project_measurement_branch);
$$;
revoke all on function public.current_employee_can_access_project_row(text,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.current_employee_can_access_project_row(text,uuid,uuid,text,text,text) to authenticated,service_role;

-- Both related-row RLS and service RPCs resolve the complete stored project.
-- The older helper overloads keep their legacy geography/assignment behavior.
do $full_row_callers$
declare routine text; definition text; old_call text; new_call text;
begin
  foreach routine in array array['can_access_indoor_project_branch(uuid)',
    'can_access_indoor_client_branch(uuid)','require_indoor_project_branch(uuid,uuid)'] loop
    select pg_get_functiondef(('public.'||routine)::regprocedure) into definition;
    old_call:='public.effective_project_branch(project.branch,project.governorate,project.governorate_office),';
    new_call:='project.branch,';
    if cardinality(string_to_array(definition,old_call))<>2 then raise exception 'Unexpected full-row area caller: %',routine; end if;
    definition:=replace(definition,old_call,new_call);
    old_call:='project.created_by,project.assigned_outdoor_sales_id,null)';
    new_call:='project.created_by,project.assigned_outdoor_sales_id,project.governorate,project.governorate_office,project.measurement_branch)';
    if cardinality(string_to_array(definition,old_call))<>2 then raise exception 'Unexpected full-row area arguments: %',routine; end if;
    execute replace(definition,old_call,new_call);
  end loop;
end;
$full_row_callers$;

do $project_policies$
declare policy_name text; expected text:='current_employee_can_access_project_row(effective_project_branch(branch, governorate, governorate_office), created_by, assigned_outdoor_sales_id, NULL::text)';
begin
  foreach policy_name in array array['employee_branch_boundary','indoor_branch_boundary'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename='projects'
      and policyname=policy_name and qual=expected and with_check=expected and permissive='RESTRICTIVE') then
      raise exception 'Unexpected project branch policy: %',policy_name;
    end if;
    execute format('alter policy %I on public.projects using(public.current_employee_can_access_project_row('
      ||'branch,created_by,assigned_outdoor_sales_id,governorate,governorate_office,measurement_branch)) '
      ||'with check(public.current_employee_can_access_project_row('
      ||'branch,created_by,assigned_outdoor_sales_id,governorate,governorate_office,measurement_branch))',policy_name);
  end loop;
end;
$project_policies$;

-- Browser writes and registration cannot invent a physical-area override.
-- The trusted assignment action supplies a one-update operation context only
-- after locking/validating its selected employee and the current project row.
create function public.protect_project_measurement_branch()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.measurement_branch is not null then
      raise exception using errcode='42501',message='New projects use their originating branch until a measurement area is verified.';
    end if;
  elsif new.measurement_branch is distinct from old.measurement_branch then
    if coalesce(auth.role(),'')<>'service_role'
      or new.measurement_assignment_id is null
      or new.measurement_assignment_id is not distinct from old.measurement_assignment_id
      or current_setting('alumex.measurement_area_assignment',true) is distinct from new.measurement_assignment_id::text then
      raise exception using errcode='42501',message='Use the validated measurement assignment action to change the site area.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_project_measurement_branch() from public,anon,authenticated;
create trigger projects_protect_measurement_branch
before insert or update of measurement_branch on public.projects
for each row execute function public.protect_project_measurement_branch();

do $field_assignment$
declare definition text; old_text text; new_text text;
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  old_text:='edit jsonb; previous jsonb;';
  new_text:=old_text||' measurement_area_context text;';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected field assignment declaration.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$ if p_action='register' then
  if p_payload#>'{project,legacyOutdoorSalesId}'$old$;
  new_text:=$new$ if p_payload ? 'measurementBranch' and (
   p_action<>'assign-measurements' or jsonb_typeof(p_payload->'measurementBranch') is distinct from 'string'
   or p_payload->>'measurementBranch' not in ('Karkh','Rasafa')
 ) then raise exception using errcode='22023',message='Choose Karkh or Rasafa only when assigning measurements.'; end if;
 if p_action='register' then
  if p_payload#>'{project,legacyOutdoorSalesId}'$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected fresh field validation marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$   if p_action in ('ready','assign-measurements') then
    measurement_assignee=$old$;
  new_text:=$new$   if p_action in ('ready','assign-measurements') then
    if p_payload ? 'measurementBranch' and not coalesce(project.branch in ('Karkh','Rasafa'),false) then
      raise exception using errcode='22023',message='Measurement area overrides are only available for Baghdad projects.';
    end if;
    measurement_assignee=$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected assignment origin marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$    if not found then raise exception 'Choose an eligible employee for measurements.'; end if;
    update projects set measurement_delayed=false,assigned_outdoor_sales_id=$old$;
  new_text:=$new$    if not found then raise exception 'Choose an eligible employee for measurements.'; end if;
    if p_action='assign-measurements' and project.branch in ('Karkh','Rasafa')
      and exists(select 1 from public.profiles selected where selected.id=measurement_assignee and selected.role::text='Outdoor Sales')
      and not exists(select 1 from public.profiles selected where selected.id=measurement_assignee
        and selected.role::text='Outdoor Sales' and selected.is_active and selected.status='Active'
        and selected.branch in ('Karkh','Rasafa')
        and public.outdoor_sales_branch_for_date(
          case when selected.outdoor_rotation_start_branch in ('Karkh','Rasafa')
            then selected.outdoor_rotation_start_branch else 'Karkh' end,statement_timestamp())=
          coalesce(p_payload->>'measurementBranch',project.measurement_branch,project.branch)) then
      raise exception using errcode='22023',message='Choose an active Outdoor Sales employee covering the measurement area today.';
    end if;
    if p_action='assign-measurements' then
      measurement_area_context:=current_setting('alumex.measurement_area_assignment',true);
      perform set_config('alumex.measurement_area_assignment',p_operation::text,true);
    end if;
    update projects set measurement_branch=case when p_action='assign-measurements' and p_payload ? 'measurementBranch'
      then p_payload->>'measurementBranch' else measurement_branch end,
     measurement_delayed=false,assigned_outdoor_sales_id=$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected selected employee/atomic assignment marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$    where id=p_project;
   else
    if coalesce(p_payload->>'followUpType'$old$;
  new_text:=$new$    where id=p_project;
    if p_action='assign-measurements' then
      perform set_config('alumex.measurement_area_assignment',coalesce(measurement_area_context,''),true);
    end if;
   else
    if coalesce(p_payload->>'followUpType'$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected assignment context cleanup marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:='''governorate_office'',governorate_office,';
  new_text:=old_text||'''measurement_branch'',measurement_branch,';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected assignment result marker.'; end if;
  execute replace(definition,old_text,new_text);
end;
$field_assignment$;

do $rotation$
declare definition text; change record;
begin
  select pg_get_functiondef('public.rotate_outdoor_measurement_tasks()'::regprocedure) into definition;
  for change in select * from (values
    (') is distinct from project.branch)',') is distinct from coalesce(project.measurement_branch,project.branch))',1),
    (') = project_row.branch',') = coalesce(project_row.measurement_branch,project_row.branch)',2),
    ('pending.branch = project_row.branch','coalesce(pending.measurement_branch,pending.branch) = coalesce(project_row.measurement_branch,project_row.branch)',1),
    ('project_row.branch, project_row.id;','coalesce(project_row.measurement_branch,project_row.branch), project_row.id;',1),
    ('''branch'', project_row.branch, ''effective_at''','''branch'', project_row.branch, ''measurement_branch'', coalesce(project_row.measurement_branch,project_row.branch), ''effective_at''',1)
  ) changes(old_text,new_text,occurrences) loop
    if cardinality(string_to_array(definition,change.old_text))<>change.occurrences+1 then
      raise exception 'Unexpected measurement rotation area marker.';
    end if;
    definition:=replace(definition,change.old_text,change.new_text);
  end loop;
  execute definition;
end;
$rotation$;

do $acknowledgement$
declare definition text;
  old_text text:='project_area:=public.effective_project_branch(project.branch,project.governorate,project.governorate_office);';
  new_text text:='project_area:=case when project.branch in (''Karkh'',''Rasafa'') then coalesce(project.measurement_branch,project.branch)
    else public.effective_project_branch(project.branch,project.governorate,project.governorate_office) end;';
begin
  select pg_get_functiondef('public.acknowledge_hidden_field_receipt(uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected hidden receipt geography marker.'; end if;
  execute replace(definition,old_text,new_text);
end;
$acknowledgement$;

notify pgrst,'reload schema';
commit;
