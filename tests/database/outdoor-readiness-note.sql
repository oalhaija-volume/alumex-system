-- All fixtures are rolled back by the runner.
begin;
do $$
declare
 outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid();
 project_id uuid:=gen_random_uuid(); operation_id uuid:=gen_random_uuid();
 payload jsonb; invalid jsonb; result jsonb; stamp timestamptz; client_id uuid;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 payload:=jsonb_build_object('client',jsonb_build_object('clientName','Readiness test','mobile','00000000000','clientType','individual'),
  'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,'structureReadiness','not_ready','assignedOutdoorSalesId',outdoor));
 foreach invalid in array array[payload,jsonb_set(payload,'{project,readinessNote}',to_jsonb(E' \n\t '::text))] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,project_id,'register',invalid,now(),null);
   raise exception using errcode='ZX001',message='Missing readiness note was accepted';
  exception when sqlstate '22023' then
   assert sqlerrm='Add a note explaining why the project is not ready for measurement.';
  end;
 end loop;
 assert not exists(select 1 from projects where id=project_id);
 assert not exists(select 1 from clients where created_by=outdoor),'Invalid registration must leave no client';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,project_id,'register',jsonb_set(payload,'{project,readinessNote}',to_jsonb(repeat('x',2001))),now(),null);
  raise exception using errcode='ZX001',message='Oversized readiness note was accepted';
 exception when check_violation then null;
 end;
 payload:=jsonb_set(payload,'{project,readinessNote}',to_jsonb('  الجدران غير مكتملة  '::text));
 result:=sync_field_change(operation_id,outdoor,project_id,'register',payload,now(),null);
 assert result->>'readiness_note'='الجدران غير مكتملة';
 assert sync_field_change(operation_id,outdoor,project_id,'register',payload,now(),null)=result,'Retry must remain idempotent';
 select updated_at,projects.client_id into stamp,client_id from projects where id=project_id;
 perform sync_field_change(gen_random_uuid(),indoor,project_id,'follow-up',jsonb_build_object('note','Called client','nextFollowUp','2026-11-08T07:00:00Z','followUpType','call','followUpOwnerId',indoor),now(),stamp);
 assert (select readiness_note='الجدران غير مكتملة' and project_notes='Called client' from projects where id=project_id);
 select updated_at into stamp from projects where id=project_id;
 perform sync_field_change(gen_random_uuid(),indoor,project_id,'ready','{}',now(),stamp);
 assert (select readiness_note='الجدران غير مكتملة' and structure_readiness='ready' from projects where id=project_id);
 -- Direct inserts use the same rule, independent of the offline RPC.
 begin
  insert into projects(project_number,project_name,client_id,created_by,structure_readiness) values('READINESS-'||gen_random_uuid(),'Direct test',client_id,outdoor,'not_ready');
  raise exception using errcode='ZX001',message='Direct insertion bypassed readiness requirement';
 exception when sqlstate '22023' then null;
 end;
 payload:=jsonb_set(payload,'{project,structureReadiness}','"ready"');
 payload:=payload #- '{project,readinessNote}';
 perform sync_field_change(gen_random_uuid(),outdoor,gen_random_uuid(),'register',payload,now(),null);
 raise notice 'PASS: required notes, atomic failures, Arabic persistence, retries, CRM updates, ready-site exemption and direct-insert enforcement';
end $$;
rollback;
