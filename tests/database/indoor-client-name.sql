-- Run after 20261110010000. All fixtures and changes are rolled back.
begin;
do $$
declare
  indoor uuid:=gen_random_uuid();
  rasafa uuid:=gen_random_uuid();
  manager uuid:=gen_random_uuid();
  outdoor uuid:=gen_random_uuid();
  administrator uuid:=gen_random_uuid();
  customer uuid;
  site uuid;
  rasafa_site uuid;
  shared_site uuid;
  branch_name text;
  employee uuid;
  invalid text;
  old_name text;
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
    from unnest(array[indoor,rasafa,manager,outdoor,administrator]) employee_id;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=rasafa;
  update profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  update profiles set role='Admin',is_active=true,status='Active' where id=administrator;

  foreach branch_name in array array['Karkh','Rasafa','Governorates'] loop
    employee:=case when branch_name='Rasafa' then rasafa else indoor end;
    insert into clients(client_name,mobile,client_type,notes,created_by)
      values('Original client','00000000000','individual','Preserved notes',outdoor) returning id into customer;
    site:=gen_random_uuid();shared_site:=gen_random_uuid();
    insert into projects(id,client_id,project_name,project_number,created_by,branch,governorate,structure_readiness)
    values(site,customer,'Preserved project title','CLIENT-NAME-'||site,administrator,branch_name,
      case when branch_name='Governorates' then 'البصرة' end,'ready'),
      (shared_site,customer,'Shared project title','CLIENT-NAME-'||shared_site,administrator,'Karkh',null,'ready');
    insert into sales_workflows(project_id,stage,quotation,contract,signed_at,revision)
      values(site,'signed','{"client":"Original client"}','{"client":"Original client"}',now(),7);
    select to_jsonb(c)-'updated_at'-'client_name' into client_before from clients c where id=customer;
    select jsonb_agg(to_jsonb(p) order by p.id) into project_before from projects p where p.client_id=customer;
    select to_jsonb(w) into workflow_before from sales_workflows w where project_id=site;
    result:=rename_project_client(site,employee,'  عميل جديد  ','Original client');
    assert result=jsonb_build_object('id',customer,'client_name','عميل جديد'),'Expected the trimmed client identity';
    assert (select client_name='عميل جديد' from clients where id=customer),'Client name was not saved';
    assert (select to_jsonb(c)-'updated_at'-'client_name'=client_before from clients c where id=customer),'Unrelated client fields changed';
    assert (select jsonb_agg(to_jsonb(p) order by p.id)=project_before from projects p where p.client_id=customer),'Project data changed';
    assert (select to_jsonb(w)=workflow_before from sales_workflows w where project_id=site),'Saved commercial documents changed';
    assert (select c.client_name='عميل جديد' from projects p join clients c on c.id=p.client_id where p.id=shared_site),'Shared client identity was not updated';
    assert (select count(*)=1 from audit_events where entity_type='client' and entity_id=customer and action='client_renamed'
      and actor_id=employee and actor_role='Indoor Sales' and previous_value->>'client_name'='Original client'
      and new_value->>'client_name'='عميل جديد'),'Rename must retain the real actor and both names';
    if branch_name='Rasafa' then rasafa_site:=site; end if;
  end loop;

  -- Both office roles respect their existing visibility rules.
  site:=rasafa_site;
  select client_id into customer from projects where id=site;
  foreach employee in array array[indoor,outdoor,administrator] loop
    begin
      perform rename_project_client(site,employee,'Forbidden','عميل جديد');
      raise exception using errcode='ZX001',message='Unauthorized actor changed client identity';
    exception when sqlstate '42501' then null;
    end;
  end loop;
  result:=rename_project_client(site,manager,'Manager client','عميل جديد');
  assert result->>'client_name'='Manager client';
  assert (select count(*)=1 from audit_events where entity_id=customer and actor_id=manager and actor_role='Sales Manager'),'Manager audit lost the stored job title';
  update profiles set branch=null where id=rasafa;
  begin
    perform rename_project_client(site,rasafa,'Forbidden','Manager client');
    raise exception using errcode='ZX001',message='Indoor branch assignment was bypassed';
  exception when sqlstate '42501' then null;
  end;
  update profiles set branch='Rasafa',is_active=false,status='Inactive' where id=rasafa;
  begin
    perform rename_project_client(site,rasafa,'Forbidden','Manager client');
    raise exception using errcode='ZX001',message='Inactive employee changed a client';
  exception when sqlstate '42501' then null;
  end;
  update profiles set is_active=true,status='Active' where id=rasafa;

  select count(*) into audit_before from audit_events where entity_type='client' and entity_id=customer;
  foreach old_name in array array[null::text,'Original client'] loop
    begin
      perform rename_project_client(site,rasafa,'Stale name',old_name);
      raise exception using errcode='ZX001',message='Stale editor overwrote a client name';
    exception when sqlstate 'P0001' then
      assert sqlerrm='This client changed on another device. Reload the projects before changing its name.';
    end;
  end loop;
  foreach invalid in array array[null::text,'','   ',E'\n\t',repeat('ع',151)] loop
    begin
      perform rename_project_client(site,rasafa,invalid,'Manager client');
      raise exception using errcode='ZX001',message='Invalid name was accepted';
    exception when sqlstate '22023' then null;
    end;
  end loop;
  result:=rename_project_client(site,rasafa,' Manager client ','Manager client');
  assert (select count(*) from audit_events where entity_type='client' and entity_id=customer)=audit_before,'No-op or failed update left an audit';
  assert (select client_name='Manager client' from clients where id=customer),'Failed update changed client data';

  -- Company aliases follow client corrections; distinct company details survive.
  update clients set client_type='company',company_name='Manager client' where id=customer;
  result:=rename_project_client(site,rasafa,'Company corrected','Manager client');
  assert (select company_name='Company corrected' from clients where id=customer),'Default company alias became stale';
  update clients set company_name='Separate legal company' where id=customer;
  result:=rename_project_client(site,rasafa,repeat('ع',150),'Company corrected');
  assert (select company_name='Separate legal company' and length(client_name)=150 from clients where id=customer),'Explicit company details or maximum name length changed';
  assert not has_function_privilege('authenticated','public.rename_project_client(uuid,uuid,text,text)','execute');
  assert not has_function_privilege('anon','public.rename_project_client(uuid,uuid,text,text)','execute');
  assert has_function_privilege('service_role','public.rename_project_client(uuid,uuid,text,text)','execute');
  raise notice 'PASS: Indoor client names, branch access, manager access, validation, stale edits, audit, shared clients and preserved project/document data';
end;
$$;
rollback;
