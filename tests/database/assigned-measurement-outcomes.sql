begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_outdoor uuid:=gen_random_uuid();
 site uuid:=gen_random_uuid(); crm_site uuid:=gen_random_uuid(); operation uuid;
 stamp timestamptz; result jsonb; action text; assignee uuid;
begin
 insert into auth.users(id,email) values (indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(other_outdoor,other_outdoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in (outdoor,other_outdoor);
 perform public.sync_field_change(gen_random_uuid(),outdoor,site,'register',
  '{"client":{"clientName":"Assignment outcome test","mobile":"00000000000","clientType":"individual"},"project":{"address":"Baghdad","structureReadiness":"ready","buildingType":"villa_house"}}',now(),null);
 assert (select assigned_outdoor_sales_id is null and created_by=outdoor from projects where id=site);
 foreach assignee in array array[null::uuid,other_outdoor] loop
  if assignee is not null then
   select updated_at into stamp from projects where id=site;
   perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',assignee),now(),stamp);
  end if;
  select updated_at into stamp from projects where id=site;
  foreach action in array array['delay-measurements','cancel-project'] loop
   operation:=gen_random_uuid();
   begin
    perform public.sync_field_change(operation,outdoor,site,action,'{"note":"Client request","confirmed":true}',now(),stamp);
    raise exception using errcode='ZX001',message='Creator without their own assignment reported a client outcome';
   exception when sqlstate '42501' then null;
   end;
   assert not exists(select 1 from field_sync_receipts where operation_id=operation);
   assert (select sales_status='new_lead' and not measurement_delayed and client_cancellation_note is null and updated_at=stamp from projects where id=site);
  end loop;
 end loop;
 -- Once assigned to the creator, the same visit actions become available.
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
 select updated_at into stamp from projects where id=site;
 result:=public.sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements','{"note":"Client requested another visit"}',now(),stamp);
 assert (result->>'measurement_delayed')::boolean;
 select updated_at into stamp from projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
 select updated_at into stamp from projects where id=site;
 result:=public.sync_field_change(gen_random_uuid(),outdoor,site,'cancel-project','{"note":"Client cancelled","confirmed":true}',now(),stamp);
 assert result->>'sales_status'='cancelled';
 -- CRM may still close an unassigned project at the client's request.
 perform public.sync_field_change(gen_random_uuid(),outdoor,crm_site,'register',
  '{"client":{"clientName":"CRM outcome test","mobile":"00000000000","clientType":"individual"},"project":{"address":"Baghdad","structureReadiness":"ready","buildingType":"commercial_building"}}',now(),null);
 select updated_at into stamp from projects where id=crm_site;
 result:=public.sync_field_change(gen_random_uuid(),indoor,crm_site,'cancel-project','{"note":"Client contacted showroom to cancel","confirmed":true}',now(),stamp);
 assert result->>'sales_status'='cancelled';
 raise notice 'PASS: unassigned and differently assigned creators cannot delay/cancel; explicit assignment enables both; CRM cancellation preserved';
end $$;
rollback;
