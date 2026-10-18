begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_outdoor uuid:=gen_random_uuid();
 site uuid; first_site uuid; opening uuid:=gen_random_uuid(); op uuid; stamp timestamptz;
 result jsonb; again jsonb; payload jsonb; action text; phase text;
begin
 insert into auth.users(id,email) values(indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(other_outdoor,other_outdoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,other_outdoor);
 site:=gen_random_uuid(); first_site:=site;
 payload:=jsonb_build_object('client',jsonb_build_object('clientName','Client outcome test','mobile','00000000000','clientType','individual'),
  'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,'structureReadiness','ready','assignedOutdoorSalesId',outdoor));
 perform sync_field_change(gen_random_uuid(),indoor,site,'register',payload,now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_build_object('id',opening,'floor','Ground','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding'),now(),null);
 select updated_at into stamp from projects where id=site;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements','{"note":"Client wants next week"}',now(),stamp);
 select updated_at into stamp from projects where id=site;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'resume-measurements','{}',now(),stamp);
  raise exception using errcode='ZX001',message='Outdoor resumed a CRM visit';
 exception when sqlstate 'P0001' then assert sqlerrm='CRM access is limited to Indoor Sales and company leadership.';
 end;
 op:=gen_random_uuid();
 result:=sync_field_change(op,indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',other_outdoor),now(),stamp);
 assert not (result->>'measurement_delayed')::boolean and result->>'assigned_outdoor_sales_id'=other_outdoor::text;
 assert result->>'measurement_assignment_id'=op::text and result->>'measurement_delay_note'='Client wants next week';
 select updated_at into stamp from projects where id=site;
 -- Direct browser writes must not bypass the confirmed, audited action.
 perform set_config('request.jwt.claim.sub',other_outdoor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_outdoor,'role','authenticated')::text,true);
 set local role authenticated;
 begin
  update projects set sales_status='cancelled',client_cancellation_note='Bypass',client_cancelled_at=now(),client_cancelled_by=other_outdoor where id=site;
  raise exception using errcode='ZX001',message='Direct cancellation bypassed the action';
 exception when sqlstate '42501' then null;
 end;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'cancel-project','{"note":"Forged cancellation","confirmed":true}',now(),stamp);
  raise exception using errcode='ZX001',message='Former assignee cancelled the project';
 exception when sqlstate 'P0001' then null;
 end;
 foreach payload in array array['{}'::jsonb,'{"note":"","confirmed":true}'::jsonb,'{"note":55,"confirmed":true}'::jsonb,'{"note":"Reason","confirmed":false}'::jsonb,jsonb_build_object('note',repeat('x',2001),'confirmed',true)] loop
  begin
   perform sync_field_change(gen_random_uuid(),other_outdoor,site,'cancel-project',payload,now(),stamp);
   raise exception using errcode='ZX001',message='Invalid cancellation accepted';
  exception when sqlstate 'P0001' then null;
  end;
 end loop;
 begin
  perform sync_field_change(gen_random_uuid(),other_outdoor,site,'cancel-project','{"note":"Stale","confirmed":true}',now(),'2000-01-01');
  raise exception using errcode='ZX001',message='Stale cancellation accepted';
 exception when sqlstate 'P0001' then null;
 end;
 op:=gen_random_uuid();
 result:=sync_field_change(op,other_outdoor,site,'cancel-project','{"note":"Client no longer needs the project","confirmed":true}','2026-10-18T09:00:00Z',stamp);
 assert result->>'sales_status'='cancelled' and result->>'client_cancelled_by'=other_outdoor::text;
 assert (result->>'client_cancelled_at')::timestamptz='2026-10-18T09:00:00Z'::timestamptz;
 again:=sync_field_change(op,other_outdoor,site,'cancel-project','{"note":"Client no longer needs the project","confirmed":true}','2026-10-18T09:00:00Z',stamp);
 assert again=result, 'Cancellation retry must be idempotent';
 assert (select count(*)=1 from openings where project_id=site);
 assert (select branch='Karkh' and created_by=indoor and next_follow_up_at is null from projects where id=site);
 foreach action in array array['opening','finish','reopen','assign-measurements','follow-up','delay-measurements','resume-measurements'] loop
  begin
   perform sync_field_change(gen_random_uuid(),indoor,site,action,'{}',now(),stamp);
   raise exception using errcode='ZX001',message='Cancelled project continued active work';
  exception when sqlstate 'P0001' or sqlstate '42501' then null;
  end;
 end loop;
 foreach action in array array['save','approve','contract','sign','accept'] loop
  begin
   perform advance_sales_flow(site,action,0,'{}',indoor);
   raise exception using errcode='ZX001',message='Cancelled project continued commercial work';
  exception when sqlstate 'P0001' then assert sqlerrm='This project is closed. Its quotation and contract history is read-only.';
  end;
 end loop;
 begin
  update projects set sales_status='new_lead',client_cancelled_at=null where id=site;
  raise exception using errcode='ZX001',message='Cancellation history was cleared';
 exception when sqlstate 'P0001' then null;
 end;

 -- CRM can cancel an unsigned quotation; signed records remain protected.
 foreach phase in array array['quotation_in_progress','transferred_to_operations'] loop
  site:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,structure_readiness,sales_status)
   select site,client_id,'Cancellation phase test','TEST-'||site,indoor,other_outdoor,'ready',phase from projects where id=first_site;
  insert into sales_workflows(project_id,stage,quotation,signed_at) values(site,case when phase='quotation_in_progress' then 'quotation' else 'signed' end,'{"total":100}',case when phase='transferred_to_operations' then now() end);
  select updated_at into stamp from projects where id=site;
  if phase='quotation_in_progress' then
   perform sync_field_change(gen_random_uuid(),indoor,site,'cancel-project','{"note":"Client declined","confirmed":true}',now(),stamp);
   assert (select quotation->>'total'='100' from sales_workflows where project_id=site), 'Quotation history must be retained';
  else
   begin
    perform sync_field_change(gen_random_uuid(),indoor,site,'cancel-project','{"note":"Signed project","confirmed":true}',now(),stamp);
    raise exception using errcode='ZX001',message='Signed project cancellation was accepted';
   exception when sqlstate '42501' then null;
   end;
  end if;
 end loop;
 raise notice 'PASS: delay returns to CRM, Outdoor resume blocked, reassignment releases visit, confirmed cancellation is scoped/idempotent, records retained, closed work locked, signed projects protected';
end $$;
rollback;
