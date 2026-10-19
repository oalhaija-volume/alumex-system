-- Run after both Sales Manager migrations. All fixtures are rolled back.
begin;
do $$
declare
  manager uuid := gen_random_uuid();
  indoor uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid();
  employee public.profiles;
  indoor_permissions boolean[];
  manager_permissions boolean[];
  target_project uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values
    (manager, manager::text || '@example.invalid'),
    (indoor, indoor::text || '@example.invalid'),
    (administrator, administrator::text || '@example.invalid');
  update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active',
    full_name='Access parity test',username='parity.' || replace(id::text,'-','') where id in (manager,indoor);
  select * into employee from public.profiles where id=manager;
  begin
    perform public.update_employee_profile_with_branch(administrator,manager,employee.updated_at,
      employee.full_name,employee.username,'Sales Manager',true,null);
    raise exception using errcode='ZX001',message='Sales Manager bypassed the branch requirement';
  exception when sqlstate '22023' then null;
  end;
  perform public.update_employee_profile_with_branch(administrator,manager,employee.updated_at,
    employee.full_name,employee.username,'Sales Manager',true,'Rasafa');
  assert (select role='Sales Manager' and branch='Rasafa' from public.profiles where id=manager);

  perform set_config('request.jwt.claim.sub',indoor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',indoor,'role','authenticated')::text,true);
  indoor_permissions := array[public.is_sales_manager_or_admin(),public.can_view_sales_prices(),
    public.can_view_finance_values(),public.is_workflow_role()];
  perform set_config('request.jwt.claim.sub',manager::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);
  assert public.current_user_role()='Sales Manager', 'Permission mapping must not change role identity';
  manager_permissions := array[public.is_sales_manager_or_admin(),public.can_view_sales_prices(),
    public.can_view_finance_values(),public.is_workflow_role()];
  assert manager_permissions=indoor_permissions, 'RLS helpers must match Indoor Sales exactly';
  assert not public.is_sales_manager_or_admin(), 'No legacy manager bypass';
  assert not has_function_privilege('authenticated','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean)','EXECUTE');

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.sync_field_change(gen_random_uuid(),manager,target_project,'register',
    jsonb_build_object('client',jsonb_build_object('clientName','Manager CRM test','mobile','00000000000','clientType','individual'),
      'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
        'structureReadiness','not_ready','assignedOutdoorSalesId',manager)),now(),null);
  assert (select original_creator_role='Sales Manager' and follow_up_owner_id=manager and branch='Rasafa'
    from public.projects where id=target_project);
  begin
    perform public.advance_sales_flow(target_project,'accept',0,'{}'::jsonb,manager);
    raise exception using errcode='ZX001',message='Sales Manager gained Operations access';
  exception when sqlstate 'P0001' then assert sqlerrm='Not allowed';
  end;
  begin
    perform public.update_employee_profile(manager,indoor,employee.updated_at,
      'Forged employee','forged.employee','Admin',true);
    raise exception using errcode='ZX001',message='Sales Manager gained employee administration';
  exception when insufficient_privilege then null;
  end;
  assert not exists(select 1 from public.sales_status_transitions
    where ('Indoor Sales'::public.app_role=any(allowed_roles)) <> ('Sales Manager'::public.app_role=any(allowed_roles)));
  perform set_config('request.jwt.claims','{}',true);
end;
$$;
rollback;
