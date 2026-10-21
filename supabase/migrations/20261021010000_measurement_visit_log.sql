begin;

alter table public.projects
  add column measurement_delay_reason text
  check (measurement_delay_reason in ('client_delay', 'client_no_answer', 'site_closed'));

-- Legacy rows keep a null reason, displayed as a generic client delay. Avoid
-- a backfill UPDATE that would change updated_at and invalidate queued visits.

-- Protect the reason together with the existing, server-authorized visit fields.
create or replace function public.protect_measurement_delay()
returns trigger language plpgsql set search_path=public as $$
begin
 if coalesce(auth.role(),'') in ('anon','authenticated') and (
   (tg_op='INSERT' and (new.measurement_delayed or new.measurement_delay_reason is not null or new.measurement_delay_note is not null or new.measurement_delayed_at is not null or new.measurement_delayed_by is not null)) or
   (tg_op='UPDATE' and row(new.measurement_delayed,new.measurement_delay_reason,new.measurement_delay_note,new.measurement_delayed_at,new.measurement_delayed_by)
     is distinct from row(old.measurement_delayed,old.measurement_delay_reason,old.measurement_delay_note,old.measurement_delayed_at,old.measurement_delayed_by))) then
  raise exception using errcode='42501',message='Use the measurement visit action to update client delays.';
 end if;
 if new.measurement_delayed and new.sales_status not in ('new_lead','cancelled','lost','closed') then
  raise exception 'Resume measurements before recording or completing them.';
 end if;
 return new;
end $$;

-- Preserve the installed RPC's branch authorization, offline idempotency,
-- measurement validation and existing CRM handoff. Each receipt retains its
-- own outcome even after CRM assigns another visit and the latest state changes.
do $migration$
declare
 definition text;
 validation_marker text := 'if project.measurement_delayed then raise exception ''This project is already delayed by the client.''; end if;';
 update_marker text := 'measurement_delayed=true,measurement_delay_note=trim(p_payload->>''note'')';
 result_marker text := '''measurement_delay_note'',measurement_delay_note';
begin
 select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
 if position(validation_marker in definition)=0 or position(update_marker in definition)=0 or position(result_marker in definition)=0 then
  raise exception 'Unexpected measurement visit RPC definition; visit log migration was not applied.';
 end if;
 definition := replace(definition, validation_marker, validation_marker || $validation$
    if p_payload ? 'reason' and (
      jsonb_typeof(p_payload->'reason') is distinct from 'string'
      or p_payload->>'reason' not in ('client_delay','client_no_answer','site_closed')
    ) then raise exception using errcode='22023',message='Choose a valid visit outcome.'; end if;$validation$);
 definition := replace(definition, update_marker,
   'measurement_delayed=true,measurement_delay_reason=coalesce(p_payload->>''reason'',''client_delay''),measurement_delay_note=trim(p_payload->>''note'')');
 definition := replace(definition, result_marker,
   '''measurement_delay_reason'',measurement_delay_reason,' || result_marker);
 execute definition;
end;
$migration$;

create index field_sync_receipts_measurement_history
  on public.field_sync_receipts(project_id, recorded_at desc, operation_id)
  where action in ('delay-measurements','assign-measurements','ready','request-openings','resume-measurements','finish');
create index field_sync_receipts_visitor_history
  on public.field_sync_receipts(actor_id, operation_id) include (project_id)
  where action in ('delay-measurements', 'finish');

notify pgrst, 'reload schema';
commit;
