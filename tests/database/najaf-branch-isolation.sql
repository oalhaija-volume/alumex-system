-- Run against an isolated PostgreSQL fixture only; all test records roll back.
begin;

do $fixtures$
declare job text; office text; actor_id uuid; administrator uuid:=md5('najaf-fixture-Admin')::uuid;
  project_id uuid; customer uuid;
begin
  foreach job in array array['Admin','Sales Director','Company Owner'] loop
    actor_id:=md5('najaf-fixture-'||job)::uuid;
    insert into auth.users(id,email) values(actor_id,md5(job)||'@example.invalid');
    insert into public.profiles(id,email,full_name,username,role,is_active,status)
      values(actor_id,md5(job)||'@example.invalid',job,'fixture.'||substr(md5(job),1,10),job::public.app_role,true,'Active');
  end loop;
  foreach job in array array['Indoor Sales','Outdoor Sales','Sales Manager','CEO','HR','Operations Manager','Project Manager','Branch Manager','Project Engineer','Site Engineer','Finance / Accountant','Auditor'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      actor_id:=md5('najaf-fixture-'||job||office)::uuid;
      insert into auth.users(id,email) values(actor_id,md5(job||office)||'@example.invalid');
      insert into public.profiles(id,email,full_name,username,role,branch,is_active,status,outdoor_team_key)
        values(actor_id,md5(job||office)||'@example.invalid',job||office,'fixture.'||substr(md5(job||office),1,10),job::public.app_role,
          nullif(office,'Unassigned'),true,'Active',case when job='Outdoor Sales' then 'ahmad_mohammad' end);
    end loop;
  end loop;
  foreach office in array array['Karkh','Rasafa','Najaf','Governorates'] loop
    project_id:=md5('najaf-fixture-project-'||office)::uuid;
    customer:=md5('najaf-fixture-client-'||office)::uuid;
    insert into public.clients(id,client_name,created_by) values(customer,'Fixture client '||office,administrator);
    insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id,sales_status,structure_readiness)
      values(project_id,customer,'Fixture '||office,'TEST-NAJAF-'||office,office,
        case when office='Governorates' then 'النجف' end,administrator,administrator,'new_lead','ready');
    insert into public.openings(id,project_id,width,height,quantity,floor,room,opening_type,opening_direction,created_by)
      values(md5('najaf-fixture-opening-'||office)::uuid,project_id,100,200,2,'GF','Office','Window','Sliding',administrator);
    insert into public.quotations(id,project_id,client_id,created_by)
      values(md5('najaf-fixture-quotation-'||office)::uuid,project_id,customer,administrator);
    insert into public.quotation_items(id,quotation_id)
      values(md5('najaf-fixture-item-'||office)::uuid,md5('najaf-fixture-quotation-'||office)::uuid);
    insert into public.documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
      values(md5('najaf-fixture-document-'||office)::uuid,'project',project_id,'fixture.pdf','project-attachments',project_id::text||'/fixture.pdf',administrator);
    insert into storage.objects(id,bucket_id,name)
      values(md5('najaf-fixture-file-'||office)::uuid,'project-attachments',project_id::text||'/fixture.pdf');
    insert into public.measurement_completion_reports(id,project_id)
      values(md5('najaf-fixture-report-'||office)::uuid,project_id);
    for actor_id in select id from public.profiles where username like 'fixture.%' loop
      insert into public.notifications(recipient_id,entity_type,entity_id,event_type,payload)
        values(actor_id,'project',project_id,'fixture',jsonb_build_object('project_name','Fixture '||office));
    end loop;
  end loop;
  -- A shared client cannot authorize a foreign project's document, and every
  -- reference in a document with mixed ownership must pass the branch scope.
  update public.projects set client_id=md5('najaf-fixture-client-Najaf')::uuid
    where id=md5('najaf-fixture-project-Karkh')::uuid;
  insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(md5('najaf-fixture-shared-document')::uuid,'project',md5('najaf-fixture-client-Najaf')::uuid,
      md5('najaf-fixture-project-Karkh')::uuid,'shared.pdf','project-attachments','shared.pdf',administrator);
  insert into public.documents(id,owner_type,project_id,quotation_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(md5('najaf-fixture-mixed-document')::uuid,'project',md5('najaf-fixture-project-Najaf')::uuid,
      md5('najaf-fixture-quotation-Karkh')::uuid,'mixed.pdf','project-attachments',md5('najaf-fixture-project-Najaf')::uuid::text||'/mixed.pdf',administrator);
  insert into storage.objects(id,bucket_id,name)
    values(md5('najaf-fixture-mixed-file')::uuid,'project-attachments',md5('najaf-fixture-project-Najaf')::uuid::text||'/mixed.pdf');
end;
$fixtures$;

-- Actual authenticated reads, even though fixture grants intentionally allow
-- every table operation. Restrictive scope must beat permissive legacy policies.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $matrix$
declare job text; office text; target_office text; actor_id uuid; permitted boolean; target uuid;
  expected_branches text[];
begin
  foreach job in array array['Indoor Sales','Outdoor Sales','Sales Manager','CEO','HR','Operations Manager','Project Manager','Branch Manager','Project Engineer','Site Engineer','Finance / Accountant','Auditor','Admin','Sales Director','Company Owner'] loop
    foreach office in array array['Karkh','Rasafa','Najaf','Unassigned'] loop
      if job in ('Admin','Sales Director','Company Owner') then
        actor_id:=md5('najaf-fixture-'||job)::uuid;
      else actor_id:=md5('najaf-fixture-'||job||office)::uuid; end if;
      perform set_config('request.jwt.claim.sub',actor_id::text,true);
      expected_branches:=case when job in ('Admin','Sales Director','Company Owner') then array['Karkh','Rasafa','Najaf','Governorates']
        when office='Karkh' then array['Karkh','Governorates'] when office='Unassigned' then array[]::text[] else array[office] end;
      foreach target_office in array array['Karkh','Rasafa','Najaf','Governorates'] loop
        target:=md5('najaf-fixture-project-'||target_office)::uuid;
        permitted:=target_office=any(expected_branches);
        assert public.can_access_indoor_project_branch(target)=permitted,format('Wrong helper scope: %s/%s → %s',job,office,target_office);
        assert not exists(select 1 from public.projects where id=target and not permitted),format('Foreign project exposed: %s/%s → %s',job,office,target_office);
        assert not exists(select 1 from public.openings where project_id=target and not permitted),'Foreign opening exposed';
        assert not exists(select 1 from public.measurement_completion_reports where project_id=target and not permitted),'Foreign report exposed';
        assert not exists(select 1 from public.documents where project_id=target and not permitted),'Foreign document exposed';
        assert not exists(select 1 from public.quotation_items where id=md5('najaf-fixture-item-'||target_office)::uuid and not permitted),'Foreign indirect item exposed';
        assert not exists(select 1 from public.notifications where entity_id=target and not permitted),'Foreign notification payload exposed';
        assert not exists(select 1 from storage.objects where id=md5('najaf-fixture-file-'||target_office)::uuid and not permitted),'Foreign storage file exposed';
      end loop;
      if job in ('Indoor Sales','CEO','Admin','Sales Director','Company Owner') then
        assert (select count(*) from public.projects where project_number like 'TEST-NAJAF-%')=cardinality(expected_branches),'Authorized project reads disappeared';
      end if;
      if job not in ('Admin','Sales Director','Company Owner') then
        assert not exists(select 1 from public.documents where id=md5('najaf-fixture-mixed-document')::uuid),'Mixed document references bypassed scope';
        assert not exists(select 1 from storage.objects where id=md5('najaf-fixture-mixed-file')::uuid),'File path prefix bypassed mixed document ownership';
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',md5('najaf-fixture-Indoor SalesNajaf')::uuid::text,true);
  insert into public.clients(client_name,created_by) values('Own new unlinked client',auth.uid());
  begin
    insert into public.clients(client_name,created_by) values('Forged unlinked client',md5('najaf-fixture-Indoor SalesKarkh')::uuid);
    raise exception 'New client creation spoofed another branch employee';
  exception when insufficient_privilege then null; end;
  insert into public.documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(gen_random_uuid(),'project',md5('najaf-fixture-project-Najaf')::uuid,'allowed.pdf','project-attachments','allowed.pdf',auth.uid());
  begin
    insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
      values(gen_random_uuid(),'project',md5('najaf-fixture-client-Najaf')::uuid,md5('najaf-fixture-project-Karkh')::uuid,'blocked.pdf','project-attachments','blocked.pdf',auth.uid());
    raise exception 'A shared client bypassed the document insert boundary';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set branch='Karkh' where id=auth.uid();
    raise exception 'Employee transferred their own branch';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
      values(gen_random_uuid(),md5('najaf-fixture-client-Najaf')::uuid,'Spoofed creator','TEST-NAJAF-SPOOF','Najaf',md5('najaf-fixture-Admin')::uuid);
    raise exception 'Direct insert spoofed a global creator';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',md5('najaf-fixture-CEONajaf')::uuid::text,true);
  update public.clients set mobile='fixture-ceo-update';
end;
$matrix$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $writes$
declare najaf uuid:=md5('najaf-fixture-Indoor SalesNajaf')::uuid;
  karkh uuid:=md5('najaf-fixture-Indoor SalesKarkh')::uuid;
  outdoor uuid:=md5('najaf-fixture-Outdoor SalesNajaf')::uuid;
  target uuid:=md5('najaf-fixture-project-Najaf')::uuid;
  foreign_project uuid:=md5('najaf-fixture-project-Karkh')::uuid;
  operation uuid:=gen_random_uuid(); registered uuid:=gen_random_uuid(); receipt jsonb; replay jsonb;
  payload jsonb:='{"client":{"clientName":"Najaf repeat fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Najaf","structureReadiness":"ready","branch":"Najaf","buildingType":"villa_house"}}';
  admin_id uuid:=md5('najaf-fixture-Admin')::uuid; profile_stamp timestamptz;
begin
  assert public.project_branch_matches_employee('Najaf','Najaf');
  assert not public.project_branch_matches_employee(null,'Najaf');
  assert not public.project_branch_matches_employee('Najaf',null);
  assert public.project_branch_matches_employee('Karkh','Governorates');
  assert not public.project_branch_matches_employee('Najaf','Governorates');
  assert (select mobile is null from public.clients where id=md5('najaf-fixture-client-Rasafa')::uuid),'UPDATE without RETURNING crossed a client branch';
  assert (select mobile is null from public.clients where id=md5('najaf-fixture-client-Governorates')::uuid),'Unfiltered client update crossed Governorates scope';

  begin
    perform public.sync_field_change(gen_random_uuid(),najaf,foreign_project,'rename-project','{}',now(),null);
    raise exception 'Service RPC changed a foreign project';
  exception when insufficient_privilege then null; end;
  begin
    perform public.advance_sales_flow(foreign_project,'save',0,'{}',najaf);
    raise exception 'Commercial RPC accepted a foreign project';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rename_project_client(foreign_project,najaf,'Fixture client Karkh','Unapproved rename');
    raise exception 'Client RPC accepted a foreign project';
  exception when insufficient_privilege then null; end;

  update public.projects set follow_up_owner_id=najaf where id=target;
  begin
    update public.projects set follow_up_owner_id=karkh where id=target;
    raise exception 'Cross-branch follow-up owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set assigned_outdoor_sales_id=md5('najaf-fixture-Outdoor SalesKarkh')::uuid where id=target;
    raise exception 'Cross-branch measurement assignee accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.projects set branch='Karkh' where id=target;
    raise exception 'Project branch was changed';
  exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.outdoor_sales_team_member_ids(outdoor) member where member=md5('najaf-fixture-Outdoor SalesKarkh')::uuid),'Team membership crossed branch';
  assert exists(select 1 from public.outdoor_sales_team_member_ids(outdoor) member where member=outdoor),'Employee lost their own team membership';

  receipt:=public.sync_field_change(operation,outdoor,registered,'register',payload,now(),null);
  replay:=public.sync_field_change(operation,outdoor,registered,'register',payload,now(),null);
  assert receipt=replay,'Same-branch retry was not idempotent';
  assert (select branch='Najaf' from public.projects where id=registered),'Najaf was not stored';
  assert (select count(*)=1 from public.field_sync_receipts where operation_id=operation),'Registration duplicated a receipt';
  update public.profiles set branch='Karkh' where id=outdoor;
  begin
    perform public.sync_field_change(operation,outdoor,registered,'register',payload,now(),null);
    raise exception 'Old receipt leaked after employee branch transfer';
  exception when insufficient_privilege then null; end;
  assert (select branch='Najaf' from public.projects where id=registered),'Employee transfer relabeled an existing project';
  update public.profiles set branch='Najaf' where id=outdoor;

  -- Global registration explicitly selects its office instead of saving NULL.
  registered:=gen_random_uuid();
  perform public.sync_field_change(gen_random_uuid(),admin_id,registered,'register',payload,now(),null);
  assert (select branch='Najaf' from public.projects where id=registered),'Global registration lost selected office';
  begin
    perform public.sync_field_change(gen_random_uuid(),outdoor,gen_random_uuid(),'register',jsonb_set(payload,'{project,branch}','"Karkh"'),now(),null);
    raise exception 'Najaf employee registered another branch';
  exception when insufficient_privilege then null; end;

  -- HR may maintain staff in its office, but cannot promote global roles or
  -- edit another office by calling the employee RPC through a service route.
  select updated_at into profile_stamp from public.profiles where id=najaf;
  begin
    perform public.update_employee_profile_with_branch(md5('najaf-fixture-HRKarkh')::uuid,najaf,profile_stamp,'Fixture employee','fixture.changed','Indoor Sales',true,'Najaf');
    raise exception 'HR edited a foreign employee';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_employee_profile_with_branch(md5('najaf-fixture-HRNajaf')::uuid,najaf,profile_stamp,'Fixture employee','fixture.changed','Sales Director',true,'Najaf');
    raise exception 'HR assigned a global role';
  exception when insufficient_privilege then null; end;
  perform public.update_employee_profile_with_branch(admin_id,najaf,profile_stamp,'Fixture employee','fixture.changed','Indoor Sales',true,'Najaf');
  assert (select branch='Najaf' from public.profiles where id=najaf),'Admin could not assign Najaf';
end;
$writes$;

insert into public.measurement_requests(id,project_id,requested_by,assigned_to,status)
values(md5('najaf-fixture-request')::uuid,md5('najaf-fixture-project-Najaf')::uuid,
  md5('najaf-fixture-Admin')::uuid,md5('najaf-fixture-Outdoor SalesNajaf')::uuid,'requested');
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $anonymous_rpc$
begin
  begin
    perform public.create_measurement_request(md5('najaf-fixture-project-Najaf')::uuid,null,null,null,md5('najaf-fixture-Admin')::uuid);
    raise exception 'Anonymous caller spoofed Admin in a legacy request RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.assign_measurement_request(md5('najaf-fixture-request')::uuid,md5('najaf-fixture-Outdoor SalesNajaf')::uuid,null,null,md5('najaf-fixture-Admin')::uuid);
    raise exception 'Anonymous caller spoofed Admin in a legacy assignment RPC';
  exception when insufficient_privilege then null; end;
end;
$anonymous_rpc$;
reset role;
-- The guard itself must reject an untrusted request even when a legacy
-- security-definer entry point executes with database-owner privileges.
do $anonymous_registration$
begin
  begin
    perform public.require_outdoor_project_creation_branch(md5('najaf-fixture-Admin')::uuid,'Najaf');
    raise exception 'Anonymous registration forged a global actor';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
      values(gen_random_uuid(),md5('najaf-fixture-client-Najaf')::uuid,'Forged anonymous project','TEST-NAJAF-ANON','Najaf',md5('najaf-fixture-Admin')::uuid);
    raise exception 'Anonymous creation forged a global actor';
  exception when insufficient_privilege then null; end;
end;
$anonymous_registration$;

rollback;
