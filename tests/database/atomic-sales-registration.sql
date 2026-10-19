begin;
do $$
declare
  actor uuid := gen_random_uuid();
  other_indoor uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  employee_role text;
  readiness text;
  payload jsonb;
  result jsonb;
  project public.projects;
  client public.clients;
  clients_before bigint;
begin
  assert not has_function_privilege('anon','public.register_sales_project(uuid,jsonb)','execute');
  assert not has_function_privilege('authenticated','public.register_sales_project(uuid,jsonb)','execute');
  assert has_function_privilege('service_role','public.register_sales_project(uuid,jsonb)','execute');
  insert into auth.users(id,email) values
    (actor,actor::text||'@example.invalid'),
    (other_indoor,other_indoor::text||'@example.invalid'),
    (outdoor,outdoor::text||'@example.invalid');
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_indoor;
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  foreach employee_role in array array['Admin','Indoor Sales','Sales Manager','Outdoor Sales'] loop
    update profiles set role=employee_role::public.app_role,branch=case when employee_role in ('Indoor Sales','Sales Manager') then 'Karkh' else null end,is_active=true,status='Active' where id=actor;
    foreach readiness in array array['ready','not_ready'] loop
      payload:=jsonb_build_object('client',jsonb_build_object('clientName','Atomic registration test','mobile','00000000000','clientType','company'),
        'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
          'buildingType','villa_house','structureReadiness',readiness,'readinessNote',case when readiness='not_ready' then 'Unfinished walls' end,
          'assignedOutdoorSalesId',case when employee_role in ('Indoor Sales','Sales Manager') then actor else outdoor end));
      result:=public.register_sales_project(actor,payload);
      select * into strict project from projects where id=(result->>'projectId')::uuid;
      select * into strict client from clients where id=(result->>'clientId')::uuid;
      assert project.client_id=client.id;
      assert project.project_number=result->>'projectNumber';
      assert project.status='Draft' and project.sales_status='new_lead';
      assert project.created_by=actor and project.original_creator_id=actor and project.original_creator_role::text=employee_role;
      assert project.structure_readiness=readiness and project.building_type='villa_house';
      assert client.company_name='Atomic registration test' and client.created_by=actor;
      if employee_role in ('Indoor Sales','Sales Manager') then
        assert project.branch='Karkh' and project.assigned_outdoor_sales_id=actor;
      end if;
    end loop;
  end loop;
  update profiles set role='Indoor Sales',branch='Karkh' where id=actor;
  select count(*) into clients_before from clients;
  payload:=jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(other_indoor::text));
  begin
    perform public.register_sales_project(actor,payload);
    raise exception using errcode='ZX001',message='Invalid assignment accepted';
  exception when sqlstate 'P0001' then
    assert sqlerrm='Choose yourself or an Outdoor Sales employee to collect the initial measurements.';
  end;
  assert (select count(*) from clients)=clients_before,'Failed project must not leave an orphan client';
  update profiles set is_active=false,status='Inactive' where id=actor;
  begin
    perform public.register_sales_project(actor,payload);
    raise exception using errcode='ZX001',message='Inactive creator accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Sales access required';
  end;
end;
$$;
rollback;
