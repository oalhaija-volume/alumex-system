-- All fixtures and corrections are rolled back. Never run against live projects.
begin;
do $$
declare
  indoor uuid := gen_random_uuid();
  other_branch uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid();
  outdoor uuid := gen_random_uuid();
  operations uuid := gen_random_uuid();
  inactive uuid := gen_random_uuid();
  client uuid;
  target uuid := gen_random_uuid();
  opening_id uuid := gen_random_uuid();
  quotation jsonb;
  previous_flow public.sales_workflows;
  current_flow public.sales_workflows;
  previous_project jsonb;
  previous_openings jsonb;
  previous_history jsonb;
  initial_contract jsonb;
  terms jsonb := '[{"title":"Residential payment terms","text":"Canonical residential terms from the server."}]'::jsonb;
  payload jsonb;
  invalid jsonb;
  field_name text;
  stage_name text;
  employee uuid;
  expected_history integer := 1;
begin
  insert into auth.users(id,email) values
    (indoor,indoor::text||'@example.invalid'),(other_branch,other_branch::text||'@example.invalid'),
    (manager,manager::text||'@example.invalid'),(administrator,administrator::text||'@example.invalid'),
    (outdoor,outdoor::text||'@example.invalid'),(operations,operations::text||'@example.invalid'),
    (inactive,inactive::text||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
  update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  update public.profiles set role='Operations Manager',is_active=true,status='Active' where id=operations;
  update public.profiles set role='Admin',is_active=false,status='Inactive' where id=inactive;
  insert into public.clients(client_name,mobile,created_by)
    values('Contract correction fixture','00000000000',indoor) returning id into client;
  insert into public.projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,
    branch,building_type,structure_readiness,sales_status,status)
    values(target,client,'Contract correction fixture','TEST-'||target::text,indoor,indoor,
      'Karkh','residential_building','ready','ready_for_quotation','Quotation');
  quotation := jsonb_build_object('total',25710534,'subtotal',25710534,'branch','Karkh',
    'facadeMeasurements','[]'::jsonb,'additionalItems','[]'::jsonb,
    'lines',jsonb_build_array(jsonb_build_object('total',25710534,'opening',jsonb_build_object(
      'id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'quantity',1,
      'opening_type','Window','opening_direction','Sliding','has_arch',false,'has_roller_shutter',false))));
  -- Build the real four-step workflow used by the affected unsigned contract:
  -- quotation v1, quotation v2, client approval, generated commercial contract.
  current_flow := public.advance_sales_flow(target,'save',0,quotation,indoor);
  current_flow := public.advance_sales_flow(target,'save',1,quotation,indoor);
  current_flow := public.advance_sales_flow(target,'approve',2,'{}'::jsonb,indoor);
  current_flow := public.advance_sales_flow(target,'contract',3,jsonb_build_object(
    'number','CT-TEST-'||target::text,'createdAt','2026-11-02T12:00:00Z','createdBy',indoor,'branch','Karkh',
    'client',jsonb_build_object('name','Fixture client','mobile','00000000000','client_type','individual'),
    'project',jsonb_build_object('name','Fixture project','number','TEST-'||target::text,'address','Baghdad','branch','Karkh'),
    'template','commercial','terms',jsonb_build_array(jsonb_build_object('title','Commercial terms','text','Original commercial terms.'))),indoor);
  assert current_flow.revision=4 and current_flow.stage='contract' and current_flow.quotation->>'version'='2';
  previous_flow := current_flow; initial_contract := current_flow.contract;
  select to_jsonb(p) into previous_project from public.projects p where id=target;
  select jsonb_agg(to_jsonb(o) order by o.id) into previous_openings from public.openings o where o.project_id=target;
  select jsonb_agg(to_jsonb(r) order by version) into previous_history from public.quotation_revisions r where r.project_id=target;

  -- Extra client-provided metadata/amounts are ignored. Only the selected template
  -- and canonical terms may change in the existing contract snapshot.
  payload := jsonb_build_object('template','residential','terms',terms,'number','FORGED',
    'createdAt','2099-01-01','createdBy',outdoor,'branch','Rasafa',
    'quotation',jsonb_build_object('version',99,'total',1),'evidence',jsonb_build_object('method','upload','path','forged'));
  current_flow := public.advance_sales_flow(target,'change-contract-template',4,payload,indoor);
  assert current_flow.revision=5 and current_flow.stage='contract';
  assert current_flow.contract->>'template'='residential' and current_flow.contract->'terms'=terms;
  assert current_flow.contract-ARRAY['template','terms']=initial_contract-ARRAY['template','terms'],
    'Contract number/date/creator/parties/branch/quotation/approval changed';
  assert current_flow.quotation=previous_flow.quotation and current_flow.approved_at=previous_flow.approved_at
    and current_flow.approved_by=previous_flow.approved_by and current_flow.signed_at is null
    and current_flow.evidence is null and current_flow.accepted_at is null and current_flow.accepted_by is null;
  assert (select count(*)=1 from public.contract_template_corrections h where h.project_id=target);
  assert (select previous_contract=initial_contract and replacement_contract=current_flow.contract
    and corrected_by=indoor and workflow_revision=5 and corrected_at is not null
    from public.contract_template_corrections h where h.project_id=target);
  assert (select to_jsonb(p)=previous_project from public.projects p where id=target), 'Project state was changed';
  assert (select jsonb_agg(to_jsonb(o) order by o.id)=previous_openings from public.openings o where o.project_id=target), 'Openings were changed';
  assert (select jsonb_agg(to_jsonb(r) order by version)=previous_history from public.quotation_revisions r where r.project_id=target), 'Quotation history was changed';
  previous_flow := current_flow;

  begin
    perform public.advance_sales_flow(target,'change-contract-template',5,payload,indoor);
    raise exception using errcode='ZX001',message='The existing template was accepted as a correction';
  exception when sqlstate '22023' then assert sqlerrm='Choose a different contract type.';
  end;
  begin
    perform public.advance_sales_flow(target,'change-contract-template',4,jsonb_set(payload,'{template}','"commercial"'::jsonb),indoor);
    raise exception using errcode='ZX001',message='A stale correction was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.';
  end;
  for invalid in select value from jsonb_array_elements('[null,"corporate","",123,{},[]]'::jsonb) loop
    begin
      perform public.advance_sales_flow(target,'change-contract-template',5,jsonb_set(payload,'{template}',invalid),indoor);
      raise exception using errcode='ZX001',message='Invalid template was accepted';
    exception when sqlstate '22023' then assert sqlerrm='Choose the residential or commercial contract template.';
    end;
  end loop;
  for invalid in select value from jsonb_array_elements('[null,{},"terms",[],[null],["text"],[{}],[{"title":"","text":"valid"}],[{"title":"valid","text":"  "}],[{"title":12,"text":"valid"}],[{"title":"valid","text":false}]]'::jsonb) loop
    begin
      perform public.advance_sales_flow(target,'change-contract-template',5,
        jsonb_set(jsonb_set(payload,'{template}','"commercial"'::jsonb),'{terms}',invalid),indoor);
      raise exception using errcode='ZX001',message='Invalid terms were accepted';
    exception when sqlstate '22023' then assert sqlerrm='Contract template terms are invalid.';
    end;
  end loop;
  assert (select to_jsonb(f)=to_jsonb(previous_flow) from public.sales_workflows f where project_id=target);
  assert (select count(*)=expected_history from public.contract_template_corrections h where h.project_id=target),
    'Rejected corrections left history rows';

  -- Two submissions with the same revision cannot both replace the document.
  current_flow := public.advance_sales_flow(target,'change-contract-template',5,
    jsonb_set(payload,'{template}','"commercial"'::jsonb),indoor);
  expected_history := expected_history+1;
  begin
    perform public.advance_sales_flow(target,'change-contract-template',5,payload,indoor);
    raise exception using errcode='ZX001',message='Two corrections accepted the same workflow revision';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.';
  end;
  assert (select count(*)=expected_history from public.contract_template_corrections h where h.project_id=target);

  -- Existing employee-role and branch guards still apply before the new action.
  foreach employee in array array[outdoor,operations] loop
    begin
      perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,employee);
      raise exception using errcode='ZX001',message='An unauthorized employee changed contract terms';
    exception when sqlstate '42501' then
      assert sqlerrm='Quotations and contracts are handled by Indoor Sales and company leadership.';
    end;
  end loop;
  begin
    perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,other_branch);
    raise exception using errcode='ZX001',message='A different Indoor branch changed the contract';
  exception when sqlstate '42501' then assert sqlerrm='Project is not available to this employee';
  end;
  begin
    perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,inactive);
    raise exception using errcode='ZX001',message='An inactive employee changed contract terms';
  exception when sqlstate 'P0001' then assert sqlerrm='Inactive employee';
  end;

  foreach stage_name in array array['requested','submitted'] loop
    update public.projects set additional_openings_state=stage_name where id=target;
    begin
      perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='Outstanding measurements were bypassed';
    exception when sqlstate 'P0001' then
      assert sqlerrm='Complete the additional measurements and save a quotation revision before continuing.';
    end;
  end loop;
  update public.projects set additional_openings_state=null where id=target;
  foreach stage_name in array array['cancelled','lost'] loop
    update public.projects set sales_status=stage_name where id=target;
    begin
      perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='A closed project contract was changed';
    exception when sqlstate 'P0001' then
      assert sqlerrm='This project is closed. Its quotation and contract history is read-only.';
    end;
  end loop;
  update public.projects set sales_status='contract_generated' where id=target;

  -- Protect executed documents, even if a partially inconsistent workflow still
  -- says "contract". Corrections never discard evidence or operational acceptance.
  foreach field_name in array array['signed_at','evidence','accepted_at','accepted_by'] loop
    if field_name='signed_at' then update public.sales_workflows set signed_at=now() where project_id=target;
    elsif field_name='evidence' then update public.sales_workflows set evidence='{"method":"upload","path":"retained/signed.pdf"}'::jsonb where project_id=target;
    elsif field_name='accepted_at' then update public.sales_workflows set accepted_at=now() where project_id=target;
    else update public.sales_workflows set accepted_by=administrator where project_id=target; end if;
    begin
      perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='An executed contract was changed';
    exception when sqlstate '22023' then
      assert sqlerrm='Only an unsigned generated contract can have its type changed.';
    end;
    update public.sales_workflows set signed_at=null,evidence=null,accepted_at=null,accepted_by=null where project_id=target;
  end loop;
  foreach stage_name in array array['quotation','approved','signed','operations'] loop
    update public.sales_workflows set stage=stage_name where project_id=target;
    begin
      perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='An ineligible workflow stage changed contract terms';
    exception when sqlstate '22023' then
      assert sqlerrm='Only an unsigned generated contract can have its type changed.';
    end;
  end loop;
  update public.sales_workflows set stage='contract' where project_id=target;

  -- Sales Manager keeps its actual audit identity; Admin follows the same narrow
  -- mutation and neither correction invents another quotation version/history row.
  foreach employee in array array[manager,administrator] loop
    payload := jsonb_set(payload,'{template}',to_jsonb(case when current_flow.contract->>'template'='commercial' then 'residential' else 'commercial' end));
    current_flow := public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,employee);
    expected_history := expected_history+1;
    assert (select corrected_by=employee from public.contract_template_corrections h where h.project_id=target and workflow_revision=current_flow.revision);
  end loop;
  assert current_flow.quotation=previous_flow.quotation and current_flow.contract->'quotation'=initial_contract->'quotation';
  assert current_flow.approved_by=indoor and current_flow.approved_at=previous_flow.approved_at;
  assert (select count(*)=expected_history from public.contract_template_corrections h where h.project_id=target);
  assert (select jsonb_agg(to_jsonb(r) order by version)=previous_history from public.quotation_revisions r where r.project_id=target);
  begin
    update public.openings set width=121 where id=opening_id;
    raise exception using errcode='ZX001',message='Changing a contract template unlocked quoted measurements';
  exception when sqlstate 'P0001' then assert sqlerrm='Add new openings through a quotation revision';
  end;

  -- Force a failure after the history INSERT but before the workflow UPDATE can
  -- complete. The subtransaction must roll back both sides of the correction.
  execute $ddl$create function pg_temp.reject_contract_template_test_update() returns trigger
    language plpgsql as $test_failure$begin
      raise exception using errcode='ZT001',message='Injected workflow update failure';
    end;$test_failure$;$ddl$;
  execute 'create trigger contract_template_test_update_failure before update of contract on public.sales_workflows for each row execute function pg_temp.reject_contract_template_test_update()';
  previous_flow := current_flow;
  payload := jsonb_set(payload,'{template}',to_jsonb(case when current_flow.contract->>'template'='commercial' then 'residential' else 'commercial' end));
  begin
    perform public.advance_sales_flow(target,'change-contract-template',current_flow.revision,payload,indoor);
    raise exception using errcode='ZX001',message='Injected late workflow failure did not run';
  exception when sqlstate 'ZT001' then assert sqlerrm='Injected workflow update failure';
  end;
  assert (select to_jsonb(f)=to_jsonb(previous_flow) from public.sales_workflows f where project_id=target),
    'Failed correction changed the current workflow';
  assert (select count(*)=expected_history from public.contract_template_corrections h where h.project_id=target),
    'A late workflow failure retained a partial history snapshot';
  assert not has_table_privilege('authenticated','public.contract_template_corrections','SELECT');
  assert not has_table_privilege('anon','public.contract_template_corrections','SELECT');
  assert has_table_privilege('service_role','public.contract_template_corrections','SELECT');
  assert not has_table_privilege('service_role','public.contract_template_corrections','INSERT');
  assert not has_table_privilege('service_role','public.contract_template_corrections','UPDATE');
  assert not has_table_privilege('service_role','public.contract_template_corrections','DELETE');
  assert not has_function_privilege('authenticated','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','EXECUTE');
  raise notice 'PASS: unsigned contract template correction, exact history, unchanged quotation/parties/approval, repeated correction, revision race, invalid payloads, roles/branches/measurement/closed/executed guards';
end;
$$;
rollback;
