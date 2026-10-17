-- All fixtures and project changes are rolled back.
begin;
do $$
declare
  indoor uuid := gen_random_uuid();
  other_indoor uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  later_id uuid := gen_random_uuid();
  opening_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  result jsonb;
  payload jsonb;
  stamp timestamptz;
begin
  insert into auth.users(id,email) values
    (indoor,indoor::text || '@example.invalid'),
    (other_indoor,other_indoor::text || '@example.invalid'),
    (outdoor,outdoor::text || '@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active'
    where id in (indoor,other_indoor);
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  payload := jsonb_build_object('client',jsonb_build_object('clientName','Self measurement test','mobile','00000000000','clientType','individual'),
    'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,
      'structureReadiness','ready','assignedOutdoorSalesId',indoor));
  result := public.sync_field_change(operation_id,indoor,project_id,'register',payload,now(),null);
  assert result->>'assigned_outdoor_sales_id'=indoor::text, 'Creator must be their own measurement assignee';
  assert result->>'branch'='Karkh', 'Branch attribution must be preserved';
  assert (result->>'assignedToYou')::boolean;
  assert (select created_by=indoor and original_creator_id=indoor and original_creator_role='Indoor Sales'
    from public.projects where id=project_id);
  assert public.sync_field_change(operation_id,indoor,project_id,'register',payload,now(),null)=result,
    'Offline registration retries must be idempotent';

  perform public.sync_field_change(gen_random_uuid(),indoor,project_id,'opening',
    jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,
      'structuralType','Window','openingType','Sliding'),now(),null);
  assert (select created_by=indoor and width=120 and height=150 from public.openings where id=opening_id);
  perform public.sync_field_change(gen_random_uuid(),indoor,project_id,'finish','{}'::jsonb,now(),null);
  assert (select sales_status='ready_for_quotation' from public.projects where id=project_id);

  -- Not-ready projects remain in follow-up, then retain self-assignment when ready.
  payload := jsonb_set(payload,'{project,structureReadiness}','"not_ready"'::jsonb);
  perform public.sync_field_change(gen_random_uuid(),indoor,later_id,'register',payload,now(),null);
  select updated_at into stamp from public.projects where id=later_id;
  perform public.sync_field_change(gen_random_uuid(),indoor,later_id,'ready','{}'::jsonb,now(),stamp);
  assert (select structure_readiness='ready' and assigned_outdoor_sales_id=indoor from public.projects where id=later_id);
  -- Outdoor Sales handoff still works, without changing the original creator.
  select updated_at into stamp from public.projects where id=later_id;
  perform public.sync_field_change(gen_random_uuid(),indoor,later_id,'assign-measurements',
    jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
  assert (select assigned_outdoor_sales_id=outdoor and created_by=indoor from public.projects where id=later_id);

  -- A different Indoor Sales employee is never accepted as a forged self-selection.
  payload := jsonb_set(payload,'{project,assignedOutdoorSalesId}',to_jsonb(other_indoor::text));
  begin
    perform public.sync_field_change(gen_random_uuid(),indoor,gen_random_uuid(),'register',payload,now(),null);
    raise exception using errcode='ZX001',message='Another Indoor Sales employee was accepted';
  exception when sqlstate 'P0001' then
    assert sqlerrm='Choose yourself or an Outdoor Sales employee to collect the initial measurements.';
  end;
  begin
    update public.projects set assigned_outdoor_sales_id=other_indoor where id=later_id;
    raise exception using errcode='ZX001',message='Direct assignment to another Indoor Sales employee was accepted';
  exception when sqlstate 'P0001' then
    assert sqlerrm='Choose yourself or an Outdoor Sales employee to collect the initial measurements.';
  end;
  update public.profiles set is_active=false,status='Inactive' where id=indoor;
  begin
    perform public.sync_field_change(gen_random_uuid(),indoor,gen_random_uuid(),'register',payload,now(),null);
    raise exception using errcode='ZX001',message='Inactive creator was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Sales access required';
  end;
  raise notice 'PASS: Indoor Sales self-registration, branch attribution, opening entry, completion, readiness, Outdoor Sales handoff, and invalid assignee rejection';
end;
$$;
rollback;
