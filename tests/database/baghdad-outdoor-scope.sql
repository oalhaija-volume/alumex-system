-- Isolated PostgreSQL fixture only. Before applying the migration, the runner
-- seeds baghdad-scope-legacy-project / baghdad-scope-legacy-operation through
-- sync_field_change as baghdad-scope-historical-author, an active Karkh Outdoor
-- employee, with Governorates / النجف. The migration must not relabel this row.
begin;

do $calendar$
declare office text; month_start timestamp;
begin
  foreach office in array array['Karkh','Rasafa'] loop
    assert public.outdoor_sales_branch_for_date(office,'2026-11-15 20:59:59+00')='Karkh';
    assert public.outdoor_sales_branch_for_date(office,'2026-11-15 21:00:00+00')='Rasafa';
    assert public.outdoor_sales_branch_for_date(office,'2026-11-30 20:59:59+00')='Rasafa';
    assert public.outdoor_sales_branch_for_date(office,'2026-11-30 21:00:00+00')='Karkh';
    foreach month_start in array array['2027-02-01'::timestamp,'2028-02-01'::timestamp,
      '2026-04-01'::timestamp,'2026-07-01'::timestamp] loop
      assert public.outdoor_sales_branch_for_date(office,(month_start+interval '1 month'-interval '1 second') at time zone 'Asia/Baghdad')='Rasafa';
      assert public.outdoor_sales_branch_for_date(office,(month_start+interval '1 month') at time zone 'Asia/Baghdad')='Karkh';
    end loop;
  end loop;
  assert public.outdoor_sales_branch_for_date('Najaf',now()) is null;
  assert public.outdoor_sales_branch_for_date('Karkh','infinity') is null;
  foreach office in array array['النجف',' نجف ','Najaf',' naJAf '] loop
    assert public.effective_project_branch('Governorates',office)='Najaf';
  end loop;
  assert public.effective_project_branch('Governorates','البصرة')='Governorates';
end;
$calendar$;

do $fixtures$
declare job text; office text; employee uuid;
begin
  foreach job in array enum_range(null::public.app_role)::text[] loop
    foreach office in array array['Karkh','Rasafa','Najaf'] loop
      employee:=md5('baghdad-scope-'||job||office)::uuid;
      insert into auth.users(id,email) values(employee,md5(job||office)||'.baghdadscope@example.invalid');
      insert into public.profiles(id,email,username,full_name,role,branch,is_active,status)
        values(employee,md5(job||office)||'.baghdadscope@example.invalid','baghdadscope.'||substr(md5(job||office),1,10),
          job||office,job::public.app_role,office,true,'Active');
    end loop;
  end loop;
end;
$fixtures$;

do $registration$
declare office text; actor uuid; allowed_branch text; forbidden_branch text; result jsonb; replay jsonb; payload jsonb;
  operation uuid; project_id uuid; candidate uuid; province text;
begin
  allowed_branch:=public.outdoor_sales_branch_for_date('Karkh',statement_timestamp());
  forbidden_branch:=case when allowed_branch='Karkh' then 'Rasafa' else 'Karkh' end;
  payload:='{"client":{"clientName":"Baghdad scope fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Fixture","structureReadiness":"ready","buildingType":"villa_house"}}';
  foreach office in array array['Karkh','Rasafa'] loop
    actor:=md5('baghdad-scope-Outdoor Sales'||office)::uuid;
    assert public.employee_can_access_project_branch(actor,'Karkh');
    assert public.employee_can_access_project_branch(actor,'Rasafa');
    assert public.employee_can_access_project_branch(actor,'Governorates');
    assert not public.employee_can_access_project_branch(actor,'Najaf');
    assert public.employee_can_access_project_row(actor,'Karkh',actor,null,null),'Own Karkh entry was hidden by rotation';
    assert public.employee_can_access_project_row(actor,'Rasafa',actor,null,null),'Own Rasafa entry was hidden by rotation';
    assert public.employee_can_access_project_row(actor,'Governorates',actor,null,'البصرة'),'Own province entry was hidden by rotation';
    result:=public.register_sales_project(actor,jsonb_set(payload,'{project,branch}',to_jsonb(allowed_branch)));
    assert (select projects.branch=allowed_branch and created_by=actor from public.projects where id=(result->>'projectId')::uuid);
    result:=public.register_sales_project(actor,payload);
    assert (select projects.branch=allowed_branch and created_by=actor from public.projects where id=(result->>'projectId')::uuid),
      'New legacy payload without branch did not default to the server calendar';
    begin
      perform public.register_sales_project(actor,jsonb_set(payload,'{project,branch}',to_jsonb(forbidden_branch)));
      raise exception 'Outdoor registered the wrong calendar area';
    exception when insufficient_privilege then null; end;
    begin
      perform public.register_sales_project(actor,jsonb_set(payload,'{project,branch}','"Najaf"'));
      raise exception 'Baghdad Outdoor registered Najaf';
    exception when insufficient_privilege then null; end;
    -- Device recording time cannot change the current server registration area.
    begin
      perform public.sync_field_change(gen_random_uuid(),actor,gen_random_uuid(),'register',
        jsonb_set(payload,'{project,branch}',to_jsonb(forbidden_branch)),'2020-01-01',null);
      raise exception 'Forged recording time bypassed rotation';
    exception when insufficient_privilege then null; end;
    operation:=md5('baghdad-scope-operation-'||office)::uuid;
    project_id:=md5('baghdad-scope-project-'||office)::uuid;
    result:=public.sync_field_change(operation,actor,project_id,'register',
      jsonb_set(jsonb_set(payload,'{project,branch}','"Governorates"'),'{project,governorate}','"البصرة"'),now(),null);
    replay:=public.sync_field_change(operation,actor,project_id,'register',
      jsonb_set(jsonb_set(payload,'{project,branch}','"Governorates"'),'{project,governorate}','"البصرة"'),now(),null);
    assert replay=result,'Saved Baghdad registration receipt stopped replaying';
    foreach province in array array['النجف','نجف','Najaf'] loop
      begin
        perform public.register_sales_project(actor,jsonb_set(jsonb_set(payload,'{project,branch}','"Governorates"'),'{project,governorate}',to_jsonb(province)));
        raise exception 'Baghdad Outdoor registered Najaf as a governorate';
      exception when invalid_parameter_value then null; end;
    end loop;
  end loop;
  actor:=md5('baghdad-scope-Outdoor SalesNajaf')::uuid;
  result:=public.register_sales_project(actor,jsonb_set(payload,'{project,branch}','"Najaf"'));
  assert (select projects.branch='Najaf' from public.projects where id=(result->>'projectId')::uuid);
  result:=public.register_sales_project(actor,payload);
  assert (select projects.branch='Najaf' from public.projects where id=(result->>'projectId')::uuid),
    'Najaf payload without branch did not default to Najaf';
  foreach office in array array['Karkh','Rasafa','Governorates'] loop
    assert not public.employee_can_access_project_branch(actor,office);
    begin
      perform public.register_sales_project(actor,jsonb_set(jsonb_set(payload,'{project,branch}',to_jsonb(office)),
        '{project,governorate}',case when office='Governorates' then '"البصرة"'::jsonb else 'null'::jsonb end));
      raise exception 'Najaf Outdoor registered Baghdad or Governorates';
    exception when insufficient_privilege then null; end;
  end loop;
  -- A Najaf project retains attribution after its Outdoor author moves office,
  -- but attribution must never grant Baghdad access to that Najaf project.
  update public.profiles set branch='Karkh' where id=actor;
  assert not public.employee_can_access_project_row(actor,'Najaf',actor,actor,null);
  begin
    perform public.require_indoor_project_branch((result->>'projectId')::uuid,actor);
    raise exception 'Creator exception crossed the Najaf boundary';
  exception when insufficient_privilege then null; end;
  update public.profiles set branch='Najaf' where id=actor;

  -- New assignments must also respect historical Governorates / Najaf rows.
  foreach candidate in array array[md5('baghdad-scope-Outdoor SalesKarkh')::uuid,md5('baghdad-scope-Indoor SalesKarkh')::uuid] loop
    begin
      update public.projects set owner_id=candidate where id=md5('baghdad-scope-legacy-project')::uuid;
      raise exception 'Historical Najaf project accepted a Baghdad assignment';
    exception when insufficient_privilege then null; end;
  end loop;
  update public.projects set follow_up_owner_id=md5('baghdad-scope-Indoor SalesNajaf')::uuid
    where id=md5('baghdad-scope-legacy-project')::uuid;
  assert exists(select 1 from public.sales_notification_recipients(md5('baghdad-scope-legacy-project')::uuid) recipient
    where recipient=md5('baghdad-scope-Indoor SalesNajaf')::uuid);
  assert not exists(select 1 from public.sales_notification_recipients(md5('baghdad-scope-legacy-project')::uuid) recipient
    join public.profiles employee on employee.id=recipient where employee.branch<>'Najaf');
end;
$registration$;

do $legacy_crm_actions$
declare actor uuid:=md5('baghdad-scope-Indoor SalesNajaf')::uuid;
  target uuid:=md5('baghdad-scope-legacy-project')::uuid; job text; office text; expected_time timestamptz;
  expected_client_name text; result jsonb; replay jsonb; payload jsonb; candidate uuid;
begin
  -- Existing name RPCs rely on require_indoor_project_branch, so they must
  -- authorize the effective city rather than the raw historical branch.
  foreach job in array array['Indoor Sales','Sales Manager'] loop
    actor:=md5('baghdad-scope-'||job||'Najaf')::uuid;
    select updated_at into expected_time from public.projects where id=target;
    payload:=jsonb_build_object('projectName','Najaf CRM legacy project '||job);
    result:=public.sync_field_change(md5('baghdad-scope-rename-'||job)::uuid,actor,target,'rename-project',payload,now(),expected_time);
    replay:=public.sync_field_change(md5('baghdad-scope-rename-'||job)::uuid,actor,target,'rename-project',payload,now(),expected_time);
    assert result=replay,'Najaf project rename receipt lost idempotence';
    assert result->>'project_name'=payload->>'projectName','Najaf CRM could not rename its historical project';
    select client_name into expected_client_name from public.clients where id=(select client_id from public.projects where id=target);
    result:=public.rename_project_client(target,actor,'Najaf CRM legacy client '||job,expected_client_name);
    assert result->>'client_name'='Najaf CRM legacy client '||job,'Najaf CRM could not rename its historical client';

    foreach office in array array['Karkh','Rasafa'] loop
      candidate:=md5('baghdad-scope-'||job||office)::uuid;
      begin
        perform public.sync_field_change(gen_random_uuid(),candidate,target,'rename-project',payload,now(),expected_time);
        raise exception 'Baghdad CRM renamed a legacy Najaf project';
      exception when insufficient_privilege then null; end;
      begin
        perform public.rename_project_client(target,candidate,'Forbidden Baghdad client edit','Najaf CRM legacy client '||job);
        raise exception 'Baghdad CRM renamed a legacy Najaf client';
      exception when insufficient_privilege then null; end;
    end loop;

    payload:=jsonb_build_object('followUpType','call','nextFollowUp',now()+interval '1 day','note','Najaf legacy follow-up');
    foreach office in array array['Karkh','Rasafa'] loop
      select updated_at into expected_time from public.projects where id=target;
      begin
        perform public.sync_field_change(gen_random_uuid(),actor,target,'follow-up',
          payload||jsonb_build_object('followUpOwnerId',md5('baghdad-scope-Indoor Sales'||office)::uuid),now(),expected_time);
        raise exception 'Najaf CRM assigned historical Najaf follow-up to Baghdad';
      exception when insufficient_privilege then null; end;
    end loop;
    select updated_at into expected_time from public.projects where id=target;
    result:=public.sync_field_change(gen_random_uuid(),actor,target,'follow-up',
      payload||jsonb_build_object('followUpOwnerId',actor),now(),expected_time);
    assert result->>'follow_up_owner_id'=actor::text,'Najaf CRM could not assign historical Najaf follow-up';
  end loop;
end;
$legacy_crm_actions$;

do $legacy_guard$
declare actor uuid:=md5('baghdad-scope-historical-author')::uuid; project_id uuid:=md5('baghdad-scope-legacy-project')::uuid;
  payload jsonb:='{"client":{"clientName":"Legacy Najaf scope fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Fixture","structureReadiness":"ready","branch":"Governorates","governorate":"النجف","buildingType":"villa_house"}}';
  job text; office text; employee uuid; allowed boolean;
begin
  assert (select branch='Governorates' and governorate='النجف' from public.projects where id=project_id),'Historical Najaf row was relabeled';
  foreach job in array enum_range(null::public.app_role)::text[] loop
    foreach office in array array['Karkh','Rasafa','Najaf'] loop
      employee:=md5('baghdad-scope-'||job||office)::uuid;
      allowed:=office='Najaf' or job in ('Admin','Sales Director','Company Owner');
      assert public.employee_can_access_project_row(employee,'Governorates',employee,employee,'النجف')=allowed,
        format('Wrong effective Najaf permission for %s / %s',job,office);
      assert public.employee_can_access_project_row(employee,'Najaf',employee,employee,null)=allowed;
    end loop;
  end loop;
  begin
    perform public.sync_field_change(md5('baghdad-scope-legacy-operation')::uuid,actor,project_id,'register',payload,now(),null);
    raise exception 'Historical creator replay crossed Najaf boundary';
  exception when insufficient_privilege then null; end;
  update public.profiles set branch='Najaf' where id=actor;
  assert public.sync_field_change(md5('baghdad-scope-legacy-operation')::uuid,actor,project_id,'register',payload,now(),null)
    =(select result from public.field_sync_receipts where operation_id=md5('baghdad-scope-legacy-operation')::uuid),
    'Eligible Najaf creator lost a historical saved receipt';
  update public.profiles set branch='Karkh' where id=actor;
end;
$legacy_guard$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $rls_scope$
declare office text; job text; actor uuid; allowed boolean; target uuid:=md5('baghdad-scope-legacy-project')::uuid;
begin
  foreach job in array array['Outdoor Sales','Indoor Sales','Sales Manager','Operations Manager','Admin','Sales Director','Company Owner'] loop
    foreach office in array array['Karkh','Rasafa','Najaf'] loop
      actor:=md5('baghdad-scope-'||job||office)::uuid;
      perform set_config('request.jwt.claim.sub',actor::text,true);
      allowed:=office='Najaf' or job in ('Admin','Sales Director','Company Owner');
      assert public.can_access_indoor_project_branch(target)=allowed;
      if allowed and job in ('Indoor Sales','Sales Manager','Admin','Sales Director','Company Owner') then
        assert exists(select 1 from public.projects where id=target),'Eligible Najaf CRM employee lost their historical project';
      elsif not allowed then
        assert not exists(select 1 from public.projects where id=target),'RLS leaked a legacy Najaf project';
        update public.projects set project_notes='Forbidden Baghdad edit' where id=target;
        assert not found,'RLS allowed a forbidden Najaf update';
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',md5('baghdad-scope-Outdoor SalesRasafa')::uuid::text,true);
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id)
      values(gen_random_uuid(),(select client_id from public.projects where id=md5('baghdad-scope-project-Rasafa')::uuid),
        'Forbidden Najaf insert','TEST-BAGHDAD-NAJAF','Najaf',null,auth.uid(),auth.uid());
    raise exception 'Direct authenticated INSERT bypassed Najaf restriction';
  exception when insufficient_privilege then null; end;
end;
$rls_scope$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

rollback;
