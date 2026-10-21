begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); replacement uuid:=gen_random_uuid();
 site uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); first_attempt uuid:=gen_random_uuid();
 stamp timestamptz; saved jsonb; retried jsonb; payload jsonb;
begin
 insert into auth.users(id,email) values (indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(replacement,replacement::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in (outdoor,replacement);
 perform public.sync_field_change(gen_random_uuid(),outdoor,site,'register',
  '{"client":{"clientName":"Visit log test","mobile":"00000000000","clientType":"individual"},"project":{"address":"Baghdad","branch":"Karkh","structureReadiness":"ready","buildingType":"villa_house"}}',now(),null);
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
 select updated_at into stamp from projects where id=site;
 saved:=public.sync_field_change(first_attempt,outdoor,site,'delay-measurements','{"reason":"client_no_answer","note":"Site was closed; client did not answer"}',now(),stamp);
 assert saved->>'measurement_delay_reason'='client_no_answer';
 assert (select measurement_delayed and sales_status='new_lead' and next_follow_up_at is null and follow_up_owner_id=indoor from projects where id=site), 'Incomplete visit must return to its CRM owner';
 retried:=public.sync_field_change(first_attempt,outdoor,site,'delay-measurements','{"reason":"client_no_answer","note":"Site was closed; client did not answer"}',now(),stamp);
 assert retried=saved, 'A replay must not record a duplicate visit';
 assert (select count(*)=1 from field_sync_receipts where operation_id=first_attempt);
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',replacement),now(),stamp);
 assert (select not measurement_delayed and sales_status='new_lead' and assigned_outdoor_sales_id=replacement from projects where id=site);
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(operation,replacement,site,'delay-measurements','{"reason":"site_closed","note":"Second arranged visit also closed"}',now(),stamp);
 assert (select result->>'measurement_delay_reason'='client_no_answer' and result->>'measurement_delay_note'='Site was closed; client did not answer' from field_sync_receipts where operation_id=first_attempt), 'Later attempts must preserve earlier outcome and note';
 assert (select result->>'measurement_delay_reason'='site_closed' from field_sync_receipts where operation_id=operation);
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',replacement),now(),stamp);
 select updated_at into stamp from projects where id=site;
 foreach payload in array array['{"reason":"completed","note":"Invalid"}'::jsonb,'{"reason":null,"note":"Invalid"}'::jsonb] loop
  begin
   perform public.sync_field_change(gen_random_uuid(),replacement,site,'delay-measurements',payload,now(),stamp);
   raise exception using errcode='ZX001',message='Invalid outcome was accepted';
  exception when sqlstate '22023' then null;
  end;
 end loop;
 -- Omitted outcomes from older devices remain valid and retain their original payload hash.
 saved:=public.sync_field_change(gen_random_uuid(),replacement,site,'delay-measurements','{"note":"Client requested next week"}',now(),stamp);
 assert saved->>'measurement_delay_reason'='client_delay';
 raise notice 'PASS: failed visits return to CRM, replay once, preserve outcome history, and accept older queued notes';
end $$;
rollback;
