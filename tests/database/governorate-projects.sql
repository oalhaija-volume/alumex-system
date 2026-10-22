-- Run as the database owner against a disposable, fully migrated database.
-- Fixtures, registrations, notifications and JWT changes all roll back.
begin;
do $test$
declare
  outdoor_id uuid := gen_random_uuid();
  karkh_id uuid := gen_random_uuid();
  rasafa_id uuid := gen_random_uuid();
  unassigned_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  legacy_creator uuid;
  shared_id uuid;
  shared_client uuid;
  shared_document uuid := gen_random_uuid();
  private_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  private_clients uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  registration_operation_id uuid;
  registered_project_id uuid;
  test_actor_id uuid;
  province text;
  branch_value text;
  payload jsonb;
  invalid_payload jsonb;
  result jsonb;
  retry jsonb;
  updated_stamp timestamptz;
  client_count bigint;
  notification_count bigint;
  visible_ids uuid[];
  index integer;
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select id into strict legacy_creator from public.profiles where role='Admin' and is_active=true and status='Active' limit 1;
  insert into auth.users(id,email) values
    (outdoor_id,outdoor_id::text||'@example.invalid'),
    (karkh_id,karkh_id::text||'@example.invalid'),
    (rasafa_id,rasafa_id::text||'@example.invalid'),
    (unassigned_id,unassigned_id::text||'@example.invalid'),
    (manager_id,manager_id::text||'@example.invalid');
  update public.profiles u set role='Outdoor Sales',is_active=true,status='Active' where u.id=outdoor_id;
  update public.profiles u set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where u.id=karkh_id;
  update public.profiles u set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where u.id=rasafa_id;
  update public.profiles u set role='Indoor Sales',branch=null,is_active=true,status='Active' where u.id=unassigned_id;
  update public.profiles u set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where u.id=manager_id;

  payload := '{"client":{"clientName":"Governorate registration regression","mobile":"00000000000","clientType":"individual"},"project":{"branch":"Governorates","buildingType":"villa_house","address":"Province site","structureReadiness":"ready"}}';
  foreach province in array array['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','النجف','الديوانية','الكوت','العمارة','الناصرية','السماوة'] loop
    registered_project_id := gen_random_uuid(); registration_operation_id := gen_random_uuid();
    payload := jsonb_set(payload,'{project,governorate}',to_jsonb(province));
    result := public.sync_field_change(registration_operation_id,outdoor_id,registered_project_id,'register',payload,now(),null);
    assert result->>'branch'='Governorates' and result->>'governorate'=province,
      'Offline receipt must retain the exact selected governorate';
    assert (select p.branch='Governorates' and p.governorate=province and p.created_by=outdoor_id
      and p.original_creator_role='Outdoor Sales' from public.projects p where p.id=registered_project_id);
    select count(*) into notification_count from public.notifications n where n.entity_id=registered_project_id;
    retry := public.sync_field_change(registration_operation_id,outdoor_id,registered_project_id,'register',payload,now(),null);
    assert retry=result, 'Registration retry must return the original location';
    assert (select count(*)=notification_count from public.notifications n where n.entity_id=registered_project_id),
      'Retries must not duplicate shared intake notifications';
    shared_id := registered_project_id;
  end loop;
  assert (select u.branch is null from public.profiles u where u.id=outdoor_id),
    'A project location must never assign the Outdoor employee to a branch';
  result := public.register_sales_project(outdoor_id,payload);
  assert (select p.branch='Governorates' and p.governorate='السماوة' from public.projects p where p.id=(result->>'projectId')::uuid),
    'Online registration must use the same validated governorate transaction';

  for invalid_payload in select candidate.value from jsonb_array_elements(jsonb_build_array(
    payload#-'{project,governorate}',
    jsonb_set(payload,'{project,governorate}','null'::jsonb),
    jsonb_set(payload,'{project,governorate}','123'::jsonb),
    jsonb_set(payload,'{project,governorate}','"Unknown"'::jsonb),
    jsonb_set(payload,'{project,branch}','"Karkh"'::jsonb)
  )) candidate loop
    select count(*) into client_count from public.clients;
    begin
      perform public.sync_field_change(gen_random_uuid(),outdoor_id,gen_random_uuid(),'register',invalid_payload,now(),null);
      raise exception using errcode='ZX001',message='Invalid governorate registration accepted';
    exception when sqlstate '22023' then null; end;
    assert (select count(*)=client_count from public.clients), 'Invalid selection must not leave a client row';
  end loop;

  -- New registrations require a branch; historical unmarked records stay private.
  begin
    perform public.sync_field_change(gen_random_uuid(),outdoor_id,gen_random_uuid(),'register',
      payload#-'{project,branch}'#-'{project,governorate}',now(),null);
    raise exception using errcode='ZX001',message='New branchless Outdoor registration accepted';
  exception when sqlstate '22023' then null; end;
  foreach branch_value in array array['Karkh','Rasafa'] loop
    update public.profiles set outdoor_rotation_start_branch=case
      when extract(day from statement_timestamp() at time zone 'Asia/Baghdad')<=15 then branch_value
      when branch_value='Karkh' then 'Rasafa' else 'Karkh' end where id=outdoor_id;
    result := public.sync_field_change(gen_random_uuid(),outdoor_id,gen_random_uuid(),'register',
      jsonb_set(payload#-'{project,governorate}','{project,branch}',to_jsonb(branch_value)),now(),null);
    assert result->>'branch'=branch_value and result->>'governorate' is null;
  end loop;

  -- Physical employee branches remain authoritative for Indoor and Manager intake.
  foreach test_actor_id in array array[karkh_id,manager_id] loop
    result := public.register_sales_project(test_actor_id,jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(test_actor_id::text)));
    assert (select p.branch='Karkh' and p.governorate is null from public.projects p where p.id=(result->>'projectId')::uuid);
  end loop;
  begin
    update public.profiles u set branch='Governorates' where u.id=karkh_id;
    raise exception using errcode='ZX001',message='Governorates became an employee branch';
  exception when check_violation then null; end;

  select p.client_id into shared_client from public.projects p where p.id=shared_id;
  insert into public.openings(project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values(shared_id,'GOV-1','Ground','Office',100,100,1,'Window','Sliding','ready',outdoor_id);
  insert into public.project_workflow_events(project_id,event_type,actor_id,notes)
    values(shared_id,'governorate_verification',outdoor_id,'Shared project history');
  insert into public.documents(id,owner_type,client_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(shared_document,'client',shared_client,'shared.txt','governorate-verification','shared.txt',outdoor_id);
  for index in 1..3 loop
    branch_value := case index when 1 then 'Karkh' when 2 then 'Rasafa' else null end;
    insert into public.clients(id,client_name,created_by) values(private_clients[index],'Private branch fixture',outdoor_id);
    insert into public.projects(id,client_id,project_number,project_name,created_by,owner_id,branch,structure_readiness,sales_status)
      values(private_ids[index],private_clients[index],'VERIFY-GOV-'||private_ids[index],'Private branch fixture',legacy_creator,legacy_creator,branch_value,'ready','new_lead');
    insert into public.openings(project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
      values(private_ids[index],'PRIVATE-GOV-1','Ground','Office',100,100,1,'Window','Sliding','ready',outdoor_id);
  end loop;
  begin
    insert into public.projects(client_id,project_number,project_name,created_by,branch,governorate)
      values(shared_client,'VERIFY-INVALID-GOV-'||gen_random_uuid(),'Invalid null branch fixture',legacy_creator,null,'البصرة');
    raise exception using errcode='ZX001',message='A null branch accepted a governorate through SQL three-valued logic';
  exception when check_violation then null; end;
  assert (select count(*)=3 from public.notifications n where n.entity_id=shared_id
    and n.event_type='project_follow_up_assigned' and n.recipient_id in (karkh_id,rasafa_id,manager_id)),
    'Unclaimed Governorates projects must notify both Indoor branches and Sales Manager';
  assert not exists(select 1 from public.notifications n where n.entity_id=shared_id and n.recipient_id=unassigned_id);

  foreach test_actor_id in array array[karkh_id,rasafa_id,unassigned_id] loop
    perform set_config('request.jwt.claim.sub',test_actor_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',test_actor_id,'role','authenticated')::text,true);
    set local role authenticated;
    select coalesce(array_agg(p.id),'{}'::uuid[]) into visible_ids from public.projects p
      where p.id=any(array_append(private_ids,shared_id));
    if test_actor_id=unassigned_id then
      assert cardinality(visible_ids)=0, 'Missing employee branch must fail closed for shared projects';
      assert not public.can_access_indoor_project_branch(shared_id);
      assert not exists(select 1 from public.clients c where c.id=shared_client);
      assert not exists(select 1 from public.openings o where o.project_id=any(array_append(private_ids,shared_id))),
        'An unassigned Indoor employee cannot read shared or private openings';
    else
      assert cardinality(visible_ids)=2 and shared_id=any(visible_ids),
        'Each Indoor team sees its private branch plus shared Governorates';
      assert (case when test_actor_id=karkh_id then private_ids[1] else private_ids[2] end)=any(visible_ids);
      assert public.can_view_sales_project(shared_id) and public.can_access_indoor_project_branch(shared_id);
      assert exists(select 1 from public.openings o where o.project_id=shared_id),
        'Both assigned Indoor teams can read a Governorates opening schedule';
      assert not exists(select 1 from public.openings o
        where o.project_id in (case when test_actor_id=karkh_id then private_ids[2] else private_ids[1] end,private_ids[3])),
        'Shared opening access must not expose the other branch or unmarked projects';
      assert exists(select 1 from public.project_workflow_events e where e.project_id=shared_id);
      assert exists(select 1 from public.clients c where c.id=shared_client);
      assert exists(select 1 from public.documents d where d.id=shared_document);
      assert exists(select 1 from public.notifications n where n.entity_id=shared_id and n.recipient_id=test_actor_id);
    end if;
    reset role;
  end loop;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  foreach test_actor_id in array array[karkh_id,rasafa_id] loop
    perform public.require_indoor_project_branch(shared_id,test_actor_id);
    select p.updated_at into updated_stamp from public.projects p where p.id=shared_id;
    result := public.sync_field_change(gen_random_uuid(),test_actor_id,shared_id,'follow-up',
      jsonb_build_object('note','Shared governorate follow-up','nextFollowUp',now()-interval '1 minute',
        'followUpType','call','followUpOwnerId',test_actor_id),now(),updated_stamp);
    assert result->>'branch'='Governorates' and result->>'governorate'='السماوة';
    assert (select count(*)=1 from public.sales_notification_recipients(shared_id));
    assert exists(select 1 from public.sales_notification_recipients(shared_id) recipient(id) where recipient.id=test_actor_id),
      'Claimed shared work must keep notifications with the selected owner';
    perform set_config('request.jwt.claim.sub',test_actor_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',test_actor_id,'role','authenticated')::text,true);
    set local role authenticated;
    perform public.deliver_due_follow_up_notifications();
    assert exists(select 1 from public.notifications n where n.entity_id=shared_id and n.recipient_id=test_actor_id and n.event_type='follow_up_due' and n.read_at is null),
      'Either branch owner can receive due reminders for shared projects';
    reset role;
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  end loop;
  begin
    perform public.require_indoor_project_branch(shared_id,unassigned_id);
    raise exception using errcode='ZX001',message='Unassigned Indoor RPC actor gained shared access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.require_indoor_project_branch(private_ids[2],karkh_id);
    raise exception using errcode='ZX001',message='Other branch private project became shared';
  exception when insufficient_privilege then null; end;

  begin
    update public.projects p set branch='Governorates',governorate='البصرة' where p.id=private_ids[1];
    raise exception using errcode='ZX001',message='Private project was changed into shared access';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects p set branch='Karkh',governorate=null where p.id=shared_id;
    raise exception using errcode='ZX001',message='Shared registration location was overwritten';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects p set governorate='البصرة' where p.id=shared_id;
    raise exception using errcode='ZX001',message='Saved governorate was overwritten';
  exception when insufficient_privilege then null; end;

  assert not has_function_privilege('authenticated','public.register_sales_project(uuid,jsonb)','execute');
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert not has_function_privilege('authenticated','public.require_indoor_project_branch(uuid,uuid)','execute');
  assert not has_function_privilege('authenticated','public.sales_notification_recipients(uuid)','execute');
  raise notice 'PASS: 12 governorates, validation, retries, online/offline intake, employee branches, shared RLS/RPC access, private isolation, notifications and immutable locations';
end;
$test$;
rollback;
