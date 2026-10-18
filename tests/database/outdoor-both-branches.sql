-- Fixtures and measurements are rolled back by the verification runner.
begin;
do $$
declare
  admin_id uuid;
  indoor uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  hr uuid := gen_random_uuid();
  project_id uuid;
  fixture_ids uuid[] := '{}';
  branch_name text;
  employee public.profiles;
  result jsonb;
begin
  select id into strict admin_id from profiles where role='Admin' and is_active and status='Active' limit 1;
  insert into auth.users(id,email) values
    (indoor,indoor::text||'@example.invalid'),
    (outdoor,outdoor::text||'@example.invalid'),
    (hr,hr::text||'@example.invalid');
  update profiles set role='Indoor Sales',branch='Karkh',full_name='Branch test',
    username='branch.'||replace(id::text,'-',''),is_active=true,status='Active' where id in (indoor,outdoor);
  update profiles set role='HR',is_active=true,status='Active' where id=hr;

  -- A role-only edit (including HR's existing endpoint) clears the former branch.
  select * into employee from profiles where id=outdoor;
  perform public.update_employee_profile(hr,outdoor,employee.updated_at,employee.full_name,employee.username,'Outdoor Sales',true);
  assert (select branch is null from profiles where id=outdoor), 'Role transfers must clear the old branch';
  update profiles set branch='Rasafa' where id=outdoor;
  assert (select branch is null from profiles where id=outdoor), 'Direct writes must not assign Outdoor a branch';
  select * into employee from profiles where id=outdoor;
  result := public.update_employee_profile_with_branch(admin_id,outdoor,employee.updated_at,
    employee.full_name,employee.username,'Outdoor Sales',true,'Karkh');
  assert result ? 'branch' and result->>'branch' is null, 'Old clients must get the normalized branch';

  foreach branch_name in array array['Karkh','Rasafa'] loop
    update profiles set branch=branch_name where id=indoor;
    project_id := gen_random_uuid();
    fixture_ids := array_append(fixture_ids,project_id);
    result := public.sync_field_change(gen_random_uuid(),indoor,project_id,'register',
      jsonb_build_object('client',jsonb_build_object('clientName','Both branches test','mobile','00000000000','clientType','individual'),
        'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
          'structureReadiness','ready','assignedOutdoorSalesId',outdoor)),now(),null);
    assert result->>'branch'=branch_name, 'Project keeps the Indoor creator branch';
    perform public.sync_field_change(gen_random_uuid(),outdoor,project_id,'opening',
      jsonb_build_object('id',gen_random_uuid(),'floor','Ground','room','Kitchen','width',120,'height',150,
        'structuralType','Window','openingType','Sliding'),now(),null);
    perform public.sync_field_change(gen_random_uuid(),outdoor,project_id,'finish','{}'::jsonb,now(),null);
    assert (select sales_status='ready_for_quotation' and branch=branch_name and assigned_outdoor_sales_id=outdoor
      from projects where id=project_id), 'Same Outdoor employee completes measurements for either branch';
  end loop;

  -- Moving the creator to Outdoor does not relabel either existing project.
  select * into employee from profiles where id=indoor;
  perform public.update_employee_profile_with_branch(admin_id,indoor,employee.updated_at,
    employee.full_name,employee.username,'Outdoor Sales',true,'Rasafa');
  assert (select branch is null from profiles where id=indoor);
  assert (select branch='Karkh' from public.projects where id=fixture_ids[1]);
  assert (select branch='Rasafa' from public.projects where id=fixture_ids[2]);

  -- Returning to Indoor requires an explicit branch, never a hidden old value.
  select * into employee from profiles where id=outdoor;
  begin
    perform public.update_employee_profile_with_branch(admin_id,outdoor,employee.updated_at,
      employee.full_name,employee.username,'Indoor Sales',true,null);
    raise exception 'Indoor branch requirement was bypassed';
  exception when sqlstate '22023' then null;
  end;
  assert (select role='Outdoor Sales' and branch is null from profiles where id=outdoor);
  perform public.update_employee_profile_with_branch(admin_id,outdoor,employee.updated_at,
    employee.full_name,employee.username,'Indoor Sales',true,'Rasafa');
  assert (select branch='Rasafa' from profiles where id=outdoor);
  raise notice 'PASS: Outdoor role transfers, stale branch submissions, both-branch measurement assignments, project history, and Indoor reassignment';
end;
$$;
rollback;
