-- Run against the migrated database. All fixtures and project changes roll back.
begin;
do $$
declare
  indoor uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid();
  director uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  measuring_outdoor uuid := gen_random_uuid();
  inactive_outdoor uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  normal_id uuid := gen_random_uuid();
  register_operation uuid := gen_random_uuid();
  rejected_operation uuid;
  rejected_project uuid;
  client_count bigint;
  project_count bigint;
  result jsonb;
  payload jsonb;
  invalid_value jsonb;
  online_result jsonb;
  stamp timestamptz;
  measured_opening uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,email) values
    (indoor,indoor::text || '@example.invalid'),
    (manager,manager::text || '@example.invalid'),
    (administrator,administrator::text || '@example.invalid'),
    (director,director::text || '@example.invalid'),
    (outdoor,outdoor::text || '@example.invalid'),
    (measuring_outdoor,measuring_outdoor::text || '@example.invalid'),
    (inactive_outdoor,inactive_outdoor::text || '@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
  update public.profiles set role='Sales Director',is_active=true,status='Active' where id=director;
  update public.profiles set role='Outdoor Sales',full_name='Original Outdoor Owner',is_active=true,status='Active'
    where id=outdoor;
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=measuring_outdoor;
  update public.profiles set role='Outdoor Sales',is_active=false,status='Inactive' where id=inactive_outdoor;

  payload := jsonb_build_object(
    'client',jsonb_build_object('clientName','Pre-system owner test','mobile','00000000000','clientType','individual'),
    'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
      'structureReadiness','ready','assignedOutdoorSalesId',indoor,'legacyOutdoorSalesId',outdoor));
  result := public.sync_field_change(register_operation,indoor,project_id,'register',payload,now(),null);
  assert result->>'legacy_outdoor_sales_id'=outdoor::text;
  assert result->>'legacyOutdoorSalesOwner'='Original Outdoor Owner';
  assert result->>'assigned_outdoor_sales_id'=indoor::text,
    'Original sales credit must not replace the chosen measurement employee';
  assert result->>'branch'='Karkh';
  assert (select created_by=indoor and original_creator_id=indoor and original_creator_role='Indoor Sales'
    and owner_id=outdoor and sales_engineer_id=outdoor and legacy_outdoor_sales_id=outdoor
    and responsible_user_id=indoor and follow_up_owner_id=indoor and original_source='showroom_walk_in'
    from public.projects where id=project_id),
    'Actual entry, source, original Outdoor owner, and Indoor follow-up must remain distinct';

  -- Cached outcomes return before revalidating a former employee or repeating writes.
  update public.profiles set is_active=false,status='Inactive' where id=outdoor;
  assert public.sync_field_change(register_operation,indoor,project_id,'register',payload,now(),null)=result;
  assert (select count(*)=1 from public.projects where id=project_id);
  assert (select count(*)=1 from public.field_sync_receipts where operation_id=register_operation);
  update public.profiles set is_active=true,status='Active' where id=outdoor;
  begin
    perform public.sync_field_change(register_operation,indoor,project_id,'register',
      jsonb_set(payload,'{project,legacyOutdoorSalesId}',to_jsonb(measuring_outdoor::text)),now(),null);
    raise exception using errcode='ZX001',message='Changed credit reused a registration operation';
  exception when sqlstate 'P0001' then
    assert sqlerrm='Operation ID already used for different work';
  end;

  select updated_at into stamp from public.projects where id=project_id;
  perform public.sync_field_change(gen_random_uuid(),indoor,project_id,'assign-measurements',
    jsonb_build_object('assignedOutdoorSalesId',measuring_outdoor),now(),stamp);
  assert (select assigned_outdoor_sales_id=measuring_outdoor and legacy_outdoor_sales_id=outdoor
    and owner_id=outdoor and sales_engineer_id=outdoor and created_by=indoor and follow_up_owner_id=indoor
    and responsible_user_id=indoor
    from public.projects where id=project_id), 'Measurement handoff must preserve original Outdoor credit';
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',outdoor::text,true);
  assert public.can_view_sales_project(project_id), 'The original Outdoor owner must retain read access';
  assert not public.can_manage_sales_project(project_id), 'Sales credit alone must not grant project writes';
  assert not public.can_edit_project(project_id), 'Sales credit alone must not grant legacy edit access';
  if to_regprocedure('public.can_write_project_documents(uuid)') is not null then
    assert not public.can_write_project_documents(project_id), 'Sales credit alone must not grant document writes';
  end if;
  begin
    perform public.sync_field_change(gen_random_uuid(),outdoor,project_id,'opening',
      jsonb_build_object('id',measured_opening,'floor','Ground','room','Kitchen','width',120,'height',150,
        'structuralType','Window','openingType','Sliding'),now(),null);
    raise exception using errcode='ZX001',message='Credit-only Outdoor recorded measurements';
  exception when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee';
  end;
  begin
    perform public.advance_sales_flow(project_id,'approve',0,'{}'::jsonb,outdoor);
    raise exception using errcode='ZX001',message='Credit-only Outdoor approved a quotation';
  exception when sqlstate '42501' then
    assert sqlerrm='Quotations and contracts are handled by Indoor Sales and company leadership.';
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.project_assignments(project_id,assignment_type,assignee_id,assigned_by)
    values(project_id,'temporary_support',outdoor,indoor);
  assert public.can_manage_sales_project(project_id), 'An independent explicit assignment keeps its prior permissions';
  update public.project_assignments assignment set ended_at=now() where assignment.project_id=(result->>'id')::uuid
    and assignment_type='temporary_support' and assignee_id=outdoor and ended_at is null;
  assert not public.can_manage_sales_project(project_id), 'Ending an explicit assignment must restore credit-only access';

  -- An explicitly assigned credited owner may collect measurements normally;
  -- the existing commercial role restriction still rejects quotation approval.
  select updated_at into stamp from public.projects where id=project_id;
  perform public.sync_field_change(gen_random_uuid(),indoor,project_id,'assign-measurements',
    jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
  perform set_config('request.jwt.claim.role','authenticated',true);
  assert public.can_manage_sales_project(project_id);
  assert public.can_edit_project(project_id);
  perform public.sync_field_change(gen_random_uuid(),outdoor,project_id,'opening',
    jsonb_build_object('id',measured_opening,'floor','Ground','room','Kitchen','width',120,'height',150,
      'structuralType','Window','openingType','Sliding'),now(),null);
  assert (select created_by=outdoor from public.openings where id=measured_opening);
  begin
    perform public.advance_sales_flow(project_id,'approve',0,'{}'::jsonb,outdoor);
    raise exception using errcode='ZX001',message='Measurement assignment granted commercial approval';
  exception when sqlstate '42501' then
    assert sqlerrm='Quotations and contracts are handled by Indoor Sales and company leadership.';
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  select updated_at into stamp from public.projects where id=project_id;
  perform public.sync_field_change(gen_random_uuid(),indoor,project_id,'assign-measurements',
    jsonb_build_object('assignedOutdoorSalesId',measuring_outdoor),now(),stamp);
  -- Operational ownership may move later, while sales-origin credit is permanent.
  update public.projects set owner_id=manager,sales_engineer_id=manager where id=project_id;
  assert (select legacy_outdoor_sales_id=outdoor from public.projects where id=project_id);
  begin
    update public.projects set legacy_outdoor_sales_id=measuring_outdoor where id=project_id;
    raise exception using errcode='ZX001',message='Original Outdoor credit was overwritten';
  exception when sqlstate '42501' then assert sqlerrm='The original Outdoor Sales credit cannot be changed.';
  end;
  begin
    update public.projects set legacy_outdoor_sales_id=null where id=project_id;
    raise exception using errcode='ZX001',message='Original Outdoor credit was removed';
  exception when sqlstate '42501' then assert sqlerrm='The original Outdoor Sales credit cannot be changed.';
  end;
  begin
    update public.projects set created_by=outdoor where id=project_id;
    raise exception using errcode='ZX001',message='The actual entering employee was overwritten';
  exception when sqlstate 'P0001' then
    assert sqlerrm in ('Original project attribution cannot be changed.','The original project creator cannot be changed.');
  end;
  begin
    delete from public.profiles where id=outdoor;
    raise exception using errcode='ZX001',message='A credited employee was deleted';
  exception when foreign_key_violation or restrict_violation then null;
  end;

  -- Normal/older clients omit the option; their attribution remains unchanged.
  perform public.sync_field_change(gen_random_uuid(),indoor,normal_id,'register',
    payload #- '{project,legacyOutdoorSalesId}',now(),null);
  assert (select legacy_outdoor_sales_id is null and created_by=indoor and owner_id=indoor
    and sales_engineer_id=indoor and assigned_outdoor_sales_id=indoor and follow_up_owner_id=indoor
    from public.projects where id=normal_id);
  begin
    update public.projects set legacy_outdoor_sales_id=outdoor where id=normal_id;
    raise exception using errcode='ZX001',message='Credit was added after registration';
  exception when sqlstate '42501' then assert sqlerrm='The original Outdoor Sales credit cannot be changed.';
  end;
  perform public.sync_field_change(gen_random_uuid(),indoor,gen_random_uuid(),'register',
    jsonb_set(payload,'{project,legacyOutdoorSalesId}','null'::jsonb),now(),null);

  -- The online atomic RPC delegates to this same validation and attribution.
  online_result := public.register_sales_project(manager,
    jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(manager::text)));
  assert (select legacy_outdoor_sales_id=outdoor and created_by=manager and original_creator_id=manager
    and original_creator_role='Sales Manager' and owner_id=outdoor and follow_up_owner_id=manager
    and responsible_user_id=manager
    and branch='Karkh' from public.projects where id=(online_result->>'projectId')::uuid);
  online_result := public.register_sales_project(administrator,
    jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(measuring_outdoor::text)));
  assert (select legacy_outdoor_sales_id=outdoor and created_by=administrator
    and original_creator_role='Admin' and owner_id=outdoor and responsible_user_id=administrator from public.projects
    where id=(online_result->>'projectId')::uuid);
  online_result := public.register_sales_project(outdoor,jsonb_build_object(
    'client',payload->'client','project',jsonb_build_object('address','Basra',
      'locationLatitude',30.5,'locationLongitude',47.8,'structureReadiness','ready',
      'buildingType','villa_house','branch','Governorates','governorate','البصرة',
      'assignedOutdoorSalesId',measuring_outdoor)));
  assert (select legacy_outdoor_sales_id is null and created_by=outdoor and owner_id=outdoor
    and sales_engineer_id=outdoor and original_creator_role='Outdoor Sales' and original_source='outdoor_sales'
    and branch='Governorates' and governorate='البصرة' from public.projects
    where id=(online_result->>'projectId')::uuid), 'Ordinary Outdoor registration and governorate routing must remain unchanged';

  -- A transferred Indoor employee cannot bypass branch access using a saved receipt.
  update public.profiles set branch='Rasafa' where id=indoor;
  begin
    perform public.sync_field_change(register_operation,indoor,project_id,'register',payload,now(),null);
    raise exception using errcode='ZX001',message='Saved registration bypassed Indoor branch access';
  exception when sqlstate '42501' then assert sqlerrm='Project is not available to this employee';
  end;
  update public.profiles set branch='Karkh' where id=indoor;

  select count(*) into client_count from public.clients;
  select count(*) into project_count from public.projects;
  for invalid_value in select value from jsonb_array_elements(jsonb_build_array(
      '', 'invalid-uuid', 123, true, jsonb_build_object('id',outdoor), jsonb_build_array(outdoor),
      inactive_outdoor::text, indoor::text, gen_random_uuid()::text)) loop
    rejected_operation := gen_random_uuid(); rejected_project := gen_random_uuid();
    begin
      perform public.sync_field_change(rejected_operation,indoor,rejected_project,'register',
        jsonb_set(payload,'{project,legacyOutdoorSalesId}',invalid_value),now(),null);
      raise exception using errcode='ZX001',message='Invalid original Outdoor employee was accepted';
    exception when sqlstate '22023' then
      assert sqlerrm='Choose an active Outdoor Sales employee as the original project owner.';
    end;
    assert not exists(select 1 from public.projects where id=rejected_project);
    assert not exists(select 1 from public.field_sync_receipts where operation_id=rejected_operation);
  end loop;
  begin
    perform public.sync_field_change(gen_random_uuid(),director,gen_random_uuid(),'register',payload,now(),null);
    raise exception using errcode='ZX001',message='Unapproved leadership role assigned historical credit';
  exception when sqlstate '42501' then
    assert sqlerrm='Only Indoor Sales, Sales Manager or Admin can register an older Outdoor Sales project.';
  end;
  begin
    perform public.sync_field_change(gen_random_uuid(),outdoor,gen_random_uuid(),'register',payload,now(),null);
    raise exception using errcode='ZX001',message='Outdoor employee claimed a different historical owner';
  exception when sqlstate '42501' then
    assert sqlerrm='Only Indoor Sales, Sales Manager or Admin can register an older Outdoor Sales project.';
  end;
  -- A failure after the client INSERT still rolls back the entire registration.
  rejected_operation := gen_random_uuid(); rejected_project := gen_random_uuid();
  begin
    perform public.sync_field_change(rejected_operation,indoor,rejected_project,'register',
      jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(manager::text)),now(),null);
    raise exception using errcode='ZX001',message='Invalid measurement selection was accepted';
  exception when sqlstate 'P0001' then
    assert sqlerrm='Choose yourself or an Outdoor Sales employee to collect the initial measurements.';
  end;
  assert not exists(select 1 from public.field_sync_receipts where operation_id=rejected_operation);
  assert (select count(*)=client_count from public.clients), 'Failed intake retained a client';
  assert (select count(*)=project_count from public.projects), 'Failed intake retained a project';

  -- A browser cannot sidestep server registration through a permissive old policy.
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',indoor::text,true);
  begin
    insert into public.projects(id,client_id,project_name,project_number,created_by,
      assigned_outdoor_sales_id,legacy_outdoor_sales_id)
    select gen_random_uuid(),client_id,'Forged direct credit','TEST-'||gen_random_uuid()::text,
      indoor,indoor,outdoor from public.projects where id=normal_id;
    raise exception using errcode='ZX001',message='Browser inserted historical credit directly';
  exception when sqlstate '42501' then
    assert sqlerrm='Use project registration to assign original Outdoor Sales credit.';
  end;
  perform set_config('request.jwt.claim.role','service_role',true);
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','EXECUTE');
  assert not has_function_privilege('anon','public.register_sales_project(uuid,jsonb)','EXECUTE');
  assert has_function_privilege('service_role','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','EXECUTE');
  raise notice 'PASS: original Outdoor Sales credit, actual creator, independent measurement/follow-up, retry, online/Manager/Admin, immutability, authorization, validation and transaction rollback';
end;
$$;
rollback;
