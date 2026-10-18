begin;
do $$
declare outdoor uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); opening_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); payload jsonb; bad jsonb;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(stranger,stranger::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,stranger);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Skylight test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:=jsonb_build_object('id',opening_id,'floor','Roof','room','Other','otherRoom','Roof','width',500,'height',600,'structuralType','Skylight','openingType',null,'quantity',1,'skylight','{"photo":"data:image/jpeg;base64,/9j/AAAA","drawing":"data:image/png;base64,iVBORw0KGgoAAAA=","sections":[{"label":"A","width":200,"length":600},{"label":"B","width":300,"length":250}]}'::jsonb);
 begin
  perform sync_field_change(gen_random_uuid(),stranger,site,'opening',payload,now(),null);
  raise exception using errcode='ZX001',message='Unauthorized employee wrote skylight';
 exception when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee'; end;
 foreach bad in array array['"invalid"'::jsonb,'{"sections":null}'::jsonb,'{"sections":[],"drawing":"data:image/svg+xml;base64,AA=="}'::jsonb,'{"sections":[{"label":"A","width":0,"length":10}]}'::jsonb,jsonb_build_object('sections','[]'::jsonb,'photo','data:image/jpeg;base64,/9j/'||repeat('A',700000))] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_set(payload,'{skylight}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid capture accepted';
  exception when check_violation then null; end;
 end loop;
 assert not exists(select 1 from openings where project_id=site), 'Invalid capture left opening behind';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||'{"structuralType":"Window","openingType":"Sliding"}'::jsonb,now(),null);
  raise exception using errcode='ZX001',message='Capture accepted for window';
 exception when check_violation then null; end;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 from openings where project_id=site),'Retry duplicated capture';
 assert (select has_skylight_capture and skylight_capture=payload->'skylight' from openings where id=opening_id),'Capture did not round trip';
 begin
  update openings set skylight_capture=null where id=opening_id;
  raise exception using errcode='ZX001',message='Saved capture changed';
 exception when sqlstate 'P0001' then assert sqlerrm='Saved skylight captures cannot be changed.'; end;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 raise notice 'PASS: skylight capture persists atomically, validates size/type/sections, protects ownership, retries once and completes measurements';
end $$;
rollback;
