begin;
do $$
declare employee uuid:=gen_random_uuid(); site uuid; operation uuid; payload jsonb; result jsonb; readiness text;
begin
 insert into auth.users(id,email) values(employee,employee::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=employee;
 foreach readiness in array array['ready','not_ready'] loop
  site:=gen_random_uuid(); operation:=gen_random_uuid();
  payload:=jsonb_build_object('client',jsonb_build_object('clientName','Offline address test','mobile','00000000000','clientType','individual'),
   'project',jsonb_build_object('address','بغداد - المنصور','locationLatitude',null,'locationLongitude',null,'structureReadiness',readiness,'readinessNote',case when readiness='not_ready' then 'Walls unfinished' end));
  result:=sync_field_change(operation,employee,site,'register',payload,now(),null);
  assert result->>'id'=site::text;
  assert (select address='بغداد - المنصور' and location_latitude is null and location_longitude is null and created_by=employee and structure_readiness=readiness from projects where id=site);
  perform sync_field_change(operation,employee,site,'register',payload,now(),null);
  assert (select count(*)=1 from projects where id=site), 'Sync retry must not duplicate registration';
 end loop;
 raise notice 'PASS: address-only Outdoor projects save with null coordinates, retain readiness and creator, and retry without duplicates';
end $$;
rollback;
