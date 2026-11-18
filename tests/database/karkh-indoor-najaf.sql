-- Run only against a disposable PostgreSQL fixture. The runner seeds an
-- unmarked historical Governorates/Najaf project before the new migration.
begin;

do $fixtures$
declare job text; office text; employee uuid;
begin
  foreach job in array array['Indoor Sales','Sales Manager','Outdoor Sales','Admin'] loop
    foreach office in array array['Karkh','Rasafa','Najaf'] loop
      employee:=md5('karkh-najaf-'||job||office)::uuid;
      insert into auth.users(id,email) values(employee,md5(job||office)||'.karkhnajaf@example.invalid');
      insert into public.profiles(id,email,username,full_name,role,branch,is_active,status)
        values(employee,md5(job||office)||'.karkhnajaf@example.invalid','karkhnajaf.'||substr(md5(job||office),1,10),
          job||office,job::public.app_role,office,true,'Active');
    end loop;
  end loop;
end;
$fixtures$;

do $registration$
declare actor uuid:=md5('karkh-najaf-Indoor SalesKarkh')::uuid;
  project_id uuid:=md5('karkh-najaf-project')::uuid;
  operation uuid:=md5('karkh-najaf-operation')::uuid;
  payload jsonb; result jsonb; replay jsonb; online jsonb; job text; office text; candidate uuid;
begin
  payload:=jsonb_build_object('client',jsonb_build_object('clientName','Karkh Najaf fixture','clientType','individual','mobile','00000000000'),
    'project',jsonb_build_object('address','Najaf fixture address','structureReadiness','ready','branch','Governorates',
      'governorate','النجف','buildingType','villa_house','assignedOutdoorSalesId',actor));
  result:=public.sync_field_change(operation,actor,project_id,'register',payload,now(),null);
  assert result->>'governorate_office'='Karkh','Offline registration result lost the immutable handling office';
  assert (select branch='Governorates' and governorate='النجف' and governorate_office='Karkh'
    and created_by=actor and owner_id=actor and assigned_outdoor_sales_id=actor
    from public.projects where id=project_id),'Karkh registration lost geography, routing or ownership';
  replay:=public.sync_field_change(operation,actor,project_id,'register',payload,now(),null);
  assert replay=result,'Najaf registration retry changed its saved receipt';
  assert (select count(*)=1 from public.projects where id=project_id),'Retry created a duplicate project';
  online:=public.register_sales_project(actor,payload);
  assert (select governorate_office='Karkh' from public.projects where id=(online->>'projectId')::uuid),
    'Online registration did not use the same trusted routing';

  foreach job in array array['Indoor Sales','Sales Manager','Outdoor Sales','Admin'] loop
    foreach office in array array['Karkh','Rasafa','Najaf'] loop
      if job='Indoor Sales' and office='Karkh' then continue; end if;
      candidate:=md5('karkh-najaf-'||job||office)::uuid;
      begin
        perform public.register_sales_project(candidate,jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(candidate)));
        raise exception 'Unauthorized actor registered geographic Najaf: %/%',job,office;
      exception when invalid_parameter_value then null; when insufficient_privilege then null; end;
    end loop;
  end loop;

  -- The dedicated branch remains a separate choice for Najaf employees.
  candidate:=md5('karkh-najaf-Outdoor SalesNajaf')::uuid;
  perform public.sync_field_change(md5('karkh-najaf-dedicated-operation')::uuid,candidate,
    md5('karkh-najaf-dedicated-project')::uuid,'register',
    jsonb_set(jsonb_set(payload,'{project,branch}','"Najaf"'),'{project,assignedOutdoorSalesId}',to_jsonb(candidate)) #- '{project,governorate}',now(),null);
  assert (select branch='Najaf' and governorate is null and governorate_office is null
    from public.projects where id=md5('karkh-najaf-dedicated-project')::uuid);

  -- Marker-only updates cannot turn historical/private rows into Karkh work.
  begin
    update public.projects set governorate_office='Karkh' where id=md5('karkh-najaf-historical-project')::uuid;
    raise exception 'Historical Najaf routing was mutable';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set governorate_office=null where id=project_id;
    raise exception 'Karkh handling marker was mutable';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set governorate='البصرة' where id=project_id;
    raise exception 'Registered governorate was mutable';
  exception when insufficient_privilege then null; end;
  assert (select branch='Governorates' and governorate='النجف' and governorate_office is null
    from public.projects where id=md5('karkh-najaf-historical-project')::uuid),'Historical Najaf record was relabeled';
  replay:=public.sync_field_change(md5('karkh-najaf-historical-operation')::uuid,
    md5('karkh-najaf-historical-author')::uuid,md5('karkh-najaf-historical-project')::uuid,'register',
    '{"client":{"clientName":"Historical Najaf fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Fixture","structureReadiness":"ready","branch":"Governorates","governorate":"النجف","buildingType":"villa_house"}}',now(),null);
  assert replay=(select receipt.result from public.field_sync_receipts receipt
    where operation_id=md5('karkh-najaf-historical-operation')::uuid),'Historical registration receipt stopped replaying';

  -- Direct writes cannot forge the server-owned routing marker.
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,governorate_office,created_by,owner_id)
      select gen_random_uuid(),client_id,'Forged Najaf marker','FORGED-KARKH-NAJAF','Governorates','النجف','Karkh',
        md5('karkh-najaf-Outdoor SalesKarkh')::uuid,md5('karkh-najaf-Outdoor SalesKarkh')::uuid from public.projects where id=project_id;
    raise exception 'Outdoor forged the Karkh governorate marker';
  exception when invalid_parameter_value then null; end;

  -- Normal assignment and follow-up continue within Karkh's governorates.
  update public.projects set assigned_outdoor_sales_id=md5('karkh-najaf-Outdoor SalesKarkh')::uuid,
    follow_up_owner_id=actor where id=project_id;
  begin
    update public.projects set assigned_outdoor_sales_id=md5('karkh-najaf-Outdoor SalesNajaf')::uuid where id=project_id;
    raise exception 'Karkh governorate project accepted a Najaf branch assignee';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set follow_up_owner_id=md5('karkh-najaf-Indoor SalesNajaf')::uuid where id=project_id;
    raise exception 'Karkh governorate follow-up crossed into Najaf branch';
  exception when insufficient_privilege then null; end;
  assert exists(select 1 from public.sales_notification_recipients(project_id) recipient where recipient=actor),
    'Karkh Indoor follow-up notifications did not reach the owner';
  assert not exists(select 1 from public.sales_notification_recipients(project_id) recipient
    join public.profiles profile on profile.id=recipient where profile.branch is distinct from 'Karkh'),
    'Karkh governorate notifications crossed offices';
end;
$registration$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('karkh-najaf-Indoor SalesKarkh')::uuid::text,true);
do $karkh_visibility$
begin
  assert public.can_access_indoor_project_branch(md5('karkh-najaf-project')::uuid),'Karkh lost its new governorate project';
  assert exists(select 1 from public.projects where id=md5('karkh-najaf-project')::uuid),'RLS hid the Karkh-handled project';
  assert not public.can_access_indoor_project_branch(md5('karkh-najaf-dedicated-project')::uuid),'Karkh gained Najaf branch access';
  assert not exists(select 1 from public.projects where id=md5('karkh-najaf-dedicated-project')::uuid),'RLS exposed dedicated Najaf work';
  assert not public.can_access_indoor_project_branch(md5('karkh-najaf-historical-project')::uuid),'Karkh gained legacy Najaf access';
  assert not exists(select 1 from public.projects where id=md5('karkh-najaf-historical-project')::uuid),'RLS exposed historical Najaf work';
  update public.projects set project_notes='Karkh continues working on its Najaf governorate project'
    where id=md5('karkh-najaf-project')::uuid;
  assert found,'Karkh could create but could not continue editing the new project';
  update public.projects set next_follow_up_at=now()-interval '1 minute',follow_up_type='call'
    where id=md5('karkh-najaf-project')::uuid;
  assert public.deliver_due_follow_up_notifications()=1,'Karkh did not receive its due governorate reminder';
  assert public.deliver_due_follow_up_notifications()=0,'Polling created duplicate due reminders';
end;
$karkh_visibility$;

select set_config('request.jwt.claim.sub',md5('karkh-najaf-Indoor SalesRasafa')::uuid::text,true);
do $rasafa_visibility$
begin
  assert not public.can_access_indoor_project_branch(md5('karkh-najaf-project')::uuid);
  assert not exists(select 1 from public.projects where id=md5('karkh-najaf-project')::uuid),'Rasafa Indoor gained Karkh governorate work';
end;
$rasafa_visibility$;

select set_config('request.jwt.claim.sub',md5('karkh-najaf-Indoor SalesNajaf')::uuid::text,true);
do $najaf_visibility$
begin
  assert public.can_access_indoor_project_branch(md5('karkh-najaf-historical-project')::uuid),'Najaf lost its historical governorate record';
  assert exists(select 1 from public.projects where id=md5('karkh-najaf-historical-project')::uuid),'RLS hid historical Najaf work';
  assert public.can_access_indoor_project_branch(md5('karkh-najaf-dedicated-project')::uuid);
  assert exists(select 1 from public.projects where id=md5('karkh-najaf-dedicated-project')::uuid);
  assert not public.can_access_indoor_project_branch(md5('karkh-najaf-project')::uuid),'Najaf gained Karkh-handled governorate work';
  assert not exists(select 1 from public.projects where id=md5('karkh-najaf-project')::uuid);
end;
$najaf_visibility$;

rollback;
