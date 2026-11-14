-- Run only in the isolated PostgreSQL fixture. Historical entries are created
-- while their author belongs to each office, then the author moves to Karkh.
begin;

do $fixtures$
declare actor uuid:=md5('creator-fixture-author')::uuid;
  administrator uuid:=md5('creator-fixture-admin')::uuid;
  project_branch text; label text; employee uuid; target uuid; customer uuid;
begin
  foreach label in array array['admin','author','teammate','Rasafa','Najaf'] loop
    employee:=md5('creator-fixture-'||label)::uuid;
    insert into auth.users(id,email) values(employee,label||'.creator@example.invalid');
    insert into public.profiles(id,email,username,full_name,role,branch,outdoor_team_key,is_active,status)
      values(employee,label||'.creator@example.invalid','creator.'||lower(label),label,
        case when label='admin' then 'Admin'::public.app_role else 'Outdoor Sales'::public.app_role end,
        case when label='admin' then null when label in ('author','teammate') then 'Karkh' else label end,
        case when label<>'admin' then 'ahmad_mohammad' end,true,'Active');
  end loop;
  foreach project_branch in array array['Karkh','Rasafa','Najaf','Governorates'] loop
    update public.profiles set branch=case when project_branch='Governorates' then 'Karkh' else project_branch end where id=actor;
    foreach label in array array['own','other'] loop
      target:=md5('creator-fixture-project-'||label||project_branch)::uuid;
      customer:=md5('creator-fixture-client-'||label||project_branch)::uuid;
      employee:=case when label='own' then actor else administrator end;
      insert into public.clients(id,client_name,created_by) values(customer,'Creator fixture '||label||project_branch,employee);
      insert into public.projects(id,client_id,project_name,project_number,branch,governorate,created_by,owner_id,
        assigned_outdoor_sales_id,sales_status,structure_readiness,building_type)
        values(target,customer,'Creator fixture '||label||project_branch,'TEST-CREATOR-'||label||project_branch,project_branch,
          case when project_branch='Governorates' then 'البصرة' end,employee,employee,
          case when label='own' then actor when project_branch in ('Rasafa','Najaf') then md5('creator-fixture-'||project_branch)::uuid
            else md5('creator-fixture-teammate')::uuid end,'new_lead','ready','villa_house');
      insert into public.openings(id,project_id,width,height,quantity,floor,room,opening_type,opening_direction,created_by)
        values(md5('creator-fixture-opening-'||label||project_branch)::uuid,target,100,200,2,'GF','Office','Window','Sliding',employee);
      insert into public.documents(id,owner_type,project_id,file_name,storage_bucket,storage_path,uploaded_by)
        values(md5('creator-fixture-document-'||label||project_branch)::uuid,'project',target,'fixture.pdf','project-attachments',target::text||'/fixture.pdf',employee);
      insert into storage.objects(id,bucket_id,name)
        values(md5('creator-fixture-file-'||label||project_branch)::uuid,'project-attachments',target::text||'/fixture.pdf');
      insert into public.measurement_completion_reports(id,project_id)
        values(md5('creator-fixture-report-'||label||project_branch)::uuid,target);
    end loop;
  end loop;
  update public.profiles set branch='Karkh' where id=actor;
  insert into public.clients(id,client_name,created_by)
    values(md5('creator-fixture-unlinked-client')::uuid,'Unlinked creator fixture',actor);
  -- Sharing an accessible client must not expose a foreign project's file.
  insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
    values(md5('creator-fixture-mixed-document')::uuid,'project',md5('creator-fixture-client-ownNajaf')::uuid,
      md5('creator-fixture-project-otherNajaf')::uuid,'mixed.pdf','project-attachments','mixed.pdf',administrator);
end;
$fixtures$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('creator-fixture-author')::uuid::text,true);
do $authenticated_rows$
declare actor uuid:=md5('creator-fixture-author')::uuid; target uuid; office text; label text; allowed boolean; changed integer;
begin
  foreach office in array array['Karkh','Rasafa','Najaf','Governorates'] loop
    foreach label in array array['own','other'] loop
      target:=md5('creator-fixture-project-'||label||office)::uuid;
      allowed:=label='own' or office in ('Karkh','Governorates');
      assert public.can_access_indoor_project_branch(target)=allowed,format('Wrong creator project scope: %s/%s',label,office);
      assert public.can_access_indoor_client_branch(md5('creator-fixture-client-'||label||office)::uuid)=allowed,format('Wrong creator client scope: %s/%s',label,office);
      assert exists(select 1 from public.projects where id=target)=allowed,format('Wrong direct project read: %s/%s',label,office);
      assert exists(select 1 from public.clients where id=md5('creator-fixture-client-'||label||office)::uuid)=allowed,format('Wrong direct client read: %s/%s',label,office);
      assert not exists(select 1 from public.openings where project_id=target and not allowed),'Unrelated cross-office opening exposed';
      assert not exists(select 1 from public.documents where project_id=target and not allowed),'Unrelated cross-office document exposed';
      assert not exists(select 1 from public.measurement_completion_reports where project_id=target and not allowed),'Unrelated cross-office report exposed';
      if label='own' then
        assert exists(select 1 from public.openings where project_id=target),'Creator lost their measurements';
        assert exists(select 1 from public.measurement_completion_reports where project_id=target),'Creator lost their measurement report';
      end if;
      assert exists(select 1 from storage.objects where id=md5('creator-fixture-file-'||label||office)::uuid)=allowed,'Wrong creator storage scope';
      update public.projects set project_notes='Creator fixture authenticated edit' where id=target;
      get diagnostics changed=row_count;
      assert changed=case when allowed then 1 else 0 end,format('Wrong direct project update: %s/%s',label,office);
      update public.clients set mobile='00000000000' where id=md5('creator-fixture-client-'||label||office)::uuid;
      get diagnostics changed=row_count;
      assert allowed or changed=0,'Unrelated cross-office client was changed';
      if label='own' then assert changed=1,'Creator lost client editing'; end if;
    end loop;
  end loop;
  assert not public.current_employee_can_access_project_row('Najaf',null,null),'NULL creator granted cross-office access';
  assert not exists(select 1 from public.documents where id=md5('creator-fixture-mixed-document')::uuid),'Shared client bypassed project ownership';
  begin
    insert into public.documents(id,owner_type,client_id,project_id,file_name,storage_bucket,storage_path,uploaded_by)
      values(gen_random_uuid(),'project',md5('creator-fixture-client-ownNajaf')::uuid,md5('creator-fixture-project-otherNajaf')::uuid,
        'blocked.pdf','project-attachments','blocked.pdf',actor);
    raise exception 'Shared client bypassed document INSERT ownership';
  exception when insufficient_privilege then null; end;
  -- Creator row recognition must not authorize NEW projects in other offices.
  foreach office in array array['Rasafa','Najaf'] loop
    begin
      insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
        values(gen_random_uuid(),md5('creator-fixture-client-ownNajaf')::uuid,'Forbidden new project','TEST-CREATOR-FORBIDDEN-'||office,office,actor);
      raise exception 'Creator exception broadened direct project creation';
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
      values(gen_random_uuid(),md5('creator-fixture-client-ownNajaf')::uuid,'Spoofed author','TEST-CREATOR-SPOOF','Najaf',md5('creator-fixture-admin')::uuid);
    raise exception 'Creator exception allowed a forged author';
  exception when insufficient_privilege then null; end;
end;
$authenticated_rows$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $service_and_status$
declare actor uuid:=md5('creator-fixture-author')::uuid; office text; target uuid; operation uuid:=gen_random_uuid();
  opening_id uuid:=gen_random_uuid(); first_result jsonb; replay jsonb;
  opening_payload jsonb; registration_payload jsonb;
begin
  assert not public.employee_can_access_project_branch(actor,'Najaf'),'Creation/assignment branch capability was broadened';
  assert not public.employee_can_access_project_branch(actor,'Rasafa'),'Rasafa creation capability was broadened';
  foreach office in array array['Karkh','Rasafa','Najaf','Governorates'] loop
    target:=md5('creator-fixture-project-own'||office)::uuid;
    perform public.require_indoor_project_branch(target,actor);
    if office in ('Rasafa','Najaf') then
      begin
        perform public.require_indoor_project_branch(md5('creator-fixture-project-other'||office)::uuid,actor);
        raise exception 'Creator service guard accepted an unrelated foreign entry';
      exception when insufficient_privilege then null; end;
    end if;
  end loop;
  begin
    perform public.require_indoor_project_branch(gen_random_uuid(),actor);
    raise exception 'Creator guard accepted a missing project';
  exception when insufficient_privilege then null; end;

  target:=md5('creator-fixture-project-ownNajaf')::uuid;
  opening_payload:=jsonb_build_object('id',opening_id,'floor','GF','room','Office','width',100,'height',200,
    'quantity',3,'structuralType','Window','openingType','Sliding');
  first_result:=public.sync_field_change(operation,actor,target,'opening',opening_payload,now(),null);
  replay:=public.sync_field_change(operation,actor,target,'opening',opening_payload,now(),null);
  assert first_result=replay,'Creator cross-office operation retry was not idempotent';
  assert (select count(*)=1 from public.openings where id=opening_id and project_id=target and created_by=actor and quantity=3),
    'Creator could not add measurements to their historical entry';

  registration_payload:='{"client":{"clientName":"Creator creation fixture","clientType":"individual","mobile":"00000000000"},"project":{"address":"Fixture","structureReadiness":"ready","buildingType":"villa_house"}}';
  foreach office in array array['Rasafa','Najaf'] loop
    begin
      perform public.register_sales_project(actor,jsonb_set(registration_payload,'{project,branch}',to_jsonb(office)));
      raise exception 'Creator exception broadened RPC project creation';
    exception when insufficient_privilege then null; end;
  end loop;
  perform public.register_sales_project(actor,jsonb_set(registration_payload,'{project,branch}','"Karkh"'));

  update public.profiles set is_active=false,status='Inactive' where id=actor;
  begin
    perform public.sync_field_change(operation,actor,target,'opening',opening_payload,now(),null);
    raise exception 'Inactive creator replayed an operation';
  exception when insufficient_privilege then null; end;
  update public.profiles set is_active=true,status='Active',role='Indoor Sales' where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  assert not public.current_employee_can_access_project_row('Najaf',actor,null),'Non-Outdoor current-user helper inherited creator access';
  assert not public.can_access_indoor_client_branch(md5('creator-fixture-client-ownNajaf')::uuid),'Non-Outdoor creator inherited foreign client access';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.require_indoor_project_branch(target,actor);
    raise exception 'Non-Outdoor role inherited cross-office creator permission';
  exception when insufficient_privilege then null; end;
  update public.profiles set role='Outdoor Sales',branch=null where id=actor;
  perform public.require_indoor_project_branch(target,actor);
  replay:=public.sync_field_change(operation,actor,target,'opening',opening_payload,now(),null);
  assert first_result=replay,'Active creator lost saved entry when office became unassigned';
  begin
    perform public.register_sales_project(actor,jsonb_set(registration_payload,'{project,branch}','"Karkh"'));
    raise exception 'Unassigned creator registered new office work';
  exception when insufficient_privilege then null; end;
end;
$service_and_status$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('creator-fixture-author')::uuid::text,true);
do $unassigned_creator$
declare office text; target uuid;
begin
  foreach office in array array['Karkh','Rasafa','Najaf','Governorates'] loop
    target:=md5('creator-fixture-project-own'||office)::uuid;
    assert public.can_access_indoor_project_branch(target),'Unassigned active creator lost an entry';
    assert public.can_access_indoor_client_branch(md5('creator-fixture-client-own'||office)::uuid),'Unassigned creator lost linked client';
    assert exists(select 1 from public.projects where id=target),'Unassigned creator RLS lost entry';
    assert exists(select 1 from public.clients where id=md5('creator-fixture-client-own'||office)::uuid),'Unassigned creator RLS lost linked client';
    assert not exists(select 1 from public.projects where id=md5('creator-fixture-project-other'||office)::uuid),'Unassigned creator read another employee entry';
  end loop;
  assert not public.can_access_indoor_client_branch(md5('creator-fixture-unlinked-client')::uuid),'Unassigned creator gained unlinked client scope';
  begin
    insert into public.projects(id,client_id,project_name,project_number,branch,created_by)
      values(gen_random_uuid(),md5('creator-fixture-client-ownNajaf')::uuid,'Unassigned new project','TEST-CREATOR-UNASSIGNED','Najaf',auth.uid());
    raise exception 'Unassigned creator bypassed project creation office requirement';
  exception when invalid_parameter_value then null; end;
end;
$unassigned_creator$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
update public.profiles set is_active=false,status='Inactive' where id=md5('creator-fixture-author')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('creator-fixture-author')::uuid::text,true);
do $inactive_creator$
begin
  assert not public.can_access_indoor_project_branch(md5('creator-fixture-project-ownNajaf')::uuid),'Inactive creator helper exposed entry';
  assert not public.can_access_indoor_client_branch(md5('creator-fixture-client-ownNajaf')::uuid),'Inactive creator helper exposed client';
  assert not exists(select 1 from public.projects where project_number like 'TEST-CREATOR-%'),'Inactive creator RLS exposed entry';
  assert not exists(select 1 from storage.objects where name=md5('creator-fixture-project-ownNajaf')::uuid::text||'/fixture.pdf'),'Inactive creator storage exposed entry';
end;
$inactive_creator$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
update public.profiles set is_active=true,status='Active',branch='Karkh' where id=md5('creator-fixture-author')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('creator-fixture-teammate')::uuid::text,true);
do $authenticated_identity$
begin
  assert not public.can_access_indoor_project_branch(md5('creator-fixture-project-ownNajaf')::uuid),'Same current team gained unrelated foreign branch access';
  begin
    perform public.create_measurement_request(md5('creator-fixture-project-ownNajaf')::uuid,null,null,null,md5('creator-fixture-author')::uuid);
    raise exception 'Authenticated legacy RPC spoofed creator';
  exception when insufficient_privilege then null; end;
end;
$authenticated_identity$;
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $anonymous_identity$
begin
  begin
    perform public.create_measurement_request(md5('creator-fixture-project-ownNajaf')::uuid,null,null,null,md5('creator-fixture-author')::uuid);
    raise exception 'Anonymous legacy RPC spoofed creator';
  exception when insufficient_privilege then null; end;
end;
$anonymous_identity$;
reset role;

rollback;
