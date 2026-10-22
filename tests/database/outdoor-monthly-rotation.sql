-- Run as the database owner after all migrations. Every fixture and edit rolls back.
begin;
do $test$
declare
  staff_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  unconfigured_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  employee_id uuid;
  employee_index integer;
  start_branch text;
  allowed_branch text;
  blocked_branch text;
  project_id uuid;
  operation_id uuid;
  client_id uuid;
  original_project_id uuid;
  original_operation_id uuid;
  original_payload jsonb;
  original_result jsonb;
  payload jsonb;
  result jsonb;
  clients_before bigint;
  projects_before bigint;
  notification_count bigint;
  attempted_at timestamptz;
  calendar_case record;
begin
  -- Baghdad midnight is 21:00 UTC, including the 15th/16th rotation boundary.
  for calendar_case in select * from (values
    ('2026-10-01 00:00:00+03'::timestamptz, 'Karkh', 'Rasafa'),
    ('2026-10-15 20:59:59+00'::timestamptz, 'Karkh', 'Rasafa'),
    ('2026-10-15 21:00:00+00'::timestamptz, 'Rasafa', 'Karkh'),
    ('2026-10-31 23:59:59+03'::timestamptz, 'Rasafa', 'Karkh'),
    ('2026-11-01 00:00:00+03'::timestamptz, 'Karkh', 'Rasafa'),
    ('2026-12-31 23:59:59+03'::timestamptz, 'Rasafa', 'Karkh'),
    ('2027-01-01 00:00:00+03'::timestamptz, 'Karkh', 'Rasafa'),
    ('2028-02-29 23:59:59+03'::timestamptz, 'Rasafa', 'Karkh'),
    ('2028-03-01 00:00:00+03'::timestamptz, 'Karkh', 'Rasafa')
  ) cases(at_time, karkh_start_expected, rasafa_start_expected) loop
    assert public.outdoor_sales_branch_for_date('Karkh', calendar_case.at_time) = calendar_case.karkh_start_expected;
    assert public.outdoor_sales_branch_for_date('Rasafa', calendar_case.at_time) = calendar_case.rasafa_start_expected;
  end loop;
  assert public.outdoor_sales_branch_for_date(null, now()) is null;
  assert public.outdoor_sales_branch_for_date('Governorates', now()) is null;
  assert public.outdoor_sales_branch_for_date('Karkh', 'infinity'::timestamptz) is null;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  foreach employee_id in array array_append(array_append(staff_ids, unconfigured_id), admin_id) loop
    insert into auth.users(id, email) values(employee_id, employee_id::text || '@example.invalid');
    update public.profiles set role = 'Outdoor Sales', is_active = true, status = 'Active' where id = employee_id;
  end loop;
  update public.profiles set role = 'Admin' where id = admin_id;
  for employee_index in 1..4 loop
    employee_id := staff_ids[employee_index];
    start_branch := case when employee_index <= 2 then 'Karkh' else 'Rasafa' end;
    update public.profiles set outdoor_rotation_start_branch = start_branch where id = employee_id;
    allowed_branch := public.outdoor_sales_branch_for_date(start_branch, statement_timestamp());
    blocked_branch := case when allowed_branch = 'Karkh' then 'Rasafa' else 'Karkh' end;
    payload := jsonb_build_object(
      'client', jsonb_build_object('clientName', 'Outdoor rotation test', 'mobile', '00000000000', 'clientType', 'individual'),
      'project', jsonb_build_object('address', 'Baghdad', 'structureReadiness', 'ready', 'buildingType', 'villa_house', 'branch', allowed_branch)
    );
    project_id := gen_random_uuid(); operation_id := gen_random_uuid();
    result := public.sync_field_change(operation_id, employee_id, project_id, 'register', payload, now(), null);
    assert result->>'branch' = allowed_branch;
    assert (select p.branch = allowed_branch and p.original_creator_role::text = 'Outdoor Sales'
      from public.projects p where p.id = project_id);
    assert (select u.branch is null from public.profiles u where u.id = employee_id),
      'Monthly rotation must not give Outdoor staff an Indoor employee branch';
    result := public.register_sales_project(employee_id, payload);
    assert (select p.branch = allowed_branch from public.projects p where p.id = (result->>'projectId')::uuid),
      'Online registration must enforce the same current assignment';

    -- Neither old nor future device timestamps can authorize the other branch.
    select count(*) into clients_before from public.clients;
    select count(*) into projects_before from public.projects;
    foreach attempted_at in array array[now(), now() - interval '15 days', now() + interval '15 days'] loop
      begin
        perform public.sync_field_change(gen_random_uuid(), employee_id, gen_random_uuid(), 'register',
          jsonb_set(payload, '{project,branch}', to_jsonb(blocked_branch)), attempted_at, null);
        raise exception using errcode = 'ZX001', message = 'Opposite Baghdad branch accepted';
      exception when sqlstate '22023' then
        assert sqlerrm = 'You can only create projects for your assigned branch or Governorates during this half of the month.';
      end;
    end loop;
    begin
      perform public.register_sales_project(employee_id, jsonb_set(payload, '{project,branch}', to_jsonb(blocked_branch)));
      raise exception using errcode = 'ZX001', message = 'Online opposite branch accepted';
    exception when sqlstate '22023' then
      assert sqlerrm = 'You can only create projects for your assigned branch or Governorates during this half of the month.';
    end;
    assert (select count(*) = clients_before from public.clients), 'Blocked creation must not leave an orphan client';
    assert (select count(*) = projects_before from public.projects), 'Blocked creation must not leave a project';

    select p.client_id into client_id from public.projects p where p.id = project_id;
    begin
      insert into public.projects(client_id, project_number, project_name, created_by, branch)
        values(client_id, 'ROTATION-BLOCK-' || gen_random_uuid(), 'Direct insert', employee_id, blocked_branch);
      raise exception using errcode = 'ZX001', message = 'Direct SQL bypass accepted';
    exception when sqlstate '22023' then
      assert sqlerrm = 'You can only create projects for your assigned branch or Governorates during this half of the month.';
    end;
    begin
      update public.projects set branch = blocked_branch where id = project_id;
      raise exception using errcode = 'ZX001', message = 'Create-then-relabel bypass accepted';
    exception when insufficient_privilege then
      assert sqlerrm = 'The originating project branch cannot be changed.';
    end;

    result := public.sync_field_change(gen_random_uuid(), employee_id, gen_random_uuid(), 'register',
      jsonb_set(payload, '{project}', (payload->'project') || '{"branch":"Governorates","governorate":"البصرة"}'::jsonb), now(), null);
    assert result->>'branch' = 'Governorates' and result->>'governorate' = 'البصرة',
      'All four staff retain Governorates intake';

    if employee_index = 1 then
      original_project_id := project_id; original_operation_id := operation_id; original_payload := payload;
      original_result := public.sync_field_change(operation_id, employee_id, project_id, 'register', payload, now(), null);
    end if;
  end loop;

  -- A rotation change affects only new intake. Previously completed syncs replay
  -- their receipt and existing measurements remain available across the boundary.
  select count(*) into notification_count from public.notifications n where n.entity_id = original_project_id;
  update public.profiles set outdoor_rotation_start_branch = 'Rasafa' where id = staff_ids[1];
  result := public.sync_field_change(original_operation_id, staff_ids[1], original_project_id,
    'register', original_payload, now() + interval '15 days', null);
  assert result = original_result, 'A completed registration retry must survive the monthly switch';
  assert (select count(*) = notification_count from public.notifications n where n.entity_id = original_project_id),
    'A retry must not duplicate notifications';
  perform public.sync_field_change(gen_random_uuid(), staff_ids[1], original_project_id, 'opening',
    jsonb_build_object('id', gen_random_uuid(), 'floor', 'GF', 'room', 'Kitchen', 'width', 120, 'height', 150,
      'structuralType', 'Window', 'openingType', 'Sliding', 'hasArch', false), now(), null);
  assert (select count(*) = 1 from public.openings o where o.project_id = original_project_id),
    'Monthly intake restrictions must not block existing project measurements';

  payload := original_payload;
  begin
    perform public.register_sales_project(unconfigured_id, payload);
    raise exception using errcode = 'ZX001', message = 'Unconfigured Outdoor staff gained Baghdad intake';
  exception when sqlstate '22023' then
    assert sqlerrm = 'Ask Admin to assign your monthly Outdoor Sales rotation before creating a Karkh or Rasafa project.';
  end;
  begin
    perform public.sync_field_change(gen_random_uuid(), staff_ids[1], gen_random_uuid(), 'register',
      payload #- '{project,branch}', now(), null);
    raise exception using errcode = 'ZX001', message = 'Branchless new Outdoor registration accepted';
  exception when sqlstate '22023' then
    assert sqlerrm = 'Choose the project branch: Karkh, Rasafa or Governorates.';
  end;
  result := public.register_sales_project(unconfigured_id,
    jsonb_set(payload, '{project}', (payload->'project') || '{"branch":"Governorates","governorate":"النجف"}'::jsonb));
  assert (select p.branch = 'Governorates' and p.governorate = 'النجف'
    from public.projects p where p.id = (result->>'projectId')::uuid);

  -- Authenticated staff cannot self-assign a different monthly rotation.
  allowed_branch := public.outdoor_sales_branch_for_date('Rasafa', statement_timestamp());
  blocked_branch := case when allowed_branch = 'Karkh' then 'Rasafa' else 'Karkh' end;
  perform set_config('request.jwt.claim.sub', staff_ids[1]::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', staff_ids[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select p.client_id into client_id from public.projects p where p.id = original_project_id;
  begin
    insert into public.projects(client_id, project_number, project_name, created_by, branch,
      sales_engineer_id, original_creator_role, created_at)
    values(client_id, 'ROTATION-SPOOF-' || gen_random_uuid(), 'Spoofed creator', admin_id, blocked_branch,
      staff_ids[1], 'Admin', statement_timestamp() - interval '15 days');
    raise exception using errcode = 'ZX001', message = 'Spoofed project creator bypass accepted';
  exception when insufficient_privilege then
    assert sqlerrm = 'The actor does not match the authenticated user.';
  end;
  begin
    insert into public.projects(client_id, project_number, project_name, created_by, branch,
      original_creator_role, created_at)
    values(client_id, 'ROTATION-DATE-' || gen_random_uuid(), 'Spoofed recording date', staff_ids[1], blocked_branch,
      'Admin', statement_timestamp() - interval '15 days');
    raise exception using errcode = 'ZX001', message = 'Spoofed creation date or original role bypass accepted';
  exception when sqlstate '22023' then
    assert sqlerrm = 'You can only create projects for your assigned branch or Governorates during this half of the month.';
  end;
  begin
    update public.profiles set outdoor_rotation_start_branch = 'Karkh' where id = staff_ids[1];
    raise exception using errcode = 'ZX001', message = 'Self-assigned rotation accepted';
  exception when insufficient_privilege then
    assert sqlerrm = 'Only Admin can assign Outdoor Sales rotations.';
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set outdoor_rotation_start_branch = 'Karkh' where id = staff_ids[1];
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert (select u.outdoor_rotation_start_branch = 'Karkh' from public.profiles u where u.id = staff_ids[1]);

  -- A later role transfer keeps existing Indoor/Manager editing and intake valid.
  payload := jsonb_set(payload, '{project,assignedOutdoorSalesId}', to_jsonb(staff_ids[1]::text));
  update public.profiles set role = 'Indoor Sales', branch = 'Rasafa' where id = staff_ids[1];
  result := public.register_sales_project(staff_ids[1], payload);
  assert (select p.branch = 'Rasafa' and p.original_creator_role::text = 'Indoor Sales'
    from public.projects p where p.id = (result->>'projectId')::uuid);
  update public.profiles set role = 'Sales Manager', branch = 'Karkh' where id = staff_ids[1];
  result := public.register_sales_project(staff_ids[1], payload);
  assert (select p.branch = 'Karkh' and p.original_creator_role::text = 'Sales Manager'
    from public.projects p where p.id = (result->>'projectId')::uuid);

  assert not has_function_privilege('authenticated', 'public.require_outdoor_project_creation_branch(uuid,text)', 'execute');
  assert not has_function_privilege('anon', 'public.require_outdoor_project_creation_branch(uuid,text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.register_sales_project(uuid,jsonb)', 'execute');
  assert not has_function_privilege('authenticated', 'public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)', 'execute');
  raise notice 'PASS: Baghdad calendar boundaries, four staff, online/offline/current-date guards, Governorates, direct-insert and relabel protection, atomic failures, replay safety, existing measurements, self-assignment and role transfers';
end;
$test$;
rollback;
