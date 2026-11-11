-- Run after 20261111040000 on a disposable database. All fixtures roll back.
begin;
do $$
declare
  outdoor uuid:=gen_random_uuid();
  assignee uuid:=gen_random_uuid();
  indoor uuid:=gen_random_uuid();
  manager uuid:=gen_random_uuid();
  employee uuid;
  customer uuid;
  site uuid:=gen_random_uuid();
  registered_site uuid:=gen_random_uuid();
  operation uuid;
  old_operation uuid:=gen_random_uuid();
  stamp timestamptz;
  before_project jsonb;
  before_client jsonb;
  receipts_before bigint;
  audits_before bigint;
  result jsonb;
  inactive_state jsonb;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,email)
    select employee_id,employee_id::text||'@example.invalid' from unnest(array[outdoor,assignee,indoor,manager]) employee_id;
  update profiles set role='Outdoor Sales',is_active=true,status='Active',outdoor_rotation_start_branch='Karkh' where id in(outdoor,assignee);
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update profiles set role='Sales Manager',branch='Rasafa',is_active=true,status='Active' where id=manager;
  insert into clients(client_name,mobile,client_type,created_by)
    values('Protected customer','00000000000','individual',outdoor) returning id into customer;
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,branch,structure_readiness,project_notes)
    values(site,customer,'Protected title','OUTDOOR-NO-NAME-'||site,outdoor,assignee,'Karkh','ready','Preserved notes');
  select updated_at,to_jsonb(p) into stamp,before_project from projects p where id=site;
  select to_jsonb(c) into before_client from clients c where id=customer;
  select count(*) into receipts_before from field_sync_receipts;
  select count(*) into audits_before from audit_events;

  -- Neither authorship nor current measurement assignment grants title edits.
  foreach employee in array array[outdoor,assignee] loop
    begin
      perform sync_field_change(gen_random_uuid(),employee,site,'rename-project','{"projectName":"Forbidden"}',now(),stamp);
      raise exception using errcode='ZX001',message='Outdoor Sales renamed a project';
    exception when sqlstate '42501' then
      assert sqlerrm='Only Indoor Sales and Sales Managers can change project names.';
    end;
    begin
      perform rename_project_client(site,employee,'Forbidden','Protected customer');
      raise exception using errcode='ZX001',message='Outdoor Sales renamed a client';
    exception when sqlstate '42501' then null;
    end;
  end loop;
  assert (select to_jsonb(p)=before_project from projects p where id=site),'Denied rename changed project data';
  assert (select to_jsonb(c)=before_client from clients c where id=customer),'Denied rename changed client data';
  assert (select count(*) from field_sync_receipts)=receipts_before,'Denied rename left a sync receipt';
  assert (select count(*) from audit_events)=audits_before,'Denied rename left an audit';

  -- Previously committed operations may acknowledge their original receipt,
  -- without reapplying a retired permission or overwriting a later title.
  insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(old_operation,outdoor,site,'rename-project',md5('{"projectName": "Old committed title"}'::jsonb::text||'rename-project'||site::text),now(),
      jsonb_build_object('id',site,'project_name','Old committed title'));
  result:=sync_field_change(old_operation,outdoor,site,'rename-project','{"projectName":"Old committed title"}',now(),stamp);
  assert result->>'project_name'='Old committed title','Existing receipts must still acknowledge committed work';
  assert (select project_name='Protected title' from projects where id=site),'Receipt replay reapplied an Outdoor rename';

  -- Indoor Sales and Sales Manager keep their existing title/client access.
  foreach employee in array array[indoor,manager] loop
    select updated_at into stamp from projects where id=site;
    operation:=gen_random_uuid();
    result:=sync_field_change(operation,employee,site,'rename-project',jsonb_build_object('projectName','Office title '||employee),now(),stamp);
    assert result->>'project_name'='Office title '||employee,'Office title permission was removed';
    assert (select count(*)=1 from audit_events where correlation_id=operation and actor_id=employee),'Office audit attribution changed';
    result:=rename_project_client(site,employee,'Office customer',case when employee=indoor then 'Protected customer' else 'Office customer' end);
    assert result->>'client_name'='Office customer','Office client-name permission was removed';
  end loop;

  -- Simulate the direct authenticated table path independently of the RPC.
  -- Both the creator's own client and project must reject name-only writes.
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',outdoor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outdoor)::text,true);
  begin
    update projects set project_name='Direct forbidden' where id=site;
    raise exception using errcode='ZX001',message='Direct Outdoor project-name update was accepted';
  exception when sqlstate '42501' then assert sqlerrm='Only Indoor Sales and Sales Managers can change project names.';
  end;
  begin
    update clients set client_name='Direct forbidden' where id=customer;
    raise exception using errcode='ZX001',message='Direct Outdoor client-name update was accepted';
  exception when sqlstate '42501' then assert sqlerrm='Only Indoor Sales can change client names.';
  end;
  -- Existing unchanged-name and contact updates retain their original behavior.
  update projects set project_name=project_name where id=site;
  update clients set client_name=client_name,mobile='00000000001' where id=customer;
  assert (select mobile='00000000001' from clients where id=customer),'Unrelated contact edits were blocked';

  -- Existing tokens and creator-based legacy policies can survive deactivation.
  -- Name guards inspect the stored role even when current_user_role() is null.
  foreach inactive_state in array array[
    '{"is_active":false,"status":"Active"}'::jsonb,
    '{"is_active":true,"status":"Inactive"}'::jsonb,
    '{"is_active":false,"status":"Inactive"}'::jsonb
  ] loop
    perform set_config('request.jwt.claim.role','service_role',true);
    update profiles set is_active=(inactive_state->>'is_active')::boolean,status=inactive_state->>'status' where id=outdoor;
    perform set_config('request.jwt.claim.role','authenticated',true);
    begin
      update projects set project_name='Inactive forbidden' where id=site;
      raise exception using errcode='ZX001',message='Inactive Outdoor project-name update was accepted';
    exception when sqlstate '42501' then assert sqlerrm='Only Indoor Sales and Sales Managers can change project names.';
    end;
    begin
      update clients set client_name='Inactive forbidden' where id=customer;
      raise exception using errcode='ZX001',message='Inactive Outdoor client-name update was accepted';
    exception when sqlstate '42501' then assert sqlerrm='Only Indoor Sales can change client names.';
    end;
  end loop;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update profiles set is_active=true,status='Active' where id=outdoor;

  -- Revoking renames must not prevent Outdoor Sales from registering a client
  -- and its initial project name through the existing field transaction.
  result:=sync_field_change(gen_random_uuid(),outdoor,registered_site,'register',
    jsonb_set('{"client":{"clientName":"New registration","mobile":"00000000002","clientType":"individual"},"project":{"buildingType":"residential_building","structureReadiness":"ready","address":"Baghdad","locationLatitude":33.3,"locationLongitude":44.3}}'::jsonb,
      '{project,branch}',to_jsonb(public.outdoor_sales_branch_for_date('Karkh',statement_timestamp()))),now(),null);
  assert (select project_name='New registration' from projects where id=registered_site),'Outdoor registration no longer creates the initial title';
  assert (select c.client_name='New registration' from projects p join clients c on c.id=p.client_id where p.id=registered_site),'Outdoor registration no longer creates the client';
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert not has_function_privilege('authenticated','public.rename_project_client(uuid,uuid,text,text)','execute');
  raise notice 'PASS: Outdoor name edits denied, direct writes guarded, office edits and registration retained';
end;
$$;
rollback;
