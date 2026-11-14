-- Isolated PostgreSQL fixture only. Restore the live policies first; these
-- checks intentionally exercise permissive legacy grants as authenticated.
begin;

do $fixtures$
declare job text; office text; actor_id uuid; label text; project_branch text;
  creator uuid; assignee uuid; project_id uuid; customer uuid;
  administrator uuid:=md5('governorates-fixture-Admin')::uuid;
begin
  foreach job in array array['Admin','Sales Director','Company Owner'] loop
    actor_id:=md5('governorates-fixture-'||job)::uuid;
    insert into auth.users(id,email) values(actor_id,md5('gov-'||job)||'@example.invalid');
    insert into public.profiles(id,email,full_name,username,role,is_active,status)
      values(actor_id,md5('gov-'||job)||'@example.invalid',job,'gov.'||substr(md5(job),1,10),job::public.app_role,true,'Active');
  end loop;
  foreach job in array array['Indoor Sales','Outdoor Sales','Sales Manager','CEO','HR','Operations Manager','Project Manager','Branch Manager','Project Engineer','Site Engineer','Finance / Accountant','Auditor'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      actor_id:=md5('governorates-fixture-'||job||office)::uuid;
      insert into auth.users(id,email) values(actor_id,md5('gov-'||job||office)||'@example.invalid');
      insert into public.profiles(id,email,full_name,username,role,branch,is_active,status,outdoor_team_key)
        values(actor_id,md5('gov-'||job||office)||'@example.invalid',job||office,'gov.'||substr(md5(job||office),1,10),job::public.app_role,
          nullif(office,'Unassigned'),true,'Active',case when job='Outdoor Sales' then 'sajjad_ehab' end);
    end loop;
  end loop;
  foreach label in array array['teammate','unrelated'] loop
    actor_id:=md5('governorates-fixture-'||label)::uuid;
    insert into auth.users(id,email) values(actor_id,label||'@example.invalid');
    insert into public.profiles(id,email,full_name,username,role,branch,is_active,status,outdoor_team_key)
      values(actor_id,label||'@example.invalid',label,'gov.'||label,'Outdoor Sales','Rasafa',true,'Active',
        case when label='teammate' then 'sajjad_ehab' else 'ahmad_mohammad' end);
  end loop;
  foreach label in array array['own-governorates','team-governorates','unrelated-governorates','karkh-governorates','Karkh','Rasafa','Najaf'] loop
    project_branch:=case when label like '%governorates' then 'Governorates' else label end;
    creator:=case when label='own-governorates' then md5('governorates-fixture-Outdoor SalesRasafa')::uuid
      when label='karkh-governorates' then md5('governorates-fixture-Outdoor SalesKarkh')::uuid else administrator end;
    assignee:=case label
      when 'own-governorates' then md5('governorates-fixture-Outdoor SalesRasafa')::uuid
      when 'team-governorates' then md5('governorates-fixture-teammate')::uuid
      when 'unrelated-governorates' then md5('governorates-fixture-unrelated')::uuid
      when 'karkh-governorates' then md5('governorates-fixture-Outdoor SalesKarkh')::uuid
      else md5('governorates-fixture-Outdoor Sales'||label)::uuid end;
    project_id:=md5('governorates-fixture-project-'||label)::uuid;
    customer:=md5('governorates-fixture-client-'||label)::uuid;
    insert into public.clients(id,client_name,created_by) values(customer,'Governorates fixture '||label,creator);
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id,
      assigned_outdoor_sales_id,sales_status,structure_readiness)
      values(project_id,customer,'Governorates fixture '||label,'TEST-GOV-'||label,project_branch,
        case when project_branch='Governorates' then 'النجف' end,creator,creator,assignee,'new_lead','ready');
    insert into public.openings(id,project_id,width,height,quantity,floor,room,opening_type,opening_direction,created_by)
      values(md5('governorates-fixture-opening-'||label)::uuid,project_id,100,200,2,'GF','Office','Window','Sliding',administrator);
    insert into public.documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
      values(md5('governorates-fixture-document-'||label)::uuid,'project',project_id,'fixture.pdf','project-attachments',project_id::text||'/fixture.pdf',administrator);
    insert into storage.objects(id,bucket_id,name)
      values(md5('governorates-fixture-file-'||label)::uuid,'project-attachments',project_id::text||'/fixture.pdf');
    insert into public.measurement_completion_reports(id,project_id)
      values(md5('governorates-fixture-report-'||label)::uuid,project_id);
  end loop;
  insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(md5('governorates-fixture-mixed-document')::uuid,'project',md5('governorates-fixture-client-own-governorates')::uuid,
      md5('governorates-fixture-project-unrelated-governorates')::uuid,'mixed.pdf','project-attachments','mixed.pdf',administrator);
end;
$fixtures$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $authenticated_scope$
declare actor uuid:=md5('governorates-fixture-Outdoor SalesRasafa')::uuid;
  target uuid; label text; allowed boolean; changed integer; job text; office text;
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  assert public.current_employee_can_access_project_row('Governorates',actor,null),'Creator scope disappeared';
  assert public.current_employee_can_access_project_row('Governorates',null,md5('governorates-fixture-teammate')::uuid),'Same-office team scope disappeared';
  assert not public.current_employee_can_access_project_row('Governorates',null,md5('governorates-fixture-Outdoor SalesKarkh')::uuid),'Outdoor teams crossed offices';
  foreach label in array array['own-governorates','team-governorates','unrelated-governorates','karkh-governorates','Karkh','Rasafa','Najaf'] loop
    target:=md5('governorates-fixture-project-'||label)::uuid;
    allowed:=label in ('own-governorates','team-governorates','Rasafa');
    assert public.can_access_indoor_project_branch(target)=allowed,format('Wrong Rasafa Outdoor project scope: %s',label);
    assert public.can_access_indoor_client_branch(md5('governorates-fixture-client-'||label)::uuid)=allowed,format('Wrong client scope: %s',label);
    assert exists(select 1 from public.projects where id=target)=allowed,format('Wrong direct project read: %s',label);
    assert not exists(select 1 from public.openings where project_id=target and not allowed),'Foreign opening exposed';
    assert not exists(select 1 from public.measurement_completion_reports where project_id=target and not allowed),'Foreign report exposed';
    assert not exists(select 1 from public.clients where id=md5('governorates-fixture-client-'||label)::uuid and not allowed),'Foreign client exposed';
    assert not exists(select 1 from public.documents where project_id=target and not allowed),'Foreign document exposed';
    assert not exists(select 1 from storage.objects where id=md5('governorates-fixture-file-'||label)::uuid and not allowed),'Foreign storage exposed';
    update public.projects set project_notes='authenticated fixture' where id=target;
    get diagnostics changed=row_count;
    assert changed=case when allowed then 1 else 0 end,format('Wrong direct project update scope: %s',label);
    update public.clients set mobile='00000000000' where id=md5('governorates-fixture-client-'||label)::uuid;
    get diagnostics changed=row_count;
    assert allowed or changed=0,format('Foreign direct client update: %s',label);
    if label='own-governorates' then assert changed=1,'Creator lost their existing client update permission'; end if;
  end loop;
  assert not exists(select 1 from public.documents where id=md5('governorates-fixture-mixed-document')::uuid),'Owned client bypassed unrelated project document scope';
  begin
    insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
      values(gen_random_uuid(),'project',md5('governorates-fixture-client-own-governorates')::uuid,
        md5('governorates-fixture-project-unrelated-governorates')::uuid,'blocked.pdf','project-attachments','blocked.pdf',actor);
    raise exception 'Owned client bypassed unrelated document insert scope';
  exception when insufficient_privilege then null; end;
  insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id,assigned_outdoor_sales_id,sales_status,structure_readiness)
    values(md5('governorates-fixture-direct-insert')::uuid,md5('governorates-fixture-client-own-governorates')::uuid,
      'Direct Governorates fixture','TEST-GOV-DIRECT','Governorates','البصرة',actor,actor,actor,'new_lead','ready');
  assert exists(select 1 from public.projects where id=md5('governorates-fixture-direct-insert')::uuid),'New Governorates row failed direct INSERT/SELECT';
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
      values(gen_random_uuid(),md5('governorates-fixture-client-own-governorates')::uuid,'Forbidden Najaf','TEST-GOV-BLOCKED','Najaf',actor);
    raise exception 'Rasafa Outdoor created a Najaf office project';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by)
      values(gen_random_uuid(),md5('governorates-fixture-client-own-governorates')::uuid,'Forged creator','TEST-GOV-SPOOF','Governorates','البصرة',md5('governorates-fixture-Admin')::uuid);
    raise exception 'Rasafa Outdoor spoofed another project creator';
  exception when insufficient_privilege then null; end;

  -- Other roles retain their office boundary. Geographic النجف in Governorates
  -- is Karkh follow-up work and never grants access to the Najaf office branch.
  foreach job in array array['Indoor Sales','Outdoor Sales','Sales Manager','CEO','HR','Operations Manager','Project Manager','Branch Manager','Project Engineer','Site Engineer','Finance / Accountant','Auditor','Admin','Sales Director','Company Owner'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      actor:=case when job in ('Admin','Sales Director','Company Owner') then md5('governorates-fixture-'||job)::uuid
        else md5('governorates-fixture-'||job||office)::uuid end;
      perform set_config('request.jwt.claim.sub',actor::text,true);
      foreach label in array array['own-governorates','unrelated-governorates','Karkh','Rasafa','Najaf'] loop
        target:=md5('governorates-fixture-project-'||label)::uuid;
        allowed:=job in ('Admin','Sales Director','Company Owner')
          or (office='Karkh' and label in ('Karkh','own-governorates','unrelated-governorates'))
          or (office in ('Rasafa','Najaf') and label=office)
          or (job='Outdoor Sales' and office='Rasafa' and label='own-governorates');
        assert public.can_access_indoor_project_branch(target)=allowed,format('Office isolation changed: %s/%s -> %s',job,office,label);
        assert not exists(select 1 from public.projects where id=target and not allowed),format('Office read escaped: %s/%s -> %s',job,office,label);
      end loop;
    end loop;
  end loop;
end;
$authenticated_scope$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $registration_and_routing$
declare actor uuid:=md5('governorates-fixture-Outdoor SalesRasafa')::uuid;
  operation uuid:=gen_random_uuid(); registered uuid:=gen_random_uuid(); receipt jsonb; replay jsonb;
  target uuid:=md5('governorates-fixture-project-own-governorates')::uuid;
  payload jsonb:='{"client":{"clientName":"Governorates registration fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Governorates fixture","structureReadiness":"ready","branch":"Governorates","governorate":"النجف","buildingType":"villa_house"}}';
  office text; job text; candidate uuid; allowed boolean; result jsonb;
  opening_id uuid:=gen_random_uuid(); opening_operation uuid:=gen_random_uuid(); opening_payload jsonb;
begin
  assert public.project_branch_matches_employee('Karkh','Governorates');
  assert not public.project_branch_matches_employee('Rasafa','Governorates'),'Follow-up office matcher was broadened';
  assert not public.project_branch_matches_employee('Najaf','Governorates');
  assert not public.project_branch_matches_employee('Rasafa','Najaf');
  assert not has_function_privilege('authenticated','public.employee_can_access_project_branch(uuid,text)','execute'),'Private actor helper was exposed';
  assert not has_function_privilege('anon','public.current_employee_can_access_project_row(text,uuid,uuid)','execute'),'Anonymous row helper was exposed';

  receipt:=public.sync_field_change(operation,actor,registered,'register',payload,now(),null);
  replay:=public.sync_field_change(operation,actor,registered,'register',payload,now(),null);
  assert receipt=replay,'Governorates registration retry was not idempotent';
  assert (select branch='Governorates' and governorate='النجف' and created_by=actor and owner_id=actor and sales_engineer_id=actor
    from public.projects where id=registered),'Governorates creation lost routing or creator ownership';
  assert (select count(*)=1 from public.field_sync_receipts where operation_id=operation),'Governorates retry duplicated a receipt';
  opening_payload:=jsonb_build_object('id',opening_id,'floor','GF','room','Office','width',100,'height',200,
    'quantity',3,'structuralType','Window','openingType','Sliding');
  perform public.sync_field_change(opening_operation,actor,registered,'opening',opening_payload,now(),null);
  perform public.sync_field_change(opening_operation,actor,registered,'opening',opening_payload,now(),null);
  assert (select count(*)=1 from public.openings where id=opening_id and project_id=registered and quantity=3 and created_by=actor),
    'Governorates owner could not record and safely retry an opening';
  assert exists(select 1 from public.sales_notification_recipients(registered) employee
    where employee=md5('governorates-fixture-Indoor SalesKarkh')::uuid),'Karkh follow-up was not notified';
  assert not exists(select 1 from public.sales_notification_recipients(registered) employee join public.profiles profile on profile.id=employee
    where profile.branch is distinct from 'Karkh'),'Governorates notified another office';
  result:=public.register_sales_project(actor,jsonb_set(payload,'{client,clientName}','"Governorates online fixture"'));
  assert (select branch='Governorates' and governorate='النجف' from public.projects where id=(result->>'projectId')::uuid),'Online registration wrapper failed';

  -- Private branch guard runs before replay and must retain ownership for the
  -- newly restored exception, even inside service-role security-definer RPCs.
  perform public.require_indoor_project_branch(registered,actor);
  perform public.require_indoor_project_branch(md5('governorates-fixture-project-team-governorates')::uuid,actor);
  begin
    perform public.require_indoor_project_branch(md5('governorates-fixture-project-unrelated-governorates')::uuid,actor);
    raise exception 'Service branch guard accepted unrelated Governorates work';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_field_change(gen_random_uuid(),actor,md5('governorates-fixture-project-unrelated-governorates')::uuid,'opening','{}',now(),null);
    raise exception 'Service RPC accepted unrelated Governorates work';
  exception when insufficient_privilege then null; end;

  foreach job in array array['Outdoor Sales','Indoor Sales','Sales Manager'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      candidate:=md5('governorates-fixture-'||job||office)::uuid;
      allowed:=office='Karkh' or (office='Rasafa' and job='Outdoor Sales');
      assert public.employee_can_access_project_branch(candidate,'Governorates')=allowed,'Actor branch helper changed another role or office';
      if allowed then
        if job='Outdoor Sales' then
          result:=public.register_sales_project(candidate,jsonb_set(payload,'{client,clientName}',to_jsonb('Governorates '||office)));
          assert (select branch='Governorates' from public.projects where id=(result->>'projectId')::uuid),'Eligible Outdoor registration failed';
        end if;
      elsif office='Unassigned' and job<>'Outdoor Sales' then
        -- Non-Outdoor creation reaches the existing explicit office error.
        begin
          perform public.register_sales_project(candidate,payload);
          raise exception 'Unassigned employee registered Governorates work';
        exception when invalid_parameter_value then null; end;
      else
        begin
          perform public.register_sales_project(candidate,payload);
          raise exception 'Ineligible employee registered Governorates work';
        exception when insufficient_privilege then null; end;
      end if;
    end loop;
  end loop;
  begin
    perform public.register_sales_project(actor,jsonb_set(payload,'{project,branch}','"Najaf"') #- '{project,governorate}');
    raise exception 'Rasafa Outdoor registered the Najaf office';
  exception when insufficient_privilege then null; end;
  begin
    perform public.register_sales_project(actor,jsonb_set(payload,'{project,branch}','"Karkh"') #- '{project,governorate}');
    raise exception 'Rasafa Outdoor registered the Karkh office';
  exception when insufficient_privilege then null; end;
  begin
    perform public.register_sales_project(actor,payload #- '{project,governorate}');
    raise exception 'Governorates registration omitted the geographic governorate';
  exception when invalid_parameter_value then null; end;

  update public.projects set follow_up_owner_id=md5('governorates-fixture-Indoor SalesKarkh')::uuid where id=target;
  assert (select count(*)=1 from public.sales_notification_recipients(target)),'Assigned Karkh follow-up owner was not retained';
  foreach job in array array['Indoor Sales','Sales Manager'] loop
    foreach office in array array['Rasafa','Najaf'] loop
      begin
        update public.projects set follow_up_owner_id=md5('governorates-fixture-'||job||office)::uuid where id=target;
        raise exception 'Governorates follow-up accepted another office';
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
  begin
    update public.projects set assigned_outdoor_sales_id=md5('governorates-fixture-Outdoor SalesNajaf')::uuid where id=target;
    raise exception 'Najaf employee was assigned Governorates work';
  exception when insufficient_privilege then null; end;
  update public.projects set assigned_outdoor_sales_id=md5('governorates-fixture-teammate')::uuid where id=target;
  assert exists(select 1 from public.outdoor_sales_team_member_ids(actor) member where member=md5('governorates-fixture-teammate')::uuid),'Rasafa team assignment was lost';
  assert not exists(select 1 from public.outdoor_sales_team_member_ids(actor) member where member=md5('governorates-fixture-Outdoor SalesKarkh')::uuid),'Team membership crossed offices';

  update public.profiles set branch='Najaf' where id=actor;
  begin
    perform public.sync_field_change(operation,actor,registered,'register',payload,now(),null);
    raise exception 'Governorates receipt leaked after transfer to Najaf';
  exception when insufficient_privilege then null; end;
  update public.profiles set branch='Rasafa',is_active=false,status='Inactive' where id=actor;
  begin
    perform public.sync_field_change(operation,actor,registered,'register',payload,now(),null);
    raise exception 'Governorates receipt leaked after employee deactivation';
  exception when insufficient_privilege then null; end;
  update public.profiles set is_active=true,status='Active' where id=actor;
  replay:=public.sync_field_change(operation,actor,registered,'register',payload,now(),null);
  assert receipt=replay,'Governorates retry failed after active office restoration';
end;
$registration_and_routing$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('governorates-fixture-Outdoor SalesRasafa')::uuid::text,true);
do $authenticated_identity$
begin
  begin
    perform public.register_sales_project(md5('governorates-fixture-Admin')::uuid,
      '{"client":{"clientName":"Spoofed actor"},"project":{"branch":"Governorates","governorate":"البصرة"}}');
    raise exception 'Authenticated registration spoofed a global actor';
  exception when insufficient_privilege then null; end;
end;
$authenticated_identity$;
reset role;

insert into public.measurement_requests(id,project_id,requested_by,assigned_to,status)
values(md5('governorates-fixture-request')::uuid,md5('governorates-fixture-project-own-governorates')::uuid,
  md5('governorates-fixture-Admin')::uuid,md5('governorates-fixture-Outdoor SalesRasafa')::uuid,'requested');
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $anonymous_rpc$
begin
  begin
    perform public.create_measurement_request(md5('governorates-fixture-project-own-governorates')::uuid,null,null,null,md5('governorates-fixture-Admin')::uuid);
    raise exception 'Anonymous legacy RPC spoofed a global actor';
  exception when insufficient_privilege then null; end;
  begin
    perform public.assign_measurement_request(md5('governorates-fixture-request')::uuid,md5('governorates-fixture-Outdoor SalesRasafa')::uuid,null,null,md5('governorates-fixture-Admin')::uuid);
    raise exception 'Anonymous legacy assignment spoofed a global actor';
  exception when insufficient_privilege then null; end;
end;
$anonymous_rpc$;
reset role;
do $anonymous_creation_guard$
begin
  begin
    perform public.require_outdoor_project_creation_branch(md5('governorates-fixture-Admin')::uuid,'Governorates');
    raise exception 'Anonymous registration guard accepted a global actor';
  exception when insufficient_privilege then null; end;
end;
$anonymous_creation_guard$;

rollback;
