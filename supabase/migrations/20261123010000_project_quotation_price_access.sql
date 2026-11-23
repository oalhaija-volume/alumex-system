begin;

-- Sharing a quotation does not transfer its project, follow-up responsibility,
-- or the originating branch. Grants are explicit, employee-specific and revocable.
create table public.project_quotation_price_access (
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  primary key(project_id,employee_id)
);
create index project_quotation_price_access_employee_idx
  on public.project_quotation_price_access(employee_id,project_id)
  where revoked_at is null;
alter table public.project_quotation_price_access enable row level security;
revoke all on public.project_quotation_price_access from public,anon,authenticated,service_role;
grant select on public.project_quotation_price_access to authenticated;
grant select,insert,update on public.project_quotation_price_access to service_role;
create policy quotation_price_access_employee_read
  on public.project_quotation_price_access for select to authenticated
  using(employee_id=auth.uid() and revoked_at is null and exists(
    select 1 from public.profiles employee where employee.id=auth.uid()
      and employee.role::text='Indoor Sales' and employee.is_active and employee.status='Active'
  ));

create function public.audit_project_quotation_price_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,reason)
  values(auth.uid(),(select role from public.profiles where id=auth.uid()),
    case when tg_op='INSERT' then 'project_quotation_price_access_granted'
      when new.revoked_at is not null then 'project_quotation_price_access_revoked'
      else 'project_quotation_price_access_changed' end,
    'project',new.project_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.reason);
  return new;
end;
$$;
revoke all on function public.audit_project_quotation_price_access() from public,anon,authenticated,service_role;
create trigger project_quotation_price_access_audit
  after insert or update on public.project_quotation_price_access
  for each row execute function public.audit_project_quotation_price_access();

create function public.employee_has_quotation_price_access(p_project uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.project_quotation_price_access access
    join public.profiles employee on employee.id=access.employee_id
    join public.projects project on project.id=access.project_id
    where access.project_id=p_project and access.employee_id=p_employee and access.revoked_at is null
      and employee.role::text='Indoor Sales' and employee.is_active and employee.status='Active'
      and project.archived_at is null
  );
$$;
revoke all on function public.employee_has_quotation_price_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.employee_has_quotation_price_access(uuid,uuid) to service_role;

-- Compare the complete saved document, ignoring only the explicitly editable
-- charge prices and their derived totals. Glass, extras (including motors),
-- quantities, dimensions, products, options and all other metadata stay exact.
create function public.quotation_price_access_shape(snapshot jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare shape jsonb; entries jsonb; entry jsonb;
begin
  if jsonb_typeof(snapshot) is distinct from 'object'
    or jsonb_typeof(snapshot->'lines') is distinct from 'array'
    or (snapshot ? 'additionalItems' and jsonb_typeof(snapshot->'additionalItems') is distinct from 'array') then
    raise exception using errcode='22023',message='Invalid shared quotation document.';
  end if;
  shape:=snapshot-array['total','createdAt','preparedBy','version','discount'];
  entries:='[]'::jsonb;
  for entry in select value from jsonb_array_elements(snapshot->'lines') loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'system') is distinct from 'object' then
      raise exception using errcode='22023',message='Invalid shared quotation document.';
    end if;
    entries:=entries||jsonb_build_array((entry-'total')||jsonb_build_object(
      'system',(entry->'system')-array['rate','total','rateSource']));
  end loop;
  shape:=jsonb_set(shape,'{lines}',entries);
  if snapshot ? 'additionalItems' then
    entries:='[]'::jsonb;
    for entry in select value from jsonb_array_elements(snapshot->'additionalItems') loop
      if jsonb_typeof(entry) is distinct from 'object' then
        raise exception using errcode='22023',message='Invalid shared quotation document.';
      end if;
      entries:=entries||jsonb_build_array(entry-array['rate','total','rateSource']);
    end loop;
    shape:=jsonb_set(shape,'{additionalItems}',entries);
  end if;
  return shape;
end;
$$;
revoke all on function public.quotation_price_access_shape(jsonb) from public,anon,authenticated;
grant execute on function public.quotation_price_access_shape(jsonb) to service_role;

create function public.require_quotation_action_access(p_project uuid,p_actor uuid,p_action text,p_payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  project public.projects;
  flow public.sales_workflows;
  line jsonb;
  charge jsonb;
  previous_charge jsonb;
  charge_total numeric;
  expected_line_total numeric;
  subtotal numeric:=0;
  expected_total numeric;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or p_actor is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  -- Match the ordinary branch guard's lock order. Concurrent deactivation,
  -- revocation and quotation saves cannot race a successful permission check.
  perform 1 from public.profiles where id=p_actor for share;
  select * into project from public.projects where id=p_project for update;
  if not found then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
  if public.employee_can_access_project_row(p_actor,
    public.effective_project_branch(project.branch,project.governorate,project.governorate_office),
    project.created_by,project.assigned_outdoor_sales_id,null) then
    perform public.require_indoor_project_branch(p_project,p_actor);
    return;
  end if;
  if p_action is distinct from 'save' then
    raise exception using errcode='42501',message='Shared project access allows quotation price edits only.';
  end if;
  perform 1 from public.project_quotation_price_access
    where project_id=p_project and employee_id=p_actor and revoked_at is null for share;
  if not found or not public.employee_has_quotation_price_access(p_project,p_actor) then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
  select * into flow from public.sales_workflows where project_id=p_project for update;
  if not found or flow.quotation is null or flow.quotation='null'::jsonb then
    raise exception using errcode='42501',message='Shared price access requires a saved quotation.';
  end if;
  if project.sales_status in ('cancelled','lost','closed') then
    raise exception 'This project is closed. Its quotation and contract history is read-only.';
  end if;
  if project.sales_status in ('contract_signed','transferred_to_operations')
    or flow.signed_at is not null or flow.evidence is not null
    or flow.accepted_at is not null or flow.accepted_by is not null
    or flow.stage is null or flow.stage not in ('quotation','approved','contract') then
    raise exception 'Signed contracts cannot be changed.';
  end if;
  if project.additional_openings_state is not null then
    raise exception 'Complete the additional measurements and save a quotation revision before continuing.';
  end if;
  if public.quotation_price_access_shape(p_payload) is distinct from public.quotation_price_access_shape(flow.quotation)
    or (p_payload ? 'discount' and p_payload->'discount' is distinct from flow.quotation->'discount') then
    raise exception using errcode='42501',message='Shared project access allows quotation price edits only.';
  end if;
  -- Newly edited prices use whole IQD and their correctly rounded totals.
  -- Unchanged historical catalog charges may retain fractional recorded rates.
  for charge,previous_charge in
    select candidate.entry->'system',previous.entry->'system'
      from jsonb_array_elements(p_payload->'lines') with ordinality candidate(entry,ordinal)
      join jsonb_array_elements(flow.quotation->'lines') with ordinality previous(entry,ordinal) using(ordinal)
    union all
    select candidate.entry,previous.entry
      from jsonb_array_elements(coalesce(p_payload->'additionalItems','[]'::jsonb)) with ordinality candidate(entry,ordinal)
      join jsonb_array_elements(coalesce(flow.quotation->'additionalItems','[]'::jsonb)) with ordinality previous(entry,ordinal) using(ordinal)
  loop
    if charge is not distinct from previous_charge then continue; end if;
    if jsonb_typeof(charge->'rate') is distinct from 'number'
      or jsonb_typeof(charge->'quantity') is distinct from 'number'
      or jsonb_typeof(charge->'total') is distinct from 'number'
      or charge->>'rateSource' is distinct from 'quotation' then
      raise exception using errcode='22023',message='Invalid shared quotation price.';
    end if;
    charge_total:=(charge->>'total')::numeric;
    if (charge->>'rate')::numeric<=0 or (charge->>'rate')::numeric>9007199254740991
      or (charge->>'rate')::numeric<>trunc((charge->>'rate')::numeric)
      or (charge->>'quantity')::numeric<=0
      or charge_total<=0 or charge_total>9007199254740991 or charge_total<>trunc(charge_total)
      or charge_total is distinct from round((charge->>'rate')::numeric*(charge->>'quantity')::numeric) then
      raise exception using errcode='22023',message='Invalid shared quotation price.';
    end if;
  end loop;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
    select coalesce(sum((value->>'total')::numeric),0) into expected_line_total
      from jsonb_array_elements(coalesce(line->'extras','[]'::jsonb));
    expected_line_total:=expected_line_total+(line#>>'{system,total}')::numeric
      +coalesce((line#>>'{glass,total}')::numeric,0);
    if jsonb_typeof(line->'total') is distinct from 'number'
      or (line->>'total')::numeric is distinct from expected_line_total then
      raise exception using errcode='22023',message='Invalid shared quotation total.';
    end if;
    subtotal:=subtotal+expected_line_total;
  end loop;
  for charge in select value from jsonb_array_elements(coalesce(p_payload->'additionalItems','[]'::jsonb)) loop
    select coalesce(sum((value->>'total')::numeric),0) into charge_total
      from jsonb_array_elements(coalesce(charge->'extras','[]'::jsonb));
    subtotal:=subtotal+(charge->>'total')::numeric+charge_total;
  end loop;
  expected_total:=subtotal;
  if p_payload ? 'discount' then
    if p_payload#>>'{discount,percent}' is distinct from '5'
      or (p_payload#>>'{discount,subtotal}')::numeric is distinct from subtotal
      or (p_payload#>>'{discount,amount}')::numeric is distinct from round(subtotal/20) then
      raise exception using errcode='22023',message='Invalid shared quotation total.';
    end if;
    expected_total:=subtotal-round(subtotal/20);
  end if;
  if jsonb_typeof(p_payload->'total') is distinct from 'number'
    or (p_payload->>'total')::numeric is distinct from expected_total
    or expected_total<=0 or expected_total>9007199254740991 then
    raise exception using errcode='22023',message='Invalid shared quotation total.';
  end if;
end;
$$;
revoke all on function public.require_quotation_action_access(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.require_quotation_action_access(uuid,uuid,text,jsonb) to service_role;

-- Narrowly extend the existing commercial transaction. Every ordinary CRM,
-- client, measurement, project and contract-detail writer keeps its branch guard.
do $quotation_price_access$
declare
  definition text;
  anchor text:='perform public\.require_indoor_project_branch\([[:space:]]*p_project[[:space:]]*,[[:space:]]*p_actor[[:space:]]*\);';
  replacement text:='perform public.require_quotation_action_access(p_project,p_actor,p_action,p_payload);';
  matches integer;
begin
  select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure) into definition;
  if position(replacement in definition)>0 then return; end if;
  select count(*) into matches from regexp_matches(definition,anchor,'g');
  if matches<>1
    or position('This project changed. Reload before continuing.' in definition)=0
    or position('Signed contracts cannot be changed.' in definition)=0
    or position('insert into quotation_revisions' in definition)=0 then
    raise exception 'Unexpected sales workflow definition; quotation price sharing was not applied.';
  end if;
  execute regexp_replace(definition,anchor,replacement);
end;
$quotation_price_access$;

notify pgrst,'reload schema';
commit;
