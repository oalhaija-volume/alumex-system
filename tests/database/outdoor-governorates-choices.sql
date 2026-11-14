-- Isolated PostgreSQL fixture only. The runner seeds one historical النجف
-- Governorates registration and saved receipt before applying this migration.
begin;

do $fixtures$
declare job text; office text; employee uuid; label text;
begin
  foreach job in array array['Outdoor Sales','Indoor Sales','Sales Manager'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      employee:=md5('gov-choice-'||job||office)::uuid;
      insert into auth.users(id,email) values(employee,md5(job||office)||'.govchoice@example.invalid');
      insert into public.profiles(id,email,username,full_name,role,branch,outdoor_team_key,is_active,status)
        values(employee,md5(job||office)||'.govchoice@example.invalid','govchoice.'||substr(md5(job||office),1,10),job||office,job::public.app_role,
          nullif(office,'Unassigned'),case when job='Outdoor Sales' then 'sajjad_ehab' end,true,'Active');
    end loop;
  end loop;
  foreach label in array array['teammate','unrelated','inactive'] loop
    employee:=md5('gov-choice-'||label)::uuid;
    insert into auth.users(id,email) values(employee,label||'.govchoice@example.invalid');
    insert into public.profiles(id,email,username,full_name,role,branch,outdoor_team_key,is_active,status)
      values(employee,label||'.govchoice@example.invalid','govchoice.'||label,label,'Outdoor Sales','Najaf',
        case when label='unrelated' then 'ahmad_mohammad' else 'sajjad_ehab' end,label<>'inactive',
        case when label='inactive' then 'Inactive' else 'Active' end);
  end loop;
end;
$fixtures$;

do $registration_and_assignment$
declare actor uuid; job text; office text; province text; result jsonb; replay jsonb; payload jsonb;
  project_id uuid; operation uuid; candidate uuid; allowed boolean;
  historical uuid:=md5('gov-choice-historical-project')::uuid;
  historical_actor uuid:=md5('gov-choice-historical-author')::uuid;
begin
  payload:='{"client":{"clientName":"Governorates choices fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Fixture","structureReadiness":"ready","branch":"Governorates","governorate":"البصرة","buildingType":"villa_house"}}';
  assert public.project_branch_matches_employee('Karkh','Governorates');
  assert not public.project_branch_matches_employee('Najaf','Governorates'),'Governorates follow-up office was broadened';
  assert not public.project_branch_matches_employee('Rasafa','Governorates');
  foreach job in array array['Outdoor Sales','Indoor Sales','Sales Manager'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      actor:=md5('gov-choice-'||job||office)::uuid;
      allowed:=office='Karkh' or (job='Outdoor Sales' and office in ('Rasafa','Najaf'));
      assert public.employee_can_access_project_branch(actor,'Governorates')=allowed,format('Wrong Governorates capability %s/%s',job,office);
      if job='Outdoor Sales' and office<>'Unassigned' then
        project_id:=md5('gov-choice-project-'||office)::uuid;
        operation:=md5('gov-choice-operation-'||office)::uuid;
        result:=public.sync_field_change(operation,actor,project_id,'register',payload,now(),null);
        replay:=public.sync_field_change(operation,actor,project_id,'register',payload,now(),null);
        assert result=replay,'Governorates registration retry was not idempotent';
        assert (select branch='Governorates' and governorate='البصرة' and created_by=actor and owner_id=actor
          from public.projects where id=project_id),'Eligible Outdoor registration lost routing/ownership';
        assert exists(select 1 from public.sales_notification_recipients(project_id) employee
          where employee=md5('gov-choice-Indoor SalesKarkh')::uuid),'Karkh follow-up recipient disappeared';
        assert not exists(select 1 from public.sales_notification_recipients(project_id) employee join public.profiles profile on profile.id=employee
          where profile.branch is distinct from 'Karkh'),'Governorates notification crossed follow-up offices';
      elsif not allowed then
        begin
          perform public.register_sales_project(actor,payload);
          raise exception 'Ineligible employee registered Governorates work';
        exception when insufficient_privilege then
          assert job='Outdoor Sales' or office<>'Unassigned';
        when invalid_parameter_value then
          assert job<>'Outdoor Sales' and office='Unassigned';
        end;
      end if;
    end loop;
  end loop;

  actor:=md5('gov-choice-Outdoor SalesNajaf')::uuid;
  -- All eleven remaining province choices work, including the Najaf office.
  foreach province in array array['البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء','الديوانية','الكوت','العمارة','الناصرية','السماوة'] loop
    result:=public.register_sales_project(actor,jsonb_set(payload,'{project,governorate}',to_jsonb(province)));
    assert (select governorate=province from public.projects where id=(result->>'projectId')::uuid),'Valid province choice was rejected';
  end loop;
  foreach candidate in array array[actor,md5('gov-choice-Outdoor SalesRasafa')::uuid,md5('gov-choice-Outdoor SalesKarkh')::uuid,md5('gov-choice-historical-admin')::uuid] loop
    begin
      perform public.register_sales_project(candidate,jsonb_set(payload,'{project,governorate}','"النجف"'));
      raise exception 'New Governorates registration accepted retired النجف province';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.register_sales_project(md5('gov-choice-inactive')::uuid,payload);
    raise exception 'Inactive Outdoor registered Governorates work';
  exception when raise_exception then
    assert sqlerrm='Sales access required','Inactive registration failed for an unexpected reason';
  end;
  foreach office in array array['Karkh','Rasafa'] loop
    begin
      perform public.register_sales_project(actor,(jsonb_set(payload,'{project,branch}',to_jsonb(office))) #- '{project,governorate}');
      raise exception 'Najaf Outdoor registered a different office';
    exception when insufficient_privilege then null; end;
  end loop;

  project_id:=md5('gov-choice-project-Najaf')::uuid;
  update public.projects set assigned_outdoor_sales_id=md5('gov-choice-teammate')::uuid,
    follow_up_owner_id=md5('gov-choice-Indoor SalesKarkh')::uuid where id=project_id;
  foreach candidate in array array[md5('gov-choice-Indoor SalesNajaf')::uuid,md5('gov-choice-Sales ManagerNajaf')::uuid,
    md5('gov-choice-Indoor SalesRasafa')::uuid,md5('gov-choice-Sales ManagerRasafa')::uuid] loop
    begin
      update public.projects set follow_up_owner_id=candidate where id=project_id;
      raise exception 'Governorates follow-up accepted another office';
    exception when insufficient_privilege then null; end;
  end loop;

  -- Historical records remain unchanged and editable, and a saved receipt
  -- remains replayable even though its old province cannot be newly chosen.
  assert (select branch='Governorates' and governorate='النجف' from public.projects where id=historical),'Historical routing changed during migration';
  update public.projects set project_notes='Historical province remains editable',branch=branch,governorate=governorate where id=historical;
  result:=public.sync_field_change(md5('gov-choice-historical-operation')::uuid,historical_actor,historical,'register',
    jsonb_set(payload,'{project,governorate}','"النجف"'),now(),null);
  assert result=(select saved.result from public.field_sync_receipts saved where operation_id=md5('gov-choice-historical-operation')::uuid),'Historical registration receipt changed';
  perform public.require_indoor_project_branch(historical,historical_actor);
end;
$registration_and_assignment$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('gov-choice-Outdoor SalesNajaf')::uuid::text,true);
do $najaf_outdoor_scope$
declare target uuid:=md5('gov-choice-project-Najaf')::uuid; actor uuid:=auth.uid();
begin
  assert public.can_access_indoor_project_branch(target),'Najaf Outdoor cannot read their Governorates entry';
  assert exists(select 1 from public.projects where id=target),'Najaf Outdoor RLS lost their Governorates entry';
  update public.projects set project_notes='Own Governorates edit' where id=target;
  assert found,'Najaf Outdoor cannot edit their Governorates entry';
  assert not public.can_access_indoor_project_branch(md5('gov-choice-project-Rasafa')::uuid),'Najaf Outdoor gained unrelated Governorates work';
  assert not exists(select 1 from public.projects where id=md5('gov-choice-project-Rasafa')::uuid),'Najaf Outdoor read unrelated Governorates row';
  update public.projects set project_notes='Forbidden edit' where id=md5('gov-choice-project-Rasafa')::uuid;
  assert not found,'Najaf Outdoor changed unrelated Governorates row';
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id)
      values(gen_random_uuid(),(select client_id from public.projects where id=target),'Retired province','TEST-GOV-CHOICE-RETIRED','Governorates','النجف',actor,actor);
    raise exception 'Direct authenticated INSERT accepted retired النجف province';
  exception when invalid_parameter_value then null; end;
end;
$najaf_outdoor_scope$;
select set_config('request.jwt.claim.sub',md5('gov-choice-teammate')::uuid::text,true);
do $same_office_team$
begin
  assert public.can_access_indoor_project_branch(md5('gov-choice-project-Najaf')::uuid),'Najaf team lost assigned Governorates entry';
  assert exists(select 1 from public.projects where id=md5('gov-choice-project-Najaf')::uuid),'Najaf team RLS lost Governorates assignment';
end;
$same_office_team$;
select set_config('request.jwt.claim.sub',md5('gov-choice-unrelated')::uuid::text,true);
do $unrelated_employee$
begin
  assert not public.can_access_indoor_project_branch(md5('gov-choice-project-Najaf')::uuid),'Unrelated Najaf employee gained Governorates entry';
  assert not exists(select 1 from public.projects where id=md5('gov-choice-project-Najaf')::uuid),'Unrelated Najaf employee RLS gained Governorates row';
end;
$unrelated_employee$;
select set_config('request.jwt.claim.sub',md5('gov-choice-historical-author')::uuid::text,true);
do $historical_authenticated$
begin
  assert public.can_access_indoor_project_branch(md5('gov-choice-historical-project')::uuid),'Historical creator lost access';
  assert public.can_access_indoor_client_branch((select client_id from public.projects where id=md5('gov-choice-historical-project')::uuid)),'Historical client became inaccessible';
  update public.projects set project_notes='Authenticated historical edit',branch=branch,governorate=governorate
    where id=md5('gov-choice-historical-project')::uuid;
  assert found,'Historical النجف Governorates entry cannot be edited';
end;
$historical_authenticated$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

-- Even service-created/Admin rows must not introduce the retired province.
do $service_insert$
begin
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by)
      values(gen_random_uuid(),(select client_id from public.projects where id=md5('gov-choice-historical-project')::uuid),
        'Retired Admin province','TEST-GOV-CHOICE-ADMIN','Governorates','النجف',md5('gov-choice-historical-admin')::uuid);
    raise exception 'Service/Admin INSERT accepted retired النجف province';
  exception when invalid_parameter_value then null; end;
end;
$service_insert$;

rollback;
