begin;

create or replace function public.protect_client_cancellation() returns trigger language plpgsql set search_path=public as $$
begin
 if coalesce(auth.role(),'') in ('anon','authenticated') and (
  (tg_op='INSERT' and (new.sales_status='cancelled' or new.client_cancelled_at is not null or new.client_cancellation_note is not null or new.client_cancelled_by is not null)) or
  (tg_op='UPDATE' and (row(new.client_cancelled_at,new.client_cancellation_note,new.client_cancelled_by) is distinct from row(old.client_cancelled_at,old.client_cancellation_note,old.client_cancelled_by)
   or (new.sales_status='cancelled' and old.sales_status is distinct from new.sales_status)))) then
  raise exception using errcode='42501',message='Use the client cancellation action to close this project.';
 end if;
 if tg_op='UPDATE' and old.client_cancelled_at is not null
  and current_setting('alumex.reactivate_project',true) is distinct from old.id::text and (new.sales_status<>'cancelled' or new.client_cancelled_at is distinct from old.client_cancelled_at or new.client_cancellation_note is distinct from old.client_cancellation_note) then
  raise exception 'This project was cancelled by the client. Its history is read-only.';
 end if;
 return new;
end $$;

-- Cancellation leaves the project status and commercial workflow intact.
-- Restore that stage atomically, retaining the cancellation in the activity log.
create or replace function public.reactivate_client_project(
 p_project uuid, p_actor uuid, p_note text, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 actor_role text;
 project public.projects;
 flow public.sales_workflows;
 restored_status text;
 operation uuid := gen_random_uuid();
 result jsonb;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null or actor_role not in ('Indoor Sales','Admin') then
  raise exception using errcode='42501',message='Only Indoor Sales or Admin can reactivate client-cancelled projects.';
 end if;
 if p_note is null or trim(p_note)='' then raise exception 'Enter a reactivation note.'; end if;
 if length(trim(p_note))>2000 then raise exception 'Keep the reactivation note under 2,000 characters.'; end if;
 select * into project from projects where id=p_project for update;
 if not found then raise exception 'Project not found.'; end if;
 if project.sales_status is distinct from 'cancelled' or project.client_cancelled_at is null then
  raise exception 'Only projects cancelled by the client can be reactivated.';
 end if;
 if p_expected_updated_at is null or project.updated_at<>p_expected_updated_at then
  raise exception 'This project changed. Reload before continuing.';
 end if;
 select * into flow from sales_workflows where project_id=p_project for update;
 if flow.signed_at is not null or flow.stage in ('signed','operations') or project.status='Production' then
  raise exception 'Signed projects cannot be reactivated from the sales workspace.';
 end if;
 -- Additional measurements take precedence over an older retained quotation.
 restored_status := case
  when project.additional_openings_state='requested' then 'new_lead'
  when project.additional_openings_state='submitted' then 'ready_for_quotation'
  when flow.stage='contract' then 'contract_generated'
  when flow.stage='approved' then 'quotation_approved'
  when flow.stage='quotation' then 'quotation_in_progress'
  when project.status='Quotation' then 'ready_for_quotation'
  else 'new_lead' end;
 perform set_config('alumex.reactivate_project',p_project::text,true);
 update projects set sales_status=restored_status,
  client_cancelled_at=null,client_cancelled_by=null,client_cancellation_note=null,
  measurement_delayed=false,
  measurement_assignment_id=case when restored_status='new_lead' and structure_readiness='ready' then operation else measurement_assignment_id end,
  follow_up_owner_id=coalesce(follow_up_owner_id,case when actor_role='Indoor Sales' then p_actor end)
 where id=p_project;
 perform set_config('alumex.reactivate_project','',true);
 -- Invalidate commercial forms opened before reactivation without modifying their content.
 update sales_workflows set revision=revision+1,updated_at=now() where project_id=p_project;
 select jsonb_build_object('id',id,'sales_status',sales_status,'updated_at',updated_at,
  'reactivation_note',trim(p_note),'client_cancellation_note',project.client_cancellation_note,
  'client_cancelled_at',project.client_cancelled_at,'client_cancelled_by',project.client_cancelled_by)
 into result from projects where id=p_project;
 insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
 values(operation,p_actor,p_project,'reactivate-project',md5(trim(p_note)||p_project::text),now(),result);
 return result;
end $$;
revoke all on function public.reactivate_client_project(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reactivate_client_project(uuid,uuid,text,timestamptz) to service_role;

commit;
