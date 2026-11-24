begin;

-- Rotation controls today's project visibility, independently of the stored
-- creator, sales credit and measurement assignee. Keep static assignment
-- eligibility and the employee's configured rotation calendar unchanged.
-- Full-row callers already resolve governorate_office before this five-argument
-- helper; do not replace those callers or the legacy Najaf routing semantics.
do $current_area$
declare
  routine oid := 'public.employee_can_access_project_row(uuid,text,uuid,uuid,text)'::regprocedure;
  installed text;
  definition text;
  expected text := $expected$
  select exists(select 1 from public.profiles employee where employee.id=actor_user_id
    and employee.is_active and employee.status='Active'
    and (employee.role::text in ('Admin','Sales Director','Company Owner')
      or (public.effective_project_branch(project_branch,project_governorate)='Najaf' and employee.branch='Najaf')
      or (employee.branch in ('Karkh','Rasafa')
        and public.effective_project_branch(project_branch,project_governorate) in ('Karkh','Rasafa','Governorates')
        and (public.project_branch_matches_employee(employee.branch,project_branch)
          or (employee.role::text='Outdoor Sales'
            and (project_branch in ('Karkh','Rasafa') or project_creator=employee.id
              or public.is_outdoor_assignment_member(employee.id,outdoor_assignee)))))));
$expected$;
  marker text := '    and employee.is_active and employee.status=''Active''';
  restriction text := $restriction$
    and case when employee.role::text='Outdoor Sales'
      and employee.branch in ('Karkh','Rasafa')
      and public.effective_project_branch(project_branch,project_governorate) in ('Karkh','Rasafa')
      then public.effective_project_branch(project_branch,project_governorate)=
        public.outdoor_sales_branch_for_date(
          case when employee.outdoor_rotation_start_branch in ('Karkh','Rasafa')
            then employee.outdoor_rotation_start_branch else 'Karkh' end,statement_timestamp())
      else true end$restriction$;
begin
  select prosrc,pg_get_functiondef(oid) into strict installed,definition
    from pg_proc where oid=routine and prosecdef and provolatile='s'
      and prolang=(select oid from pg_language where lanname='sql');
  if btrim(installed) is distinct from btrim(expected)
    or (length(installed)-length(replace(installed,marker,'')))/length(marker)<>1 then
    raise exception 'Unexpected project visibility helper; Outdoor current-area restriction was not applied.';
  end if;
  -- Replacing only the body preserves the installed signature, owner, ACL,
  -- security-definer flag, search path and every existing caller/policy.
  execute replace(definition,installed,replace(installed,marker,marker||restriction));
end;
$current_area$;

-- A lost response must not leave already committed field work in the device
-- queue forever after rotation. This acknowledges only an exact old operation;
-- it never returns its saved project snapshot and cannot perform a fresh save.
create function public.acknowledge_hidden_field_receipt(
  p_operation uuid,p_actor uuid,p_project uuid,p_action text,p_payload jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare actor public.profiles; project public.projects; project_area text;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception using errcode='42501',message='Only the service may acknowledge saved field work.';
  end if;
  if p_operation is null or p_actor is null or p_project is null or p_action is null or p_payload is null then
    return false;
  end if;
  select * into actor from public.profiles where id=p_actor for share;
  if actor.id is null or actor.role::text is distinct from 'Outdoor Sales'
    or actor.is_active is not true or actor.status is distinct from 'Active'
    or actor.branch is null or actor.branch not in ('Karkh','Rasafa') then return false; end if;
  select * into project from public.projects where id=p_project for share;
  if not found then return false; end if;
  project_area:=public.effective_project_branch(project.branch,project.governorate,project.governorate_office);
  if project_area is null or project_area not in ('Karkh','Rasafa')
    or not public.employee_can_access_project_branch(p_actor,project_area)
    or project_area is not distinct from public.outdoor_sales_branch_for_date(
      case when actor.outdoor_rotation_start_branch in ('Karkh','Rasafa')
        then actor.outdoor_rotation_start_branch else 'Karkh' end,statement_timestamp()) then
    return false;
  end if;
  perform 1 from public.field_sync_receipts saved
    where saved.operation_id=p_operation and saved.actor_id=p_actor and saved.project_id=p_project
      and saved.action=p_action and saved.payload_hash=md5(p_payload::text||p_action||p_project::text)
    for share;
  return found;
end;
$$;
revoke all on function public.acknowledge_hidden_field_receipt(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.acknowledge_hidden_field_receipt(uuid,uuid,uuid,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
