begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_outdoor uuid:=gen_random_uuid();
 site uuid:=gen_random_uuid(); opening uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid();
 stamp timestamptz; result jsonb; receipt jsonb; action text; note jsonb;
begin
 insert into auth.users(id,email) values (indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(other_outdoor,other_outdoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in (outdoor,other_outdoor);
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'register',
  jsonb_build_object('client',jsonb_build_object('clientName','Delayed visit test','mobile','00000000000','clientType','individual'),
   'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,'structureReadiness','ready','assignedOutdoorSalesId',outdoor)),now(),null);
 perform public.sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_build_object('id',opening,'floor','Ground','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding'),now(),null);
 select updated_at into stamp from projects where id=site;
 foreach note in array array['{}'::jsonb,'{"note":"  "}'::jsonb,'{"note":123}'::jsonb,jsonb_build_object('note',repeat('x',2001))] loop
  begin
   perform public.sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements',note,now(),stamp);
   raise exception using errcode='ZX001',message='Invalid delay note accepted';
  exception when sqlstate 'P0001' then null;
  end;
 end loop;
 begin
  perform public.sync_field_change(gen_random_uuid(),indoor,site,'delay-measurements','{"note":"Forged report"}',now(),stamp);
  raise exception using errcode='ZX001',message='Indoor employee reported an Outdoor visit';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.sync_field_change(gen_random_uuid(),other_outdoor,site,'delay-measurements','{"note":"Forged report"}',now(),stamp);
  raise exception using errcode='ZX001',message='Unassigned Outdoor employee reported a visit';
 exception when sqlstate 'P0001' then null;
 end;
 begin
  perform public.sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements','{"note":"Stale visit"}',now(),'2000-01-01');
  raise exception using errcode='ZX001',message='Stale visit accepted';
 exception when sqlstate 'P0001' then null;
 end;
 result:=public.sync_field_change(operation,outdoor,site,'delay-measurements','{"note":"  Client asked us to return next week  "}','2026-10-18T09:00:00Z',stamp);
 assert (result->>'measurement_delayed')::boolean and result->>'measurement_delay_note'='Client asked us to return next week';
 assert result->>'measurement_delayed_by'=outdoor::text;
 assert (result->>'measurement_delayed_at')::timestamptz='2026-10-18T09:00:00Z'::timestamptz;
 assert (select assigned_outdoor_sales_id=outdoor and branch='Rasafa' and sales_status='new_lead' and structure_readiness='ready' from projects where id=site);
 receipt:=public.sync_field_change(operation,outdoor,site,'delay-measurements','{"note":"  Client asked us to return next week  "}','2026-10-18T09:00:00Z',stamp);
 assert receipt=result, 'Lost responses must not duplicate a delay';
 foreach action in array array['opening','finish','reopen'] loop
  begin
   perform public.sync_field_change(gen_random_uuid(),outdoor,site,action,'{}',now(),stamp);
   raise exception using errcode='ZX001',message='Delayed measurements could be changed';
  exception when sqlstate 'P0001' then assert sqlerrm='Resume measurements before recording or completing them.';
  end;
 end loop;
 begin
  update projects set sales_status='ready_for_quotation' where id=site;
  raise exception using errcode='ZX001',message='Direct completion bypassed the delay';
 exception when sqlstate 'P0001' then null;
 end;
 begin
  update openings set width=121 where id=opening;
  raise exception using errcode='ZX001',message='Direct opening update bypassed the delay';
 exception when sqlstate 'P0001' then null;
 end;
 assert (select count(*)=1 from openings where project_id=site), 'Existing measurements are retained';

 -- Authenticated users cannot forge or clear delay metadata outside the RPC.
 perform set_config('request.jwt.claim.sub',outdoor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outdoor,'role','authenticated')::text,true);
 set local role authenticated;
 begin
  update projects set measurement_delayed=false where id=site;
  raise exception using errcode='ZX001',message='Direct browser delay update accepted';
 exception when sqlstate '42501' then null;
 end;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);

 select updated_at into stamp from projects where id=site;
 result:=public.sync_field_change(gen_random_uuid(),indoor,site,'resume-measurements','{}',now(),stamp);
 assert not (result->>'measurement_delayed')::boolean;
 assert result->>'measurement_delay_note'='Client asked us to return next week', 'Last visit report must remain recorded';
 perform public.sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 begin
  perform public.sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements','{"note":"Too late"}',now(),stamp);
  raise exception using errcode='ZX001',message='Completed measurements could be delayed';
 exception when sqlstate 'P0001' then null;
 end;
 raise notice 'PASS: delay permissions, validation, stale writes, idempotency, recording time, assignment/branch preservation, paused measurement protection, resume, and completion';
end $$;
rollback;
