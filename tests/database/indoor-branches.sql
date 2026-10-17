-- Run against the migrated database inside a transaction; always roll back.
begin;
do $$
declare
  admin_id uuid;
  indoor_id uuid := gen_random_uuid();
  outdoor_id uuid := gen_random_uuid();
  hr_id uuid := gen_random_uuid();
  client_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  offline_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  employee public.profiles;
  result jsonb;
  saved_branch text;
begin
  select id into strict admin_id from public.profiles
    where role = 'Admin' and is_active and status = 'Active' limit 1;
  insert into auth.users(id, email) values
    (indoor_id, indoor_id::text || '@example.invalid'),
    (outdoor_id, outdoor_id::text || '@example.invalid'),
    (hr_id, hr_id::text || '@example.invalid');
  update public.profiles set role = 'Indoor Sales', full_name = 'Branch test',
    username = 'branch.' || replace(indoor_id::text, '-', ''), status = 'Active', is_active = true where id = indoor_id;
  update public.profiles set role = 'Outdoor Sales', status = 'Active', is_active = true where id = outdoor_id;
  update public.profiles set role = 'HR', status = 'Active', is_active = true where id = hr_id;
  insert into public.clients(id, client_name, created_by) values(client_id, 'Branch verification', indoor_id);

  -- Missing assignment cannot silently create an unlabelled project.
  begin
    insert into public.projects(client_id, project_number, project_name, created_by, assigned_outdoor_sales_id)
      values(client_id, 'VERIFY-' || project_id, 'Branch verification', indoor_id, outdoor_id);
    raise exception 'Missing branch was accepted';
  exception when sqlstate '22023' then null;
  end;

  select * into employee from public.profiles where id = indoor_id;
  result := public.update_employee_profile_with_branch(admin_id, indoor_id, employee.updated_at,
    employee.full_name, employee.username, 'Indoor Sales', true, 'Karkh');
  assert result->>'branch' = 'Karkh', 'Admin must be able to assign Karkh';
  begin
    perform public.update_employee_profile_with_branch(admin_id, indoor_id, '2000-01-01',
      employee.full_name, employee.username, 'Indoor Sales', true, 'Rasafa');
    raise exception 'Stale profile update was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  select * into employee from public.profiles where id = indoor_id;
  begin
    perform public.update_employee_profile_with_branch(hr_id, indoor_id, employee.updated_at,
      'Must roll back', employee.username, 'Indoor Sales', true, 'Rasafa');
    raise exception 'HR branch assignment was accepted';
  exception when sqlstate '42501' then null;
  end;
  assert (select full_name = 'Branch test' and branch = 'Karkh' from public.profiles where id = indoor_id),
    'Rejected branch change must roll back the entire profile update';
  begin
    perform public.update_employee_profile_with_branch(admin_id, indoor_id, employee.updated_at,
      employee.full_name, employee.username, 'Indoor Sales', true, 'Invalid');
    raise exception 'Invalid branch was accepted';
  exception when sqlstate '22023' then null;
  end;

  -- A forged branch from the client is overwritten using the creator profile.
  insert into public.projects(id, client_id, project_number, project_name, created_by, branch, assigned_outdoor_sales_id)
    values(project_id, client_id, 'VERIFY-' || project_id, 'Branch verification', indoor_id, 'Rasafa', outdoor_id);
  select branch into saved_branch from public.projects where id = project_id;
  assert saved_branch = 'Karkh', 'Project must use its creator branch';
  select * into employee from public.profiles where id = indoor_id;
  perform public.update_employee_profile_with_branch(admin_id, indoor_id, employee.updated_at,
    employee.full_name, employee.username, 'Indoor Sales', true, 'Rasafa');
  assert (select branch = 'Karkh' from public.projects where id = project_id),
    'Employee transfers must preserve existing projects';
  begin
    update public.projects set branch = 'Rasafa' where id = project_id;
    raise exception 'Existing project branch was overwritten';
  exception when sqlstate '42501' then null;
  end;

  -- The offline RPC also derives its branch server-side and stores it in the receipt.
  result := public.sync_field_change(operation_id, indoor_id, offline_id, 'register',
    jsonb_build_object('client', jsonb_build_object('clientName', 'Offline branch test', 'mobile', '00000000000', 'clientType', 'individual'),
      'project', jsonb_build_object('address', 'Baghdad', 'locationLatitude', 33.3, 'locationLongitude', 44.4,
        'structureReadiness', 'ready', 'assignedOutdoorSalesId', outdoor_id, 'branch', 'Karkh')),
    now(), null);
  assert result->>'branch' = 'Rasafa', 'Offline registration must use the assigned Rasafa branch';
  assert (select branch = 'Rasafa' from public.projects where id = offline_id);

  -- Test real authenticated database access, not just the HTTP guard.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', indoor_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', indoor_id::text, true);
  set local role authenticated;
  begin
    update public.profiles set branch = 'Karkh' where id = indoor_id;
    raise exception 'Employee self-assignment was accepted';
  exception when sqlstate '42501' then null;
  end;
  assert not has_function_privilege(current_user,
    'public.update_employee_profile_with_branch(uuid,uuid,timestamptz,text,text,text,boolean,text)', 'execute');
  reset role;
  raise notice 'PASS: branches, admin-only assignment, atomic edits, stale edits, project preservation, and offline registration';
end;
$$;
rollback;
