-- Run on a disposable database after 20261108010000. Every fixture rolls back.
begin;
do $$
declare
  karkh uuid := gen_random_uuid();
  rasafa uuid := gen_random_uuid();
  unassigned uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  assignee uuid := gen_random_uuid();
  teammate uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid();
  director uuid := gen_random_uuid();
  customer uuid;
  site uuid;
  karkh_site uuid;
  karkh_operation uuid;
  operation uuid;
  employee uuid;
  stamp timestamptz;
  branch_name text;
  expected_name text;
  invalid jsonb;
  result jsonb;
  original_project jsonb;
  original_customer jsonb;
  original_workflow jsonb;
  receipts_before bigint;
  audits_before bigint;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,email)
    select employee_id,employee_id::text||'@example.invalid'
    from unnest(array[karkh,rasafa,unassigned,manager,outdoor,assignee,teammate,administrator,director]) employee_id;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=karkh;
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=rasafa;
  update profiles set role='Indoor Sales',branch=null,is_active=true,status='Active' where id=unassigned;
  update profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update profiles set role='Outdoor Sales',outdoor_team_key='sajjad_ehab',is_active=true,status='Active' where id in(outdoor,assignee,teammate);
  update profiles set role='Admin',is_active=true,status='Active' where id=administrator;
  update profiles set role='Sales Director',is_active=true,status='Active' where id=director;
  insert into clients(client_name,mobile,client_type,created_by)
    values('Unchanged customer record','00000000000','individual',outdoor) returning id into customer;
  select to_jsonb(c) into original_customer from clients c where id=customer;

  -- Indoor staff can edit another employee's project title in their own branch.
  -- Both branches share Governorates; signed commercial snapshots stay intact.
  foreach branch_name in array array['Karkh','Rasafa','Governorates'] loop
    site:=gen_random_uuid();operation:=gen_random_uuid();
    employee:=case when branch_name='Rasafa' then rasafa else karkh end;
    expected_name:='اسم مشروع '||branch_name;
    insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,branch,governorate,structure_readiness,sales_status,status,project_notes)
    values(site,customer,'Original project title','INDOOR-NAME-'||site,outdoor,assignee,branch_name,
      case when branch_name='Governorates' then 'البصرة' end,'ready',
      case when branch_name='Governorates' then 'contract_signed' else 'new_lead' end,
      'Draft','Preserved project notes');
    insert into sales_workflows(project_id,stage,quotation,contract,signed_at,revision)
    values(site,case when branch_name='Governorates' then 'signed' else 'quotation' end,
      '{"saved":"quotation"}','{"saved":"contract"}',case when branch_name='Governorates' then now() end,7);
    select updated_at,to_jsonb(p)-'updated_at'-'project_name' into stamp,original_project from projects p where id=site;
    select to_jsonb(w) into original_workflow from sales_workflows w where project_id=site;
    result:=sync_field_change(operation,employee,site,'rename-project',jsonb_build_object('projectName','  '||expected_name||'  '),now(),stamp);
    assert result->>'project_name'=expected_name,'Indoor rename must return the trimmed project title';
    assert result->>'project_number'='INDOOR-NAME-'||site,'Project number must remain stable';
    assert (select project_name=expected_name from projects where id=site),'Project title was not updated';
    assert (select to_jsonb(p)-'updated_at'-'project_name'=original_project from projects p where id=site),'Rename changed unrelated project fields';
    assert (select to_jsonb(w)=original_workflow from sales_workflows w where project_id=site),'Rename changed quotations, contracts or workflow history';
    assert (select to_jsonb(c)=original_customer from clients c where id=customer),'Rename changed the customer record';
    assert (select count(*)=1 from audit_events where action='project_renamed' and entity_id=site and actor_id=employee
      and actor_role='Indoor Sales' and correlation_id=operation and previous_value->>'project_name'='Original project title'
      and new_value->>'project_name'=expected_name),'Indoor rename audit must retain the actual actor and title change';
    assert sync_field_change(operation,employee,site,'rename-project',jsonb_build_object('projectName','  '||expected_name||'  '),now(),'2000-01-01')=result,'Replay must return its original receipt before the version check';
    assert (select count(*)=1 from field_sync_receipts where operation_id=operation),'Replay inserted another receipt';
    assert (select count(*)=1 from audit_events where correlation_id=operation),'Replay inserted another audit';
    begin
      perform sync_field_change(operation,employee,site,'rename-project','{"projectName":"Different work"}',now(),stamp);
      raise exception using errcode='ZX001',message='Operation reuse with different work was accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='Operation ID already used for different work';
    end;
    if branch_name='Karkh' then karkh_site:=site;karkh_operation:=operation;end if;
  end loop;

  -- Replaying a previously committed rename cannot bypass a later branch move.
  update profiles set branch='Rasafa' where id=karkh;
  begin
    perform sync_field_change(karkh_operation,karkh,karkh_site,'rename-project',jsonb_build_object('projectName','  اسم مشروع Karkh  '),now(),'2000-01-01');
    raise exception using errcode='ZX001',message='Receipt replay bypassed the current Indoor branch boundary';
  exception when sqlstate '42501' then null;
  end;
  update profiles set branch='Karkh' where id=karkh;

  -- Managers retain their existing branch exemption while recording their real
  -- stored role; resolving permissions must not relabel the audit actor.
  assert public.sales_permission_role('Sales Manager'::public.app_role)='Indoor Sales';
  site:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,branch,structure_readiness)
  values(site,customer,'Protected project title','INDOOR-NAME-'||site,outdoor,assignee,'Rasafa','ready');
  select updated_at into stamp from projects where id=site;
  operation:=gen_random_uuid();
  result:=sync_field_change(operation,manager,site,'rename-project','{"projectName":"Manager project title"}',now(),stamp);
  assert result->>'project_name'='Manager project title';
  assert (select count(*)=1 from audit_events where correlation_id=operation and actor_id=manager and actor_role='Sales Manager'),'Manager audit lost its stored job title';

  -- Assigned and team Outdoor staff still cannot rename somebody else's entry.
  -- Office branch checks and all other role restrictions remain in force.
  select count(*) into receipts_before from field_sync_receipts;
  select count(*) into audits_before from audit_events;
  foreach employee in array array[karkh,unassigned,assignee,teammate,administrator,director] loop
    select updated_at into stamp from projects where id=site;
    begin
      perform sync_field_change(gen_random_uuid(),employee,site,'rename-project','{"projectName":"Forbidden"}',now(),stamp);
      raise exception using errcode='ZX001',message='Unauthorized employee renamed a project';
    exception when sqlstate '42501' or sqlstate 'P0001' then null;
    end;
  end loop;
  assert (select project_name='Manager project title' from projects where id=site),'Denied rename changed the title';
  assert (select count(*) from field_sync_receipts)=receipts_before,'Denied rename left a receipt';
  assert (select count(*) from audit_events)=audits_before,'Denied rename left an audit';
  select updated_at into stamp from projects where id=site;
  result:=sync_field_change(gen_random_uuid(),outdoor,site,'rename-project','{"projectName":"Outdoor creator title"}',now(),stamp);
  assert result->>'project_name'='Outdoor creator title','Outdoor creator ownership was not preserved';

  -- Validation and optimistic concurrency are unchanged for newly eligible staff.
  foreach invalid in array array['{}'::jsonb,'{"projectName":null}'::jsonb,'{"projectName":12}'::jsonb,'{"projectName":""}'::jsonb,'{"projectName":"   "}'::jsonb,jsonb_build_object('projectName',E'\t\n'),jsonb_build_object('projectName',repeat('ع',151))] loop
    select updated_at into stamp from projects where id=site;
    begin
      perform sync_field_change(gen_random_uuid(),rasafa,site,'rename-project',invalid,now(),stamp);
      raise exception using errcode='ZX001',message='Invalid Indoor project title was accepted';
    exception when sqlstate '22023' then null;
    end;
  end loop;
  foreach stamp in array array[null::timestamptz,'2000-01-01'::timestamptz] loop
    begin
      perform sync_field_change(gen_random_uuid(),rasafa,site,'rename-project','{"projectName":"Stale"}',now(),stamp);
      raise exception using errcode='ZX001',message='A stale or missing project version was accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='This project changed on another device. Reload the project before changing its name.';
    end;
  end loop;
  select updated_at into stamp from projects where id=site;
  result:=sync_field_change(gen_random_uuid(),rasafa,site,'rename-project',jsonb_build_object('projectName',repeat('ع',150)),now(),stamp);
  assert length(result->>'project_name')=150,'The existing 150-character title limit changed';
  assert (select to_jsonb(c)=original_customer from clients c where id=customer),'Customer data changed during title validation';
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert not has_function_privilege('anon','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert has_function_privilege('service_role','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  raise notice 'PASS: Indoor project titles, branch boundaries, manager policy, Outdoor ownership, audit, validation, replay and preserved customer/workflow data';
end;
$$;
rollback;
