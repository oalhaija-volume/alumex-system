-- Disposable database only. All fixtures, signatures and triggers are rolled back.
begin;

create function pg_temp.hard_copy_contract_fixture(p_client uuid,p_actor uuid) returns uuid
language plpgsql as $$
declare target uuid:=gen_random_uuid(); flow public.sales_workflows;
begin
  insert into public.projects(id,client_id,project_name,project_number,created_by,branch,
    structure_readiness,sales_status,status)
  values(target,p_client,'Hard copy signature fixture','PAPER-'||target,p_actor,'Karkh',
    'ready','ready_for_quotation','Quotation');
  flow:=public.advance_sales_flow(target,'save',0,
    '{"lines":[],"additionalItems":[{"item":{"id":"fixture-product","name":"Installation","quantity":1,"rate":100000},"total":100000}],"total":100000,"subtotal":100000,"branch":"Karkh"}',p_actor);
  flow:=public.advance_sales_flow(target,'approve',flow.revision,'{}',p_actor);
  flow:=public.advance_sales_flow(target,'contract',flow.revision,
    '{"template":"residential","number":"PAPER-FIXTURE","terms":[]}',p_actor);
  return target;
end;
$$;

do $$
declare
  indoor uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid();
  other_branch uuid:=gen_random_uuid(); operations uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
  client uuid; target uuid; regression_target uuid; failure_target uuid; employee uuid;
  flow public.sales_workflows; original_flow public.sales_workflows; original_project jsonb;
  payload jsonb:='{"method":"hard_copy","signer":"Paper signer","confirmed":true}';
  invalid jsonb; field_name text; state_name text; method_name text;
begin
  insert into auth.users(id,email) values
    (indoor,indoor||'@example.invalid'),(manager,manager||'@example.invalid'),
    (outdoor,outdoor||'@example.invalid'),(other_branch,other_branch||'@example.invalid'),
    (operations,operations||'@example.invalid'),(inactive,inactive||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
  update public.profiles set role='Operations Manager',is_active=true,status='Active' where id=operations;
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=false,status='Inactive' where id=inactive;
  insert into public.clients(client_name,mobile,created_by)
    values('Hard copy signature fixture','00000000000',indoor) returning id into client;
  target:=pg_temp.hard_copy_contract_fixture(client,indoor);
  select * into original_flow from public.sales_workflows where project_id=target;
  select to_jsonb(p) into original_project from public.projects p where id=target;

  -- Paper confirmation cannot waive the attestation or signer identity.
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    payload-'confirmed',payload||'{"confirmed":false}',payload||'{"confirmed":"true"}',
    payload||'{"confirmed":null}',payload-'signer',payload||'{"signer":"   "}',
    payload||'{"signer":42}',payload||'{"signer":null}',
    payload||jsonb_build_object('signer',repeat('x',151)),payload||'{"method":"unknown"}'
  )) loop
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,invalid,indoor);
      raise exception using errcode='ZX001',message='Invalid hard copy attestation was accepted';
    exception when sqlstate '22023' or sqlstate 'P0001' then null; end;
    assert (select to_jsonb(f)=to_jsonb(original_flow) from public.sales_workflows f where project_id=target);
    assert (select to_jsonb(p)=original_project from public.projects p where id=target);
  end loop;
  begin
    perform public.advance_sales_flow(target,'sign',original_flow.revision-1,payload,indoor);
    raise exception using errcode='ZX001',message='A stale hard copy attestation was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.'; end;
  foreach employee in array array[outdoor,operations,other_branch,inactive] loop
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,employee);
      raise exception using errcode='ZX001',message='Unauthorized employee recorded a paper signature';
    exception when insufficient_privilege then null;
      when sqlstate 'P0001' then assert sqlerrm='Inactive employee'; end;
  end loop;

  -- Outstanding measurements, closed projects and ungenerated contracts remain locked.
  foreach state_name in array array['requested','submitted'] loop
    update public.projects set additional_openings_state=state_name where id=target;
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='Paper confirmation bypassed outstanding measurements';
    exception when sqlstate 'P0001' then
      assert sqlerrm='Complete the additional measurements and save a quotation revision before continuing.'; end;
  end loop;
  update public.projects set additional_openings_state=null where id=target;
  foreach state_name in array array['cancelled','lost','closed'] loop
    update public.projects set sales_status=state_name where id=target;
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='A closed project accepted paper confirmation';
    exception when sqlstate 'P0001' then
      assert sqlerrm='This project is closed. Its quotation and contract history is read-only.'; end;
  end loop;
  update public.projects set sales_status='quotation_approved' where id=target;
  begin
    perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
    raise exception using errcode='ZX001',message='Paper confirmation bypassed the generated contract status';
  exception when sqlstate '22023' then assert sqlerrm='Generate the contract first'; end;
  update public.projects set sales_status='contract_generated' where id=target;
  update public.sales_workflows set contract=null where project_id=target;
  begin
    perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
    raise exception using errcode='ZX001',message='Paper confirmation accepted a missing contract snapshot';
  exception when sqlstate '22023' then assert sqlerrm='Generate the contract first'; end;
  update public.sales_workflows set contract=original_flow.contract where project_id=target;
  foreach state_name in array array['quotation','approved','signed','operations'] loop
    update public.sales_workflows set stage=state_name where project_id=target;
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='Paper confirmation accepted an ineligible workflow stage';
    exception when sqlstate 'P0001' then assert sqlerrm='Generate the contract first'; end;
  end loop;
  update public.sales_workflows set stage='contract' where project_id=target;

  -- Partially inconsistent legacy rows must never lose saved signature or acceptance evidence.
  foreach field_name in array array['signed_at','evidence','accepted_at','accepted_by'] loop
    if field_name='signed_at' then update public.sales_workflows set signed_at=now() where project_id=target;
    elsif field_name='evidence' then update public.sales_workflows set evidence='{"method":"upload","path":"retained.pdf"}' where project_id=target;
    elsif field_name='accepted_at' then update public.sales_workflows set accepted_at=now() where project_id=target;
    else update public.sales_workflows set accepted_by=operations where project_id=target; end if;
    begin
      perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
      raise exception using errcode='ZX001',message='Paper confirmation overwrote executed contract evidence';
    exception when sqlstate 'P0001' then assert sqlerrm='Signed contracts cannot be changed.'; end;
    update public.sales_workflows set signed_at=null,evidence=null,accepted_at=null,accepted_by=null where project_id=target;
  end loop;

  -- Unknown attachment/audit fields cannot manufacture evidence or forge the recorder.
  flow:=public.advance_sales_flow(target,'sign',original_flow.revision,payload||jsonb_build_object(
    'signer','  Paper signer  ','path','invented.pdf','signature','invented-signature','recordedBy',outdoor),indoor);
  assert flow.stage='signed' and flow.revision=original_flow.revision+1 and flow.signed_at is not null;
  assert flow.evidence=jsonb_build_object('method','hard_copy','signer','Paper signer','confirmed',true,'recordedBy',indoor);
  assert flow.quotation=original_flow.quotation and flow.contract=original_flow.contract;
  assert (select sales_status='transferred_to_operations' and status='Contract' from public.projects where id=target);
  begin
    perform public.advance_sales_flow(target,'sign',original_flow.revision,payload,indoor);
    raise exception using errcode='ZX001',message='The same revision recorded a second signature';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.'; end;
  begin
    perform public.advance_sales_flow(target,'save',flow.revision,original_flow.quotation,indoor);
    raise exception using errcode='ZX001',message='A paper-signed contract quotation was revised';
  exception when sqlstate 'P0001' then assert sqlerrm='Signed contracts cannot be changed.'; end;
  flow:=public.advance_sales_flow(target,'accept',flow.revision,'{}',operations);
  assert flow.stage='operations' and flow.accepted_by=operations and flow.accepted_at is not null;
  assert flow.evidence->>'method'='hard_copy';
  assert (select status='Production' from public.projects where id=target);

  -- Uploads, digital signatures and Sales Manager permissions keep their existing behavior.
  foreach method_name in array array['digital','upload','hard_copy'] loop
    regression_target:=pg_temp.hard_copy_contract_fixture(client,indoor);
    select * into flow from public.sales_workflows where project_id=regression_target;
    flow:=public.advance_sales_flow(regression_target,'sign',flow.revision,jsonb_build_object(
      'method',method_name,'signer','Regression signer','signature','stored-signature','path','stored.pdf','confirmed',true),manager);
    assert flow.stage='signed' and flow.evidence->>'method'=method_name and flow.evidence->>'recordedBy'=manager::text;
    if method_name='digital' then assert flow.evidence->>'signature'='stored-signature'; end if;
    if method_name='upload' then assert flow.evidence->>'path'='stored.pdf'; end if;
  end loop;

  -- A failure while handing off must roll back the earlier evidence UPDATE too.
  failure_target:=pg_temp.hard_copy_contract_fixture(client,indoor);
  select * into original_flow from public.sales_workflows where project_id=failure_target;
  execute $ddl$create function pg_temp.reject_paper_handoff() returns trigger language plpgsql as
    $failure$begin raise exception using errcode='ZT001',message='Injected paper handoff failure'; end;$failure$;$ddl$;
  execute 'create trigger paper_handoff_failure before update on public.projects for each row execute function pg_temp.reject_paper_handoff()';
  begin
    perform public.advance_sales_flow(failure_target,'sign',original_flow.revision,payload,indoor);
    raise exception using errcode='ZX001',message='The injected handoff failure did not run';
  exception when sqlstate 'ZT001' then assert sqlerrm='Injected paper handoff failure'; end;
  assert (select to_jsonb(f)=to_jsonb(original_flow) from public.sales_workflows f where project_id=failure_target);
  assert (select sales_status='contract_generated' from public.projects where id=failure_target);
  assert not has_function_privilege('authenticated','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','execute');
  assert not has_function_privilege('anon','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','execute');
  assert has_function_privilege('service_role','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','execute');
  raise notice 'PASS: paper confirmation, explicit attestation, signer validation, branch/role/state/revision locks, trusted recorder, atomic Operations handoff, digital/upload regression';
end;
$$;

rollback;
