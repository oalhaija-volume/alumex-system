-- Run after 20261111010000. All synthetic users, records and JWT changes roll back.
begin;
do $test$
declare
  karkh uuid:=gen_random_uuid();
  rasafa uuid:=gen_random_uuid();
  transferred uuid:=gen_random_uuid();
  unassigned uuid:=gen_random_uuid();
  manager uuid:=gen_random_uuid();
  outdoor uuid:=gen_random_uuid();
  administrator uuid:=gen_random_uuid();
  executive uuid:=gen_random_uuid();
  customers uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  sites uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  document_id uuid:=gen_random_uuid();
  client_document_id uuid:=gen_random_uuid();
  task_id uuid:=gen_random_uuid();
  appointment_id uuid:=gen_random_uuid();
  stale_notification uuid:=gen_random_uuid();
  operation uuid:=gen_random_uuid();
  employee uuid;
  branch_name text;
  customer uuid;
  stamp timestamptz;
  visible uuid[];
  result jsonb;
  before_project jsonb;
  index integer;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,email)
    select id,id::text||'@example.invalid'
    from unnest(array[karkh,rasafa,transferred,unassigned,manager,outdoor,administrator,executive]) id;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id in(karkh,transferred);
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=rasafa;
  update profiles set role='Indoor Sales',branch=null,is_active=true,status='Active' where id=unassigned;
  update profiles set role='Sales Manager',branch='Rasafa',is_active=true,status='Active' where id=manager;
  update profiles set role='Outdoor Sales',outdoor_team_key='sajjad_ehab',is_active=true,status='Active' where id=outdoor;
  update profiles set role='Admin',is_active=true,status='Active' where id=administrator;
  update profiles set role='CEO',is_active=true,status='Active' where id=executive;
  for index in 1..4 loop
    insert into clients(id,client_name,client_type,created_by)
      values(customers[index],'Governorates boundary fixture '||index,'individual',rasafa);
  end loop;
  -- Admin-created fixtures avoid unrelated Outdoor monthly-rotation validation.
  -- Governorates deliberately carries Rasafa ownership fields, which must not
  -- override geography. Shared clients retain legitimate Rasafa-private access.
  for index in 1..6 loop
    branch_name:=case index when 1 then 'Karkh' when 2 then 'Rasafa' when 6 then 'Rasafa' else 'Governorates' end;
    customer:=case index when 1 then customers[1] when 2 then customers[2] when 5 then customers[4] when 6 then customers[4] else customers[3] end;
    insert into projects(id,client_id,project_number,project_name,created_by,branch,governorate,
      owner_id,responsible_user_id,follow_up_owner_id,assigned_outdoor_sales_id,structure_readiness,sales_status,next_follow_up_at)
    values(sites[index],customer,'VERIFY-KARKH-GOV-'||sites[index],'Governorates boundary fixture',administrator,
      branch_name,case when branch_name='Governorates' then 'الرمادي' end,
      rasafa,rasafa,case when index=4 then transferred end,outdoor,'ready','new_lead',
      case when index=4 then now()-interval '1 minute' end);
    insert into openings(project_id,opening_code,floor,room,width,height,quantity,
      opening_type,opening_direction,site_readiness,created_by)
    values(sites[index],'VERIFY-1','Ground','Room',100,100,1,'Window','Sliding','ready',outdoor);
    insert into project_workflow_events(project_id,event_type,actor_id,notes)
      values(sites[index],'governorates_boundary_fixture',rasafa,'Private project history');
    if to_regclass('public.project_stage_history') is not null then
      insert into public.project_stage_history(project_id,stage_key,notes)
        values(sites[index],'lead','Private stage history');
    end if;
  end loop;
  -- A legitimate employee transfer simulates an existing now-ineligible owner;
  -- neither the migration nor reminders may overwrite that original assignment.
  update profiles set branch='Rasafa' where id=transferred;
  select to_jsonb(p) into before_project from projects p where id=sites[4];
  insert into documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(document_id,'project',sites[3],'governorates.txt','governorates-verification','project.txt',rasafa);
  insert into documents(id,owner_type,client_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(client_document_id,'client',customers[3],'governorates-client.txt','governorates-verification','client.txt',rasafa);
  insert into follow_up_tasks(id,client_id,project_id,task_type,assigned_to,owner_id,due_at,created_by)
    values(task_id,customers[3],sites[3],'structure_readiness',rasafa,rasafa,now(),administrator);
  insert into appointments(id,client_id,project_id,appointment_type,assigned_employee_id,created_by,starts_at)
    values(appointment_id,customers[3],sites[3],'follow_up_call',rasafa,administrator,now());
  insert into notifications(recipient_id,event_type,entity_type,entity_id,title_key,message_key,payload)
    select id,'governorates_boundary_fixture','project',sites[3],'private','private','{"private":"Governorates"}'::jsonb
    from unnest(array[karkh,rasafa]) id;
  insert into notifications(id,recipient_id,event_type,entity_type,entity_id,title_key,message_key,payload,deduplication_key)
    select stale_notification,transferred,'follow_up_due','project',p.id,'private','private','{"private":"Governorates"}',
      'follow-up-due:'||p.id::text||':'||extract(epoch from p.next_follow_up_at)::text
    from projects p where p.id=sites[4];
  insert into activity_logs(actor_id,entity_type,entity_id,action,metadata)
    values(rasafa,'document',document_id,'governorates_boundary_fixture','{"private":"Governorates"}');
  insert into audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value)
    values(rasafa,'Indoor Sales','governorates_boundary_fixture','project',sites[3],'{}','{"private":"Governorates"}');

  -- Recipient resolution and the real receipt trigger exclude Rasafa while
  -- preserving actual Sales Managers and assigned Outdoor team notifications.
  if not exists(select 1 from sales_notification_recipients(sites[3]) id where id=karkh)
    or not exists(select 1 from sales_notification_recipients(sites[3]) id where id=manager)
    or exists(select 1 from sales_notification_recipients(sites[3]) id where id in(rasafa,transferred,unassigned)) then
    raise exception 'Unclaimed Governorates recipients crossed the Karkh Indoor boundary';
  end if;
  insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(operation,outdoor,sites[3],'register',md5(operation::text),now(),'{}');
  if not exists(select 1 from notifications where entity_id=sites[3] and recipient_id=karkh and event_type='project_follow_up_assigned')
    or not exists(select 1 from notifications where entity_id=sites[3] and recipient_id=manager and event_type='project_follow_up_assigned')
    or exists(select 1 from notifications where entity_id=sites[3] and recipient_id in(rasafa,transferred,unassigned) and event_type='project_follow_up_assigned')
    or not exists(select 1 from notifications where entity_id=sites[3] and recipient_id=outdoor and event_type='measurement_assigned') then
    raise exception 'Governorates receipt notifications did not retain the correct Indoor/Outdoor recipients';
  end if;

  foreach employee in array array[karkh,rasafa,transferred,unassigned] loop
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub',employee::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',employee,'role','authenticated')::text,true);
    set local role authenticated;
    select coalesce(array_agg(id),'{}'::uuid[]) into visible from projects where id=any(sites);
    if employee=karkh then
      if cardinality(visible)<>4 or not sites[1]=any(visible) or not sites[3]=any(visible)
        or not sites[4]=any(visible) or not sites[5]=any(visible) then
        raise exception 'Karkh must see its own branch and all Governorates projects';
      end if;
      if not exists(select 1 from openings where project_id=sites[3])
        or not exists(select 1 from project_workflow_events where project_id=sites[3])
        or not exists(select 1 from documents where id in(document_id,client_document_id))
        or not exists(select 1 from clients where id=customers[3])
        or not exists(select 1 from notifications where entity_id=sites[3] and recipient_id=karkh) then
        raise exception 'Karkh Governorates related data is inaccessible';
      end if;
    elsif employee in(rasafa,transferred) then
      if cardinality(visible)<>2 or not sites[2]=any(visible) or not sites[6]=any(visible) then
        raise exception 'Rasafa must see only its own private projects';
      end if;
      if can_access_indoor_project_branch(sites[3]) or can_view_sales_project(sites[3])
        or can_manage_sales_project(sites[3]) or can_access_indoor_client_branch(customers[3])
        or can_access_indoor_entity_branch('document',document_id)
        or exists(select 1 from clients where id=customers[3])
        or exists(select 1 from openings where project_id in(sites[3],sites[4],sites[5]))
        or exists(select 1 from project_workflow_events where project_id=sites[3])
        or exists(select 1 from documents where id in(document_id,client_document_id))
        or exists(select 1 from follow_up_tasks where id=task_id)
        or exists(select 1 from appointments where id=appointment_id)
        or exists(select 1 from notifications where entity_id in(sites[3],sites[4],sites[5])) then
        raise exception 'Rasafa ownership/upload/assignment bypass exposed Governorates data';
      end if;
      -- Some installed databases deny these entire management tables to Indoor
      -- roles. That stronger restriction is valid; never grant access for QA.
      begin
        if exists(select 1 from public.activity_logs where entity_id=document_id) then
          raise exception 'Activity history exposed Governorates data to Rasafa';
        end if;
      exception when insufficient_privilege then null; end;
      begin
        if exists(select 1 from public.audit_events where entity_id=sites[3]) then
          raise exception 'Audit history exposed Governorates data to Rasafa';
        end if;
      exception when insufficient_privilege then null; end;
      if to_regclass('public.project_stage_history_metrics') is not null then
        if exists(select 1 from public.project_stage_history_metrics where project_id=sites[3]) then
          raise exception 'Optional stage-history view exposed Governorates data to Rasafa';
        end if;
      end if;
      if not exists(select 1 from clients where id=customers[4]) then
        raise exception 'A legitimate client shared with a Rasafa-private project became inaccessible';
      end if;
    else
      if cardinality(visible)<>0 or can_access_indoor_project_branch(sites[3]) then
        raise exception 'Missing Indoor branch did not fail closed';
      end if;
    end if;
    reset role;
  end loop;
  -- Actual Sales Manager, leadership and assigned Outdoor access remain intact.
  foreach employee in array array[manager,administrator,executive,outdoor] loop
    perform set_config('request.jwt.claim.sub',employee::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',employee,'role','authenticated')::text,true);
    set local role authenticated;
    if not exists(select 1 from projects where id=sites[3])
      or not can_access_indoor_project_branch(sites[3]) then
      raise exception 'Governorates restriction changed another role permission';
    end if;
    reset role;
  end loop;

  -- A stale Rasafa owner loses both access and reminders. Karkh and actual
  -- Managers receive the due alert instead, without changing stored ownership.
  foreach employee in array array[transferred,karkh,manager] loop
    perform set_config('request.jwt.claim.sub',employee::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',employee,'role','authenticated')::text,true);
    set local role authenticated;
    perform deliver_due_follow_up_notifications();
    if employee=transferred then
      if exists(select 1 from notifications where entity_id=sites[4]) then
        raise exception 'Transferred Rasafa owner received a Governorates due reminder';
      end if;
    elsif not exists(select 1 from notifications where entity_id=sites[4] and recipient_id=employee and event_type='follow_up_due' and read_at is null) then
      raise exception 'Stale Governorates ownership stranded its due reminder';
    end if;
    reset role;
  end loop;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if (select to_jsonb(p) from projects p where p.id=sites[4]) is distinct from before_project
    or not exists(select 1 from notifications where id=stale_notification and read_at is not null) then
    raise exception 'Reminder routing changed original ownership or failed to retire the hidden old alert';
  end if;

  -- Trusted-server/direct-ID and receipt replays obey the same branch guard.
  foreach employee in array array[rasafa,transferred,unassigned] loop
    begin
      perform require_indoor_project_branch(sites[3],employee);
      raise exception using errcode='ZX001',message='Rasafa service branch guard accepted Governorates';
    exception when insufficient_privilege then null; end;
    begin
      perform sync_field_change(gen_random_uuid(),employee,sites[3],'follow-up',
        jsonb_build_object('nextFollowUp',now()+interval '1 day','followUpType','call','followUpOwnerId',employee),now(),null);
      raise exception using errcode='ZX001',message='Rasafa sync bypassed Governorates branch guard';
    exception when insufficient_privilege then null; end;
    begin
      perform advance_sales_flow(sites[3],'approve',0,'{}',employee);
      raise exception using errcode='ZX001',message='Rasafa commercial RPC bypassed Governorates branch guard';
    exception when insufficient_privilege then null; end;
    begin
      perform sync_field_change(operation,employee,sites[3],'register','{}',now(),null);
      raise exception using errcode='ZX001',message='Rasafa registration replay bypassed Governorates branch guard';
    exception when insufficient_privilege then null; end;
    begin
      perform rename_project_client(sites[3],employee,'Forbidden','Governorates boundary fixture 3');
      raise exception using errcode='ZX001',message='Rasafa client rename bypassed Governorates branch guard';
    exception when insufficient_privilege then null; end;
  end loop;
  perform require_indoor_project_branch(sites[3],karkh);
  perform require_indoor_project_branch(sites[3],manager);
  update profiles set is_active=false,status='Inactive' where id=karkh;
  if not exists(select 1 from profiles where id=karkh and is_active is false and status='Inactive') then
    raise exception 'Inactive actor fixture was not stored as inactive';
  end if;
  begin
    perform require_indoor_project_branch(sites[3],karkh);
    raise exception using errcode='ZX001',message='Inactive Karkh employee accepted Governorates';
  exception when insufficient_privilege then null; end;
  update profiles set is_active=true,status='Active' where id=karkh;

  -- New cross-branch follow-up assignments are rejected, including forged
  -- payloads sent through the trusted server. Manager ownership remains valid.
  begin
    update projects set follow_up_owner_id=rasafa where id=sites[3];
    raise exception using errcode='ZX001',message='Direct assignment created a hidden Rasafa Governorates owner';
  exception when insufficient_privilege then
    if sqlerrm<>'Governorates follow-up must be assigned to Karkh Indoor Sales or a Sales Manager.' then raise; end if;
  end;
  select updated_at into stamp from projects where id=sites[3];
  begin
    perform sync_field_change(gen_random_uuid(),karkh,sites[3],'follow-up',
      jsonb_build_object('nextFollowUp',now()+interval '1 day','followUpType','call','followUpOwnerId',rasafa),now(),stamp);
    raise exception using errcode='ZX001',message='Forged follow-up payload created a hidden Rasafa owner';
  exception when insufficient_privilege then
    if sqlerrm<>'Governorates follow-up must be assigned to Karkh Indoor Sales or a Sales Manager.' then raise; end if;
  end;
  result:=sync_field_change(gen_random_uuid(),karkh,sites[3],'follow-up',
    jsonb_build_object('nextFollowUp',now()+interval '1 day','followUpType','call','followUpOwnerId',manager),now(),stamp);
  if result->>'follow_up_owner_id' is distinct from manager::text
    or (select count(*) from sales_notification_recipients(sites[3]))<>1 then
    raise exception 'Actual Sales Manager lost Governorates ownership/recipient eligibility';
  end if;
  -- Updating an unrelated property never forces an unaudited owner reassignment.
  update projects set project_notes='Legacy owner preserved',follow_up_owner_id=follow_up_owner_id where id=sites[4];
  if not exists(select 1 from projects where id=sites[4] and follow_up_owner_id=transferred) then
    raise exception 'Legacy Governorates owner was silently changed';
  end if;
  begin
    update projects set branch='Karkh',governorate=null where id=sites[3];
    raise exception using errcode='ZX001',message='Governorates geography was relabeled';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from projects where id=sites[3] and branch='Governorates' and governorate='الرمادي') then
    raise exception 'Registered Governorates location changed';
  end if;
  if has_function_privilege('authenticated','public.require_indoor_project_branch(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.sales_notification_recipients(uuid)','execute')
    or has_function_privilege('authenticated','public.require_governorate_follow_up_owner()','execute') then
    raise exception 'Server-only Governorates routing function was exposed to browsers';
  end if;
  raise notice 'PASS: Karkh-only Governorates RLS/RPCs, related records, notifications, stale-owner fallback, owner validation and unchanged geography/other roles';
end;
$test$;
rollback;
