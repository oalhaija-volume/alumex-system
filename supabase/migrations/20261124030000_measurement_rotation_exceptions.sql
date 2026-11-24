begin;

-- A named employee may receive one Baghdad measurement task outside today's
-- rotation. Its physical area, commercial office and original credit stay put.
do $baseline$
declare routine record; installed text;
begin
  for routine in select * from (values
    ('can_access_indoor_project_branch(uuid)','571232bc4ca97466ddfa3e3ded104e63'),
    ('can_access_indoor_client_branch(uuid)','93ffed37261957edbee1b3dca71a00e2'),
    ('require_indoor_project_branch(uuid,uuid)','50c4ffe410f25d3342613dc633404747'),
    ('rotate_outdoor_measurement_tasks()','2172c8b33c296c858db25a799339becd'),
    ('notify_sales_field_change()','19fbc7f1faf3753f8c90d0476a4a111d'),
    ('sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','312f622c8a768b025da39fa6552f5907')
  ) expected(signature,body_md5) loop
    select prosrc into strict installed from pg_proc where oid=('public.'||routine.signature)::regprocedure;
    if md5(installed) is distinct from routine.body_md5 then
      raise exception 'Unexpected installed routine; measurement exception was not applied: %',routine.signature;
    end if;
  end loop;
end;
$baseline$;

alter table public.projects add column measurement_exception_employee_id uuid,
  add column measurement_exception_assignment_id uuid,add column measurement_exception_reason text;
alter table public.projects add constraint projects_measurement_exception_check check (
  (measurement_exception_employee_id is null and measurement_exception_assignment_id is null and measurement_exception_reason is null)
  or (measurement_exception_employee_id is not null and measurement_exception_assignment_id is not null
    and measurement_exception_reason is not null and length(btrim(measurement_exception_reason)) between 1 and 1000
    and assigned_outdoor_sales_id is not null and measurement_assignment_id is not null
    and measurement_exception_employee_id=assigned_outdoor_sales_id
    and measurement_exception_assignment_id=measurement_assignment_id
    and coalesce(branch in ('Karkh','Rasafa'),false)
    and coalesce(structure_readiness='ready' and sales_status='new_lead',false) and archived_at is null)
);

create function public.employee_has_measurement_rotation_exception(p_actor uuid,p_project uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.projects project join public.profiles employee
    on employee.id=project.measurement_exception_employee_id
    where project.id=p_project and employee.id=p_actor and employee.role::text='Outdoor Sales'
      and employee.is_active and employee.status='Active' and employee.branch in ('Karkh','Rasafa')
      and project.branch in ('Karkh','Rasafa') and coalesce(project.measurement_branch,project.branch) in ('Karkh','Rasafa')
      and project.assigned_outdoor_sales_id=employee.id and project.measurement_assignment_id is not null
      and project.measurement_exception_assignment_id=project.measurement_assignment_id
      and length(btrim(project.measurement_exception_reason)) between 1 and 1000
      and project.structure_readiness='ready' and project.sales_status='new_lead' and project.archived_at is null
      and not exists(select 1 from public.sales_workflows flow where flow.project_id=project.id
        and (flow.signed_at is not null or flow.evidence is not null or flow.accepted_at is not null or flow.accepted_by is not null)));
$$;
revoke all on function public.employee_has_measurement_rotation_exception(uuid,uuid) from public,anon,authenticated;
grant execute on function public.employee_has_measurement_rotation_exception(uuid,uuid) to service_role;

create function public.current_employee_has_measurement_rotation_exception(p_project uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.employee_has_measurement_rotation_exception(auth.uid(),p_project);
$$;
revoke all on function public.current_employee_has_measurement_rotation_exception(uuid) from public,anon;
grant execute on function public.current_employee_has_measurement_rotation_exception(uuid) to authenticated,service_role;

-- The normal seven-argument geography helper stays unchanged. Only a complete
-- stored project can prove this exact employee + assignment exception.
do $project_guards$
declare routine text; definition text; old_text text; new_text text;
begin
  foreach routine in array array['can_access_indoor_project_branch(uuid)','can_access_indoor_client_branch(uuid)',
    'require_indoor_project_branch(uuid,uuid)'] loop
    select pg_get_functiondef(('public.'||routine)::regprocedure) into definition;
    old_text:=case when routine='require_indoor_project_branch(uuid,uuid)'
      then 'public.employee_can_access_project_row(actor_user_id,' else 'public.current_employee_can_access_project_row(' end;
    if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception project guard: %',routine; end if;
    definition:=replace(definition,old_text,'('||old_text);
    old_text:='project.measurement_branch)';
    new_text:=case when routine='require_indoor_project_branch(uuid,uuid)'
      then 'project.measurement_branch) or public.employee_has_measurement_rotation_exception(actor_user_id,project.id))'
      else 'project.measurement_branch) or public.current_employee_has_measurement_rotation_exception(project.id))' end;
    if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception task context: %',routine; end if;
    execute replace(definition,old_text,new_text);
  end loop;
end;
$project_guards$;

do $project_policies$
declare policy_name text; expected text:='current_employee_can_access_project_row(branch, created_by, assigned_outdoor_sales_id, governorate, governorate_office, measurement_branch)';
begin
  foreach policy_name in array array['employee_branch_boundary','indoor_branch_boundary'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename='projects'
      and policyname=policy_name and qual=expected and with_check=expected and permissive='RESTRICTIVE') then
      raise exception 'Unexpected project policy; task exception was not applied: %',policy_name;
    end if;
    execute format('alter policy %I on public.projects using(public.current_employee_can_access_project_row('
      ||'branch,created_by,assigned_outdoor_sales_id,governorate,governorate_office,measurement_branch) '
      ||'or public.current_employee_has_measurement_rotation_exception(id)) '
      ||'with check(public.current_employee_can_access_project_row('
      ||'branch,created_by,assigned_outdoor_sales_id,governorate,governorate_office,measurement_branch) '
      ||'or public.current_employee_has_measurement_rotation_exception(id))',policy_name);
  end loop;
end;
$project_policies$;

create function public.protect_measurement_rotation_exception()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.measurement_exception_employee_id is not null or new.measurement_exception_assignment_id is not null
      or new.measurement_exception_reason is not null then
      raise exception using errcode='42501',message='Measurement exceptions must be assigned by Admin.';
    end if;
    return new;
  end if;
  if row(new.measurement_exception_employee_id,new.measurement_exception_assignment_id,new.measurement_exception_reason)
    is distinct from row(old.measurement_exception_employee_id,old.measurement_exception_assignment_id,old.measurement_exception_reason) then
    if coalesce(auth.role(),'')<>'service_role' or new.measurement_assignment_id is null
      or new.measurement_assignment_id is not distinct from old.measurement_assignment_id
      or current_setting('alumex.measurement_area_assignment',true) is distinct from new.measurement_assignment_id::text
      or ((new.measurement_exception_employee_id is not null or new.measurement_exception_assignment_id is not null
        or new.measurement_exception_reason is not null)
        and current_setting('alumex.measurement_rotation_exception',true) is distinct from new.measurement_assignment_id::text) then
      raise exception using errcode='42501',message='Measurement exceptions must use the validated Admin assignment action.';
    end if;
  end if;
  -- Ordinary reassignment or task completion invalidates the old context.
  if new.measurement_exception_employee_id is not null and (
    new.assigned_outdoor_sales_id is distinct from new.measurement_exception_employee_id
    or new.measurement_assignment_id is distinct from new.measurement_exception_assignment_id
    or new.structure_readiness is distinct from 'ready' or new.sales_status is distinct from 'new_lead'
    or new.archived_at is not null) then
    new.measurement_exception_employee_id:=null;
    new.measurement_exception_assignment_id:=null;
    new.measurement_exception_reason:=null;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_measurement_rotation_exception() from public,anon,authenticated;
create trigger projects_protect_measurement_rotation_exception before insert or update on public.projects
for each row execute function public.protect_measurement_rotation_exception();

do $assignment$
declare definition text; old_text text; new_text text;
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  old_text:='measurement_area_context text;';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception declaration marker.'; end if;
  definition:=replace(definition,old_text,old_text||' measurement_exception_context text;');
  old_text:=' if p_payload ? ''measurementBranch'' and (';
  new_text:=$new$ if p_payload ? 'measurementExceptionReason' then
   if p_action<>'assign-measurements' then raise exception using errcode='22023',message='Measurement exceptions are only available when assigning measurements.'; end if;
   if actor_role<>'Admin' then raise exception using errcode='42501',message='Only Admin can approve a measurement rotation exception.'; end if;
   if jsonb_typeof(p_payload->'measurementExceptionReason') is distinct from 'string'
     or length(btrim(p_payload->>'measurementExceptionReason')) not between 1 and 1000 then
     raise exception using errcode='22023',message='Enter a measurement exception reason of 1 to 1000 characters.';
   end if;
 end if;
 if p_payload ? 'measurementBranch' and ($new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception validation marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$    if p_action='assign-measurements' and project.branch in ('Karkh','Rasafa')$old$;
  new_text:=$new$    if p_payload ? 'measurementExceptionReason' and (
      not coalesce(project.branch in ('Karkh','Rasafa'),false) or project.archived_at is not null
      or not exists(select 1 from public.profiles selected where selected.id=measurement_assignee
        and selected.role::text='Outdoor Sales' and selected.is_active and selected.status='Active'
        and selected.branch in ('Karkh','Rasafa'))
    ) then raise exception using errcode='22023',message='Choose an active Baghdad Outdoor Sales employee for this exception.'; end if;
    if p_action='assign-measurements' and project.branch in ('Karkh','Rasafa')$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception employee marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$          coalesce(p_payload->>'measurementBranch',project.measurement_branch,project.branch)) then$old$;
  new_text:=$new$          coalesce(p_payload->>'measurementBranch',project.measurement_branch,project.branch))
      and not (actor_role='Admin' and p_payload ? 'measurementExceptionReason') then$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception date-check marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$      perform set_config('alumex.measurement_area_assignment',p_operation::text,true);$old$;
  new_text:=old_text||$new$
      measurement_exception_context:=current_setting('alumex.measurement_rotation_exception',true);
      perform set_config('alumex.measurement_rotation_exception',case when p_payload ? 'measurementExceptionReason' then p_operation::text else '' end,true);$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception operation context.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:='    update projects set measurement_branch=case';
  new_text:=$new$    update projects set
     measurement_exception_employee_id=case when p_action='assign-measurements' and p_payload ? 'measurementExceptionReason' then measurement_assignee end,
     measurement_exception_assignment_id=case when p_action='assign-measurements' and p_payload ? 'measurementExceptionReason' then p_operation end,
     measurement_exception_reason=case when p_action='assign-measurements' and p_payload ? 'measurementExceptionReason' then btrim(p_payload->>'measurementExceptionReason') end,
     measurement_branch=case$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected atomic exception assignment marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:=$old$      perform set_config('alumex.measurement_area_assignment',coalesce(measurement_area_context,''),true);$old$;
  new_text:=old_text||$new$
      perform set_config('alumex.measurement_rotation_exception',coalesce(measurement_exception_context,''),true);$new$;
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception context cleanup marker.'; end if;
  definition:=replace(definition,old_text,new_text);
  old_text:='''measurement_branch'',measurement_branch,';
  new_text:=old_text||'''measurement_exception_employee_id'',measurement_exception_employee_id,''measurement_exception_assignment_id'',measurement_exception_assignment_id,''measurement_exception_reason'',measurement_exception_reason,';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception receipt result marker.'; end if;
  execute replace(definition,old_text,new_text);
end;
$assignment$;

do $rotation_and_notification$
declare definition text; old_text text; new_text text;
begin
  select pg_get_functiondef('public.rotate_outdoor_measurement_tasks()'::regprocedure) into definition;
  old_text:='      and previous.role::text = ''Outdoor Sales'' and previous.branch in (''Karkh'', ''Rasafa'')';
  new_text:=old_text||E'\n      and not public.employee_has_measurement_rotation_exception(project.assigned_outdoor_sales_id,project.id)';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception rotation guard.'; end if;
  execute replace(definition,old_text,new_text);
  select pg_get_functiondef('public.notify_sales_field_change()'::regprocedure) into definition;
  old_text:='      and public.employee_can_access_project_branch(u.id,public.effective_project_branch(project.branch,project.governorate,project.governorate_office))';
  new_text:=old_text||E'\n      and (not public.employee_has_measurement_rotation_exception(project.assigned_outdoor_sales_id,project.id)\n        or u.id=project.measurement_exception_employee_id)';
  if cardinality(string_to_array(definition,old_text))<>2 then raise exception 'Unexpected exception notification guard.'; end if;
  execute replace(definition,old_text,new_text);
end;
$rotation_and_notification$;

notify pgrst,'reload schema';
commit;
