begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 operation uuid:=gen_random_uuid(); payload jsonb; invalid jsonb; result jsonb;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',full_name='Completion employee',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Completion test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:='{"note":"  ملاحظة الموقع  ","photo":"data:image/jpeg;base64,/9j/AAAA"}';
 begin
  perform sync_field_change(operation,outdoor,site,'finish',payload,now(),null);
  raise exception using errcode='ZX001',message='Completion accepted with no openings';
 exception when sqlstate 'P0001' then null; end;
 assert not exists(select 1 from measurement_completion_reports where project_id=site),'Report insertion must be atomic with completion';
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_build_object('id',gen_random_uuid(),'floor','GF','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding','hasArch',false),now(),null);
 foreach invalid in array array['{"note":3}'::jsonb,jsonb_build_object('note',repeat('x',2001)),'{"photo":false}'::jsonb,'{"photo":"https://example.invalid/a.jpg"}'::jsonb,'{"photo":"data:image/svg+xml;base64,AAAA"}'::jsonb,jsonb_build_object('photo','data:image/jpeg;base64,/9j/'||repeat('A',700000))] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'finish',invalid,now(),null);
   raise exception using errcode='ZX001',message='Invalid completion report accepted';
  exception when sqlstate 'P0001' then null;end;
 end loop;
 assert not exists(select 1 from measurement_completion_reports where project_id=site);
 result:=sync_field_change(operation,outdoor,site,'finish',payload,now(),null);
 assert sync_field_change(operation,outdoor,site,'finish',payload,now(),null)=result,'Retry must return original receipt';
 assert (select count(*)=1 from measurement_completion_reports where project_id=site);
 assert (select note='ملاحظة الموقع' and has_photo and photo='data:image/jpeg;base64,/9j/AAAA' and recorded_by=outdoor and recorded_by_name='Completion employee' from measurement_completion_reports where id=operation);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'finish',payload,now(),null);
  raise exception using errcode='ZX001',message='Duplicate new completion report accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements already submitted. Reload this project.';end;
 -- A later visit appends a new note and keeps the earlier photo and note intact.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'reopen','{}',now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{"note":"Second visit","photo":""}',now(),null);
 assert (select count(*)=2 from measurement_completion_reports where project_id=site);
 assert (select count(*)=1 from measurement_completion_reports where project_id=site and has_photo);
 -- Skipping both optional fields remains supported, including old offline clients.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'reopen','{}',now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select count(*)=2 from measurement_completion_reports where project_id=site);
 assert not has_table_privilege('authenticated','public.measurement_completion_reports','select');
 assert not has_table_privilege('anon','public.measurement_completion_reports','insert');
 raise notice 'PASS: optional measurement notes/photos validate, save atomically, retry once, preserve visit history and restrict direct access';
end $$;
rollback;
