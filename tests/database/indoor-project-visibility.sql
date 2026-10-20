-- Run as the database owner against a disposable, fully migrated database.
-- Every fixture and mutation rolls back, including auth users and JWT settings.
begin;
do $test$
declare
  karkh_employee uuid := gen_random_uuid();
  rasafa_employee uuid := gen_random_uuid();
  unassigned_employee uuid := gen_random_uuid();
  outdoor_employee uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  client_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  project_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  document_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  task_id uuid := gen_random_uuid();
  appointment_id uuid := gen_random_uuid();
  receipt_project uuid := gen_random_uuid();
  register_operation uuid := gen_random_uuid();
  follow_up_operation uuid := gen_random_uuid();
  register_payload jsonb;
  follow_up_payload jsonb;
  result jsonb;
  recorded_at timestamptz := now();
  expected_updated_at timestamptz;
  actor uuid;
  branch_name text;
  visible_ids uuid[];
  index integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into auth.users(id,email) values
    (karkh_employee, karkh_employee::text || '@example.invalid'),
    (rasafa_employee, rasafa_employee::text || '@example.invalid'),
    (unassigned_employee, unassigned_employee::text || '@example.invalid'),
    (outdoor_employee, outdoor_employee::text || '@example.invalid'),
    (manager, manager::text || '@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active'
    where id=karkh_employee;
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active'
    where id=rasafa_employee;
  update public.profiles set role='Indoor Sales',branch=null,is_active=true,status='Active'
    where id=unassigned_employee;
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor_employee;
  update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  insert into public.clients(id,client_name,created_by) values
    (client_ids[1], 'Karkh-only visibility fixture', outdoor_employee),
    (client_ids[2], 'Rasafa-only visibility fixture', outdoor_employee),
    (client_ids[3], 'Client with projects in both branches', outdoor_employee);

  -- The opposite-branch project deliberately belongs to the Karkh employee.
  -- Creator/ownership/assignment exceptions must not override branch isolation.
  for index in 1..5 loop
    branch_name := case index when 1 then 'Karkh' when 2 then 'Rasafa'
      when 4 then 'Karkh' when 5 then 'Rasafa' else null end;
    insert into public.projects(id,client_id,project_number,project_name,created_by,
      owner_id,responsible_user_id,follow_up_owner_id,assigned_outdoor_sales_id,branch,structure_readiness)
    values(project_ids[index], case when index>=4 then client_ids[3] when index=1 then client_ids[1] else client_ids[2] end,
      'VERIFY-BRANCH-' || project_ids[index], 'Branch isolation fixture', outdoor_employee,
      karkh_employee,karkh_employee,karkh_employee,outdoor_employee,branch_name,'ready');
    insert into public.openings(project_id,opening_code,floor,room,width,height,quantity,
      opening_type,opening_direction,site_readiness,created_by)
    values(project_ids[index], 'VERIFY-1', 'Ground', 'Room',100,100,1,'Window','Sliding','ready',outdoor_employee);
    insert into public.project_workflow_events(project_id,event_type,actor_id,notes)
      values(project_ids[index],'branch_verification',karkh_employee,'Private project history');
    insert into public.project_stage_history(project_id,stage_key,notes)
      values(project_ids[index],'lead','Private stage metrics');
  end loop;
  insert into public.documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(document_ids[1],'project',project_ids[2],'rasafa.txt','branch-verification','rasafa.txt',karkh_employee);
  insert into public.documents(id,owner_type,client_id,file_name,storage_bucket,storage_path,uploaded_by) values
    (document_ids[2],'client',client_ids[2],'rasafa-client.txt','branch-verification','rasafa-client.txt',karkh_employee),
    (document_ids[3],'client',client_ids[3],'shared-client.txt','branch-verification','shared-client.txt',karkh_employee);
  insert into public.follow_up_tasks(id,client_id,project_id,task_type,assigned_to,owner_id,due_at,created_by)
    values(task_id,client_ids[2],project_ids[2],'structure_readiness',karkh_employee,karkh_employee,now(),karkh_employee);
  insert into public.appointments(id,client_id,project_id,appointment_type,assigned_employee_id,created_by,starts_at)
    values(appointment_id,client_ids[2],project_ids[2],'follow_up_call',karkh_employee,karkh_employee,now());
  insert into public.notifications(recipient_id,event_type,entity_type,entity_id,title_key,message_key,payload)
    values(karkh_employee,'branch_verification','follow_up_task',task_id,'private','private',
      jsonb_build_object('project_name','Rasafa private project'));
  insert into public.activity_logs(actor_id,entity_type,entity_id,action,metadata)
    values(karkh_employee,'document',document_ids[1],'branch_verification','{"private":"Rasafa"}');

  -- Create real idempotent registration and follow-up receipts before a transfer.
  register_payload := jsonb_build_object(
    'client',jsonb_build_object('clientName','Receipt transfer fixture','mobile','00000000000','clientType','individual'),
    'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
      'structureReadiness','not_ready','assignedOutdoorSalesId',outdoor_employee));
  result := public.sync_field_change(register_operation,karkh_employee,receipt_project,'register',register_payload,recorded_at,null);
  assert result->>'branch'='Karkh';
  select updated_at into expected_updated_at from public.projects where id=receipt_project;
  follow_up_payload := jsonb_build_object('followUpType','call','nextFollowUp',now()+interval '1 day',
    'note','Same-branch follow-up','followUpOwnerId',karkh_employee);
  result := public.sync_field_change(follow_up_operation,karkh_employee,receipt_project,'follow-up',
    follow_up_payload,recorded_at,expected_updated_at);
  assert result->>'branch'='Karkh', 'Same-branch workflow must remain functional';

  -- Actual authenticated SQL SELECTs test restrictive RLS, not only helpers.
  foreach actor in array array[karkh_employee,rasafa_employee,unassigned_employee] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    set local role authenticated;
    select coalesce(array_agg(id order by id),'{}'::uuid[]) into visible_ids
      from public.projects where id=any(project_ids);
    if actor=karkh_employee then
      assert cardinality(visible_ids)=2 and project_ids[1]=any(visible_ids) and project_ids[4]=any(visible_ids),
        'Karkh must see exactly Karkh projects despite cross-branch ownership';
      assert (select count(*)=2 from public.openings where project_id=any(project_ids));
      assert not exists(select 1 from public.project_workflow_events where project_id=project_ids[2]);
      assert not exists(select 1 from public.project_stage_history_metrics where project_id=project_ids[2]),
        'Owner-created views must respect the caller branch';
      assert exists(select 1 from public.project_stage_history_metrics where project_id=project_ids[1]);
      assert not exists(select 1 from public.clients where id=client_ids[2]);
      assert exists(select 1 from public.clients where id=client_ids[3]), 'Shared client remains available';
      assert not exists(select 1 from public.documents where id in (document_ids[1],document_ids[2])),
        'Uploader and client-document policies cannot disclose the other branch';
      assert exists(select 1 from public.documents where id=document_ids[3]);
      assert not exists(select 1 from public.follow_up_tasks where id=task_id), 'Task assignee cannot bypass branch';
      assert not exists(select 1 from public.appointments where id=appointment_id), 'Appointment assignee cannot bypass branch';
      assert not exists(select 1 from public.notifications where entity_id=task_id);
      assert not exists(select 1 from public.activity_logs where entity_id=document_ids[1]);
      assert not public.can_view_sales_project(project_ids[2]);
      assert not public.can_manage_sales_project(project_ids[2]);
      assert not public.can_read_project_documents(project_ids[2]);
      begin
        perform public.claim_sales_follow_up_task(task_id,karkh_employee);
        raise exception using errcode='ZX001',message='Cross-branch claim was accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.create_measurement_request(project_ids[2],null,null,null,karkh_employee);
        raise exception using errcode='ZX001',message='Cross-branch measurement RPC was accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.create_measurement_request(project_ids[2],null,null,null,manager);
        raise exception using errcode='ZX001',message='Forged actor bypassed branch isolation';
      exception when insufficient_privilege then null; end;
    elsif actor=rasafa_employee then
      assert cardinality(visible_ids)=2 and project_ids[2]=any(visible_ids) and project_ids[5]=any(visible_ids),
        'Rasafa must see exactly Rasafa projects';
      assert not exists(select 1 from public.clients where id=client_ids[1]);
    else
      assert cardinality(visible_ids)=0, 'An unassigned Indoor employee must fail closed';
      assert not exists(select 1 from public.openings where project_id=any(project_ids));
    end if;
    reset role;
  end loop;

  -- service_role bypasses RLS: the current actor, not the caller database role,
  -- must control all trusted-server RPCs.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform public.sync_field_change(gen_random_uuid(),karkh_employee,project_ids[2],'follow-up',
      follow_up_payload,recorded_at,null);
    raise exception using errcode='ZX001',message='Service-role sync bypassed branch isolation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.advance_sales_flow(project_ids[2],'approve',0,'{}',karkh_employee);
    raise exception using errcode='ZX001',message='Quotation RPC bypassed branch isolation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reactivate_client_project(project_ids[2],karkh_employee,'Retry',now());
    raise exception using errcode='ZX001',message='Reactivation RPC bypassed branch isolation';
  exception when insufficient_privilege then null; end;

  update public.profiles set branch='Rasafa' where id=karkh_employee;
  begin
    perform public.sync_field_change(register_operation,karkh_employee,receipt_project,'register',
      register_payload,recorded_at,null);
    raise exception using errcode='ZX001',message='Registration receipt leaked the previous branch after transfer';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_field_change(follow_up_operation,karkh_employee,receipt_project,'follow-up',
      follow_up_payload,recorded_at,expected_updated_at);
    raise exception using errcode='ZX001',message='Mutation receipt leaked the previous branch after transfer';
  exception when insufficient_privilege then null; end;
  assert (select branch='Karkh' from public.projects where id=receipt_project),
    'Changing employee branch must not relabel projects';

  -- Raw job titles preserve the pre-existing Sales Manager and Outdoor behavior.
  foreach actor in array array[manager,outdoor_employee] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    set local role authenticated;
    assert (select count(*)=5 from public.projects where id=any(project_ids)),
      'Sales Manager and originating Outdoor employee retain both branches';
    reset role;
  end loop;
  raise notice 'PASS: Indoor branches, missing branches, ownership/assignment bypasses, related data, service RPCs, transfer receipt replays and other roles';
end;
$test$;
rollback;
