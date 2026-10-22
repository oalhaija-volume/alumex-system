begin;
do $$
declare
 actor uuid := gen_random_uuid();
 project_id uuid;
 operation_id uuid;
 branch_value text;
 employee_role text;
 payload jsonb;
 result jsonb;
 repeated jsonb;
 clients_before bigint;
begin
 insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=actor;
 payload:='{"client":{"clientName":"Project branch test","clientType":"individual","mobile":"00000000000"},"project":{"buildingType":"villa_house","structureReadiness":"ready","address":"Baghdad","locationLatitude":33.3,"locationLongitude":44.4}}'::jsonb;
 foreach branch_value in array array['Karkh','Rasafa'] loop
  payload:=jsonb_set(payload,'{project,branch}',to_jsonb(branch_value));
  project_id:=gen_random_uuid();operation_id:=gen_random_uuid();
  result:=public.sync_field_change(operation_id,actor,project_id,'register',payload,now());
  assert result->>'branch'=branch_value,'Sync receipt must include selected branch';
  assert (select branch=branch_value and created_by=actor and original_creator_role='Outdoor Sales' from projects where id=project_id);
  assert (select branch is null from profiles where id=actor),'Selecting a project branch must not assign the employee to a branch';
  repeated:=public.sync_field_change(operation_id,actor,project_id,'register',payload,now());
  assert repeated=result,'Retries must retain the chosen branch';
  result:=public.register_sales_project(actor,payload);
  assert (select branch=branch_value from projects where id=(result->>'projectId')::uuid),'Online registration must store selected branch';
 end loop;
 foreach branch_value in array array['wrong','',null] loop
  select count(*) into clients_before from clients;
  begin
   perform public.sync_field_change(gen_random_uuid(),actor,gen_random_uuid(),'register',jsonb_set(payload,'{project,branch}',coalesce(to_jsonb(branch_value),'null'::jsonb)),now());
   raise exception using errcode='ZX001',message='Invalid branch accepted';
  exception when sqlstate '22023' then assert sqlerrm='Choose the project branch: Karkh, Rasafa or Governorates.';
  end;
  assert (select count(*) from clients)=clients_before,'Invalid branch must not leave client records';
 end loop;
 result:=public.sync_field_change(gen_random_uuid(),actor,gen_random_uuid(),'register',payload#-'{project,branch}',now());
 assert result->>'branch' is null,'Do not guess the branch of legacy queued registrations';
 foreach employee_role in array array['Indoor Sales','Sales Manager'] loop
  update profiles set role=employee_role::public.app_role,branch='Karkh' where id=actor;
  payload:=jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(actor::text));
  payload:=jsonb_set(payload,'{project,branch}','"Rasafa"'::jsonb);
  result:=public.register_sales_project(actor,payload);
  assert (select branch='Karkh' and original_creator_role::text=employee_role from projects where id=(result->>'projectId')::uuid),'Indoor/Manager projects must retain the assigned employee branch';
 end loop;
 assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
end;
$$;
rollback;
