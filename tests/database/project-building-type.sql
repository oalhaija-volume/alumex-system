begin;
do $$
declare outdoor uuid:=gen_random_uuid(); site uuid; operation uuid; building text; bad jsonb; payload jsonb; result jsonb;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 payload:='{"client":{"clientName":"Building type test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}';
 foreach building in array array['commercial_building','residential_building','villa_house'] loop
  site:=gen_random_uuid();operation:=gen_random_uuid();
  result:=sync_field_change(operation,outdoor,site,'register',jsonb_set(payload,'{project,buildingType}',to_jsonb(building)),now(),null);
  assert result->>'building_type'=building;
  assert (select building_type=building from projects where id=site);
  assert sync_field_change(operation,outdoor,site,'register',jsonb_set(payload,'{project,buildingType}',to_jsonb(building)),now(),null)=result,'Retry must preserve classification';
 end loop;
 foreach bad in array array['null'::jsonb,'""'::jsonb,'"invalid"'::jsonb,'3'::jsonb,'{}'::jsonb] loop
  site:=gen_random_uuid();
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'register',jsonb_set(payload,'{project,buildingType}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid classification accepted';
  exception when sqlstate '22023' then null; end;
  assert not exists(select 1 from projects where id=site);
 end loop;
 site:=gen_random_uuid();perform sync_field_change(gen_random_uuid(),outdoor,site,'register',payload,now(),null);
 assert (select building_type is null from projects where id=site),'Legacy queued registrations must still sync';
 begin
  update projects set building_type='unknown' where id=site;
  raise exception using errcode='ZX001',message='Invalid database classification accepted';
 exception when check_violation then null; end;
 raise notice 'PASS: all building types persist and retry, invalid values fail atomically, and older offline registrations remain compatible';
end $$;
rollback;
