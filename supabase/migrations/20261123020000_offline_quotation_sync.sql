begin;

-- Receipts bind an immutable device operation to its original request. Only
-- the transactional save below can insert one; browsers cannot forge success.
create table public.offline_quotation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null check(action in ('save','save-shared-prices')),
  expected_revision integer not null check(expected_revision>=0),
  original_request jsonb not null check(jsonb_typeof(original_request)='object'),
  recorded_at timestamptz not null,
  synced_at timestamptz not null default now(),
  result jsonb not null
);
create index offline_quotation_receipts_actor_project_idx
  on public.offline_quotation_receipts(actor_id,project_id,synced_at desc);
alter table public.offline_quotation_receipts enable row level security;
revoke all on public.offline_quotation_receipts from public,anon,authenticated,service_role;
grant select on public.offline_quotation_receipts to service_role;

-- A receipt never restores a revoked grant or an inactive employee. The same
-- authorization is checked before both an old receipt and a fresh save.
create function public.require_offline_quotation_access(p_project uuid,p_actor uuid,p_request jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare actor public.profiles; project public.projects;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and (auth.role() is distinct from 'authenticated' or p_actor is distinct from auth.uid()) then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or coalesce(p_request->>'action','') not in ('save','save-shared-prices') then
    raise exception using errcode='22023',message='Only quotation draft saves can be synced offline.';
  end if;
  select * into actor from public.profiles where id=p_actor for share;
  if actor.id is null or actor.is_active is not true or actor.status is distinct from 'Active'
    or public.sales_permission_role(actor.role) is null
    or public.sales_permission_role(actor.role)::text not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then
    raise exception using errcode='42501',message='Quotation access is no longer available to this employee.';
  end if;
  select * into project from public.projects where id=p_project for update;
  if not found or project.archived_at is not null then
    raise exception using errcode='42501',message='Project is no longer available to this employee.';
  end if;
  if public.employee_can_access_project_row(p_actor,
    public.effective_project_branch(project.branch,project.governorate,project.governorate_office),
    project.created_by,project.assigned_outdoor_sales_id,null) then
    perform public.require_indoor_project_branch(p_project,p_actor);
    return 'full';
  end if;
  if actor.role::text='Indoor Sales' and p_request->>'action'='save-shared-prices' then
    perform 1 from public.project_quotation_price_access
      where project_id=p_project and employee_id=p_actor and revoked_at is null for share;
    if found and public.employee_has_quotation_price_access(p_project,p_actor) then return 'prices'; end if;
  end if;
  raise exception using errcode='42501',message='Project is no longer available to this employee.';
end;
$$;
revoke all on function public.require_offline_quotation_access(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.require_offline_quotation_access(uuid,uuid,jsonb) to service_role;

create function public.replay_offline_quotation(
  p_operation uuid,p_actor uuid,p_project uuid,p_request jsonb,p_recorded_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.offline_quotation_receipts;
begin
  if p_operation is null or p_recorded_at is null or not isfinite(p_recorded_at) then
    raise exception using errcode='22023',message='Invalid offline quotation operation.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alumex-offline-quotation:'||p_operation::text,0));
  perform public.require_offline_quotation_access(p_project,p_actor,p_request);
  select * into saved from public.offline_quotation_receipts where operation_id=p_operation;
  if not found then return null; end if;
  if saved.actor_id is distinct from p_actor or saved.project_id is distinct from p_project
    or saved.original_request is distinct from p_request or saved.recorded_at is distinct from p_recorded_at then
    raise exception using errcode='22023',message='Offline quotation operation was already used for different work.';
  end if;
  -- The original save already committed. A later quotation revision/signature
  -- does not turn that successful save into a second write or a false conflict.
  return saved.result||jsonb_build_object('replayed',true);
end;
$$;
revoke all on function public.replay_offline_quotation(uuid,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.replay_offline_quotation(uuid,uuid,uuid,jsonb,timestamptz) to service_role;

create function public.sync_offline_quotation(
  p_operation uuid,p_actor uuid,p_project uuid,p_expected_revision integer,
  p_payload jsonb,p_request jsonb,p_recorded_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare project public.projects; current_flow public.sales_workflows; saved_flow public.sales_workflows;
  prior_result jsonb; response jsonb; with_sizes boolean;
begin
  prior_result:=public.replay_offline_quotation(p_operation,p_actor,p_project,p_request,p_recorded_at);
  if prior_result is not null then return prior_result; end if;
  -- Replay acquired the operation/profile/project/grant locks. Keep every
  -- monetary calculation supplied by trusted server code, never browser policy.
  if p_expected_revision is null or p_expected_revision<0
    or jsonb_typeof(p_request->'revision') is distinct from 'number'
    or (p_request->>'revision')::numeric is distinct from p_expected_revision::numeric
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid offline quotation draft.';
  end if;
  select * into project from public.projects where id=p_project for update;
  select * into current_flow from public.sales_workflows where project_id=p_project for update;
  if coalesce(current_flow.revision,0) is distinct from p_expected_revision then
    raise exception using errcode='40001',message='This project changed. Review the online quotation before syncing your saved draft.';
  end if;
  if project.sales_status in ('cancelled','lost','closed') then
    raise exception using errcode='40001',message='This project is closed. Its quotation history is read-only.';
  end if;
  if project.sales_status in ('contract_signed','transferred_to_operations')
    or current_flow.signed_at is not null or current_flow.evidence is not null
    or current_flow.accepted_at is not null or current_flow.accepted_by is not null
    or (current_flow.stage is not null and current_flow.stage not in ('quotation','approved','contract')) then
    raise exception using errcode='40001',message='Signed contracts cannot be changed.';
  end if;
  if current_flow.stage='contract' and p_request->'replaceUnsignedContract' is distinct from 'true'::jsonb then
    raise exception using errcode='22023',message='Confirm that this revision replaces the unsigned contract and requires new client approval.';
  end if;
  if p_request ? 'openingSizeChanges' and jsonb_typeof(p_request->'openingSizeChanges') is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid opening size changes.';
  end if;
  with_sizes:=p_request->>'action'='save'
    and jsonb_array_length(coalesce(p_request->'openingSizeChanges','[]'::jsonb))>0;
  if with_sizes then
    saved_flow:=public.save_quotation_with_opening_sizes(p_project,p_expected_revision,p_payload,p_actor);
  else
    saved_flow:=public.advance_sales_flow(p_project,'save',p_expected_revision,p_payload,p_actor);
  end if;
  response:=jsonb_build_object('ok',true,'pending',false,'replayed',false,'operationId',p_operation,
    'revision',saved_flow.revision,'flow',to_jsonb(saved_flow)||jsonb_build_object('contract',null,'evidence',null));
  insert into public.offline_quotation_receipts(operation_id,actor_id,project_id,action,expected_revision,original_request,recorded_at,result)
    values(p_operation,p_actor,p_project,p_request->>'action',p_expected_revision,p_request,p_recorded_at,response);
  return response;
end;
$$;
revoke all on function public.sync_offline_quotation(uuid,uuid,uuid,integer,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_offline_quotation(uuid,uuid,uuid,integer,jsonb,jsonb,timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
