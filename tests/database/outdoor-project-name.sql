begin;
do $$
declare
  outdoor uuid := gen_random_uuid();
  other_outdoor uuid := gen_random_uuid();
  indoor uuid := gen_random_uuid();
  visitor uuid := gen_random_uuid();
  client uuid;
  target_project uuid;
  operation uuid;
  employee uuid;
  stamp timestamptz;
  phase text;
  invalid jsonb;
  result jsonb;
  repeated jsonb;
  original_project jsonb;
  original_workflow jsonb;
  receipts_before bigint;
  audits_before bigint;
begin
  insert into auth.users(id,email) values
    (outdoor,outdoor::text||'@example.invalid'),
    (other_outdoor,other_outdoor::text||'@example.invalid'),
    (indoor,indoor::text||'@example.invalid'),
    (visitor,visitor::text||'@example.invalid');
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in (outdoor,other_outdoor,visitor);
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  insert into clients(client_name,mobile,client_type,created_by)
    values('Original client name','00000000000','individual',indoor) returning id into client;

  -- Outdoor Sales creators may rename throughout the existing sales lifecycle,
  -- including projects already handed off, without editing saved commercial data.
  foreach phase in array array['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated','contract_signed','transferred_to_operations','cancelled'] loop
    target_project:=gen_random_uuid(); operation:=gen_random_uuid();
    insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,structure_readiness,sales_status,status,project_notes,branch,governorate)
    values(target_project,client,'Original project name','NAME-'||target_project,outdoor,other_outdoor,'ready',phase,'Draft','Preserved notes','Governorates','البصرة');
    insert into sales_workflows(project_id,stage,quotation,contract)
    values(target_project,'quotation','{"saved":"quotation"}','{"saved":"contract"}');
    select updated_at,to_jsonb(p)-'updated_at'-'project_name' into stamp,original_project from projects p where id=target_project;
    select to_jsonb(w) into original_workflow from sales_workflows w where w.project_id=target_project;
    result:=sync_field_change(operation,outdoor,target_project,'rename-project','{"projectName":"  اسم المشروع الجديد  "}',now(),stamp);
    assert result->>'project_name'='اسم المشروع الجديد','Receipt must contain the trimmed project name';
    assert result->>'project_number'='NAME-'||target_project,'Project number changed';
    assert (select project_name='اسم المشروع الجديد' from projects where id=target_project),'Project name was not saved';
    assert (select to_jsonb(p)-'updated_at'-'project_name'=original_project from projects p where id=target_project),'Unrelated project fields changed';
    assert (select to_jsonb(w)=original_workflow from sales_workflows w where w.project_id=target_project),'Saved quotation or contract changed';
    assert (select count(*)=1 from audit_events where entity_id=target_project and action='project_renamed'
      and actor_id=outdoor and actor_role='Outdoor Sales' and correlation_id=operation
      and previous_value->>'project_name'='Original project name' and new_value->>'project_name'='اسم المشروع الجديد'),'Rename audit is missing';
    repeated:=sync_field_change(operation,outdoor,target_project,'rename-project','{"projectName":"  اسم المشروع الجديد  "}',now(),'2000-01-01');
    assert repeated=result,'A retry must return the original receipt even with a stale version';
    assert (select count(*)=1 from field_sync_receipts where operation_id=operation),'Retry created another receipt';
    assert (select count(*)=1 from audit_events where entity_id=target_project and action='project_renamed'),'Retry created another audit';
  end loop;

  -- The creator keeps the same access even when another outdoor employee is assigned.
  -- Governorates avoids making this fixture depend on the half-month rotation.
  target_project:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,structure_readiness,branch,governorate)
  values(target_project,client,'Creator project','NAME-'||target_project,outdoor,other_outdoor,'not_ready','Governorates','البصرة');
  select updated_at into stamp from projects where id=target_project;
  result:=sync_field_change(gen_random_uuid(),outdoor,target_project,'rename-project','{"projectName":"Creator renamed"}',now(),stamp);
  assert result->>'project_name'='Creator renamed','Creator must retain rename access';

  -- Reuse an Indoor-created project to test reference-only access. Prior visits
  -- and legacy credit intentionally do not create a new write permission.
  target_project:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,legacy_outdoor_sales_id,structure_readiness)
  values(target_project,client,'Protected project','NAME-'||target_project,other_outdoor,other_outdoor,outdoor,'ready');
  insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
  values(gen_random_uuid(),visitor,target_project,'finish','history',now(),'{}');
  select updated_at into stamp from projects where id=target_project;
  select count(*) into receipts_before from field_sync_receipts;
  select count(*) into audits_before from audit_events;
  foreach employee in array array[outdoor,visitor,indoor] loop
    begin
      perform sync_field_change(gen_random_uuid(),employee,target_project,'rename-project','{"projectName":"Forbidden"}',now(),stamp);
      raise exception using errcode='ZX001',message='Reference-only employee or Indoor Sales renamed a project';
    exception when sqlstate '42501' or sqlstate 'P0001' then null;
    end;
  end loop;
  assert (select project_name='Protected project' from projects where id=target_project),'Denied rename changed the project';
  assert (select count(*) from field_sync_receipts)=receipts_before,'Denied rename left a receipt';
  assert (select count(*) from audit_events)=audits_before,'Denied rename left an audit';

  -- Validate at the transaction boundary as well as in the API and device UI.
  foreach invalid in array array['{}'::jsonb,'{"projectName":null}'::jsonb,'{"projectName":12}'::jsonb,'{"projectName":""}'::jsonb,'{"projectName":"   "}'::jsonb,jsonb_build_object('projectName',E'\t\n'),jsonb_build_object('projectName',repeat('x',151))] loop
    begin
      perform sync_field_change(gen_random_uuid(),other_outdoor,target_project,'rename-project',invalid,now(),stamp);
      raise exception using errcode='ZX001',message='Invalid project name accepted';
    exception when sqlstate '22023' then null;
    end;
  end loop;
  foreach stamp in array array[null::timestamptz,'2000-01-01'::timestamptz] loop
    begin
      perform sync_field_change(gen_random_uuid(),other_outdoor,target_project,'rename-project','{"projectName":"Stale"}',now(),stamp);
      raise exception using errcode='ZX001',message='Missing or stale project version accepted';
    exception when sqlstate 'P0001' then
      assert sqlerrm='This project changed on another device. Reload the project before changing its name.';
    end;
  end loop;
  select updated_at into stamp from projects where id=target_project;
  result:=sync_field_change(gen_random_uuid(),other_outdoor,target_project,'rename-project',jsonb_build_object('projectName',repeat('x',150)),now(),stamp);
  assert length(result->>'project_name')=150,'150-character project names must be accepted';
  assert (select client_name='Original client name' from clients where id=client),'Renaming a project must preserve the client name';

  update profiles set is_active=false where id=other_outdoor;
  begin
    perform sync_field_change(gen_random_uuid(),other_outdoor,target_project,'rename-project','{"projectName":"Inactive"}',now(),stamp);
    raise exception using errcode='ZX001',message='Inactive employee renamed a project';
  exception when sqlstate 'P0001' then assert sqlerrm='Sales access required';
  end;
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert not has_function_privilege('anon','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  raise notice 'PASS: Outdoor project name access, validation, concurrency, idempotency, audit and preserved data';
end;
$$;
rollback;
