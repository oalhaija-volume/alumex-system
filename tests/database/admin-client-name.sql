-- Run after 20261111050000 on a disposable database. All fixtures roll back.
begin;
do $$
declare
  administrator uuid:=gen_random_uuid();
  indoor uuid:=gen_random_uuid();
  rasafa uuid:=gen_random_uuid();
  manager uuid:=gen_random_uuid();
  outdoor uuid:=gen_random_uuid();
  ceo uuid:=gen_random_uuid();
  director uuid:=gen_random_uuid();
  owner uuid:=gen_random_uuid();
  employee uuid;
  customer uuid;
  site uuid;
  shared_site uuid;
  branch_name text;
  invalid text;
  employee_state jsonb;
  result jsonb;
  client_before jsonb;
  project_before jsonb;
  workflow_before jsonb;
  audit_before bigint;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,email)
    select employee_id,employee_id::text||'@example.invalid'
    from unnest(array[administrator,indoor,rasafa,manager,outdoor,ceo,director,owner]) employee_id;
  update profiles set role='Admin',is_active=true,status='Active',branch=null where id=administrator;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=rasafa;
  update profiles set role='Sales Manager',branch='Rasafa',is_active=true,status='Active' where id=manager;
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  update profiles set role='CEO',is_active=true,status='Active' where id=ceo;
  update profiles set role='Sales Director',is_active=true,status='Active' where id=director;
  update profiles set role='Company Owner',is_active=true,status='Active' where id=owner;

  -- Admin can correct clients across all branches, including another employee's
  -- client and an Admin-created client with no sales-branch assignment.
  foreach branch_name in array array['Karkh','Rasafa','Governorates',null::text] loop
    insert into clients(client_name,mobile,client_type,created_by)
      values('Original client','00000000000','individual',case when branch_name is null then administrator else outdoor end)
      returning id into customer;
    site:=gen_random_uuid();shared_site:=gen_random_uuid();
    insert into projects(id,client_id,project_name,project_number,created_by,branch,governorate,structure_readiness)
    values(site,customer,'Separate project title','ADMIN-CLIENT-'||site,outdoor,branch_name,
      case when branch_name='Governorates' then 'البصرة' end,'ready'),
      (shared_site,customer,'Shared project title','ADMIN-SHARED-'||shared_site,outdoor,'Karkh',null,'ready');
    insert into sales_workflows(project_id,stage,quotation,contract,signed_at,revision)
      values(site,'signed','{"client":"Original client"}','{"client":"Original client"}',now(),9);
    select to_jsonb(c)-'client_name' into client_before from clients c where id=customer;
    select jsonb_agg(to_jsonb(p) order by p.id) into project_before from projects p where p.client_id=customer;
    select to_jsonb(w) into workflow_before from sales_workflows w where project_id=site;
    result:=rename_project_client(site,administrator,'  عميل صححه المدير  ','Original client');
    assert result=jsonb_build_object('id',customer,'client_name','عميل صححه المدير'),'Admin client name did not save';
    assert (select to_jsonb(c)-'client_name'=client_before from clients c where id=customer),'Unrelated client fields changed';
    assert (select jsonb_agg(to_jsonb(p) order by p.id)=project_before from projects p where p.client_id=customer),'Project data changed';
    assert (select to_jsonb(w)=workflow_before from sales_workflows w where project_id=site),'Saved documents changed';
    assert (select c.client_name='عميل صححه المدير' from projects p join clients c on c.id=p.client_id where p.id=shared_site),'Linked client identity stayed stale';
    assert (select count(*)=1 from audit_events where entity_type='client' and entity_id=customer and action='client_renamed'
      and actor_id=administrator and actor_role='Admin' and previous_value->>'client_name'='Original client'
      and new_value->>'client_name'='عميل صححه المدير'),'Admin audit attribution changed';
  end loop;

  -- Admin is the only added role. Leadership and Outdoor users remain denied.
  foreach employee in array array[outdoor,ceo,director,owner] loop
    begin
      perform rename_project_client(site,employee,'Forbidden','عميل صححه المدير');
      raise exception using errcode='ZX001',message='An unrelated role changed the client name';
    exception when sqlstate '42501' then
      assert sqlerrm='Only Admin, Indoor Sales and Sales Managers can change client names.';
    end;
  end loop;

  -- Existing office-role branch boundaries remain intact.
  update projects set branch='Rasafa' where id=site;
  begin
    perform rename_project_client(site,indoor,'Forbidden','عميل صححه المدير');
    raise exception using errcode='ZX001',message='Indoor Sales bypassed a branch boundary';
  exception when sqlstate '42501' then null;
  end;
  result:=rename_project_client(site,rasafa,'Rasafa client','عميل صححه المدير');
  assert result->>'client_name'='Rasafa client';
  result:=rename_project_client(site,manager,'Manager client','Rasafa client');
  assert result->>'client_name'='Manager client';
  assert (select count(*)=1 from audit_events where entity_id=customer and actor_id=manager and actor_role='Sales Manager'),'Sales Manager audit role changed';
  update projects set branch='Governorates',governorate='البصرة' where id=site;
  begin
    perform rename_project_client(site,rasafa,'Forbidden','Manager client');
    raise exception using errcode='ZX001',message='Rasafa changed a Governorates client';
  exception when sqlstate '42501' then null;
  end;
  result:=rename_project_client(site,indoor,'Karkh client','Manager client');
  assert result->>'client_name'='Karkh client';

  -- Deactivation cannot be bypassed by the new Admin permission.
  foreach employee_state in array array[
    '{"is_active":false,"status":"Active"}'::jsonb,
    '{"is_active":true,"status":"Inactive"}'::jsonb,
    '{"is_active":false,"status":"Inactive"}'::jsonb
  ] loop
    update profiles set is_active=(employee_state->>'is_active')::boolean,status=employee_state->>'status' where id=administrator;
    begin
      perform rename_project_client(site,administrator,'Forbidden','Karkh client');
      raise exception using errcode='ZX001',message='Inactive Admin changed a client';
    exception when sqlstate '42501' then null;
    end;
  end loop;
  update profiles set is_active=true,status='Active' where id=administrator;

  -- Stale names, validation, no-op saves and explicit company details retain
  -- the existing transaction's behavior and produce no false success/audit.
  select count(*) into audit_before from audit_events where entity_type='client' and entity_id=customer;
  begin
    perform rename_project_client(site,administrator,'Stale overwrite','Original client');
    raise exception using errcode='ZX001',message='Admin bypassed optimistic client-name validation';
  exception when sqlstate 'P0001' then
    assert sqlerrm='This client changed on another device. Reload the projects before changing its name.';
  end;
  foreach invalid in array array[null::text,'','   ',E'\n\t',repeat('ع',151)] loop
    begin
      perform rename_project_client(site,administrator,invalid,'Karkh client');
      raise exception using errcode='ZX001',message='Admin saved an invalid name';
    exception when sqlstate '22023' then null;
    end;
  end loop;
  result:=rename_project_client(site,administrator,' Karkh client ','Karkh client');
  assert (select count(*) from audit_events where entity_type='client' and entity_id=customer)=audit_before,'Failed or no-op edits left an audit';
  update clients set client_type='company',company_name='Karkh client' where id=customer;
  result:=rename_project_client(site,administrator,'Company correction','Karkh client');
  assert (select company_name='Company correction' from clients where id=customer),'Default company alias became stale';
  update clients set company_name='Separate legal company' where id=customer;
  result:=rename_project_client(site,administrator,repeat('ع',150),'Company correction');
  assert (select company_name='Separate legal company' and length(client_name)=150 from clients where id=customer),'Explicit company details or maximum length changed';

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',outdoor::text,true);
  begin
    update clients set client_name='Direct forbidden' where id=customer;
    raise exception using errcode='ZX001',message='Outdoor direct-name protection was removed';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform rename_project_client(site,administrator,'Forged actor',repeat('ع',150));
    raise exception using errcode='ZX001',message='The caller forged an Admin actor';
  exception when sqlstate '42501' then
    assert sqlerrm='The actor does not match the authenticated user.';
  end;
  assert not has_function_privilege('authenticated','public.rename_project_client(uuid,uuid,text,text)','execute');
  assert not has_function_privilege('anon','public.rename_project_client(uuid,uuid,text,text)','execute');
  assert has_function_privilege('service_role','public.rename_project_client(uuid,uuid,text,text)','execute');
  raise notice 'PASS: Admin client names, office branch scopes, Outdoor denial, validation, audit and document preservation';
end;
$$;
rollback;
