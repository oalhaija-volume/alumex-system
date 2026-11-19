-- Run only against a disposable database after the repository migrations.
-- All fixtures and corrections roll back; no connected production data is used.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare
  indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid();
  other_branch uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
  site uuid:=gen_random_uuid(); foreign_site uuid:=gen_random_uuid(); client uuid;
  window_id uuid:=gen_random_uuid(); curtain_id uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid(); split_id uuid:=gen_random_uuid();
  quote jsonb; proposed jsonb; change jsonb; full_change jsonb; split_change jsonb;
  original_quote jsonb; original_curtain jsonb; original_contract jsonb; rows_before jsonb; previous_flow jsonb;
  flow public.sales_workflows; history_before integer; revisions_before integer; bad jsonb; invalid record;
begin
  insert into auth.users(id,email) values
    (indoor,indoor||'@example.invalid'),(outdoor,outdoor||'@example.invalid'),(manager,manager||'@example.invalid'),
    (other_branch,other_branch||'@example.invalid'),(inactive,inactive||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update public.profiles set role='Outdoor Sales',branch='Karkh',is_active=true,status='Active' where id=outdoor;
  update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=false,status='Inactive' where id=inactive;
  insert into public.clients(client_name,mobile,created_by)
    values('Opening size fixture','00000000000',indoor) returning id into client;
  insert into public.projects(id,client_id,project_name,project_number,created_by,branch,building_type,structure_readiness)
    values(site,client,'Opening size fixture','SIZE-'||site,indoor,'Karkh','commercial_building','ready'),
      (foreign_site,client,'Other size fixture','SIZE-'||foreign_site,indoor,'Karkh','commercial_building','ready');
  insert into public.openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,has_roller_shutter,work_area,notes,curtain_wall_capture)
    values(window_id,site,'OP-'||window_id,'Ground','Kitchen',120,150,4,'Window','Sliding','ready',outdoor,false,true,'internal','Original window note',null),
      (curtain_id,site,'OP-'||curtain_id,'Ground','Entrance',600,350,3,'Curtain Wall',null,'ready',outdoor,true,false,'internal','Original wall note','{"note":"Original curtain wall capture"}'),
      (foreign_id,foreign_site,'OP-'||foreign_id,'Ground','Kitchen',120,150,1,'Window','Sliding','ready',outdoor,false,false,'internal',null,null);
  update public.projects set sales_status='ready_for_quotation',status='Quotation' where id=site;
  select jsonb_build_object('lines',jsonb_agg(jsonb_build_object('opening',to_jsonb(o),'total',100000) order by o.id),
    'additionalItems','[]'::jsonb,'facadeMeasurements','[]'::jsonb,'total',200000,'currency','IQD')
    into quote from public.openings o where o.project_id=site;
  flow:=public.advance_sales_flow(site,'save',0,quote,indoor);
  original_quote:=flow.quotation;

  full_change:=jsonb_build_object('openingId',window_id,'previousWidth',120,'previousHeight',150,'previousQuantity',4,
    'width',130,'height',150,'quantity',4,'reason','  Confirmed corrected width with client  ');
  proposed:=flow.quotation||jsonb_build_object('openingSizeChanges',jsonb_build_array(full_change),
    'lines',(select jsonb_agg(case when line#>>'{opening,id}'=window_id::text
      then jsonb_set(line,'{opening}',line->'opening'||'{"width":130}'::jsonb) else line end)
      from jsonb_array_elements(flow.quotation->'lines') line));
  flow:=public.save_quotation_with_opening_sizes(site,flow.revision,proposed,indoor);
  assert (select width=130 and height=150 and quantity=4 and created_by=outdoor and notes='Original window note'
    and has_roller_shutter and area_sqm=7.8 from public.openings where id=window_id),'Full-group correction lost opening details';
  assert flow.stage='quotation' and flow.quotation->>'version'='2','Size correction did not save a revision';
  assert (select quotation=original_quote from public.quotation_revisions where project_id=site and version=1),'Original quotation was rewritten';
  assert (select previous_width=120 and width=130 and previous_quantity=4 and quantity=4 and source_opening_id=window_id
    and opening_id=window_id and changed_by=indoor and quotation_version=2
    and reason='Confirmed corrected width with client' from public.opening_size_history where project_id=site),'Correction audit is incomplete';
  assert not exists(select 1 from public.quotation_opening_size_write_intents),'Successful correction leaked write intents';

  -- Ordinary writes and ordinary quotation saves cannot bypass the size action.
  begin
    update public.openings set width=140 where id=window_id;
    raise exception using errcode='ZX001',message='Direct quoted-size update accepted';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,
      proposed||jsonb_build_object('lines',(select jsonb_agg(jsonb_set(line,'{opening,width}','140')) from jsonb_array_elements(proposed->'lines') line)),indoor);
    raise exception using errcode='ZX001',message='Unaudited size update accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;

  -- Resize only two of three identical curtain walls; clone media and author.
  select to_jsonb(o) into original_curtain from public.openings o where id=curtain_id;
  split_change:=jsonb_build_object('openingId',curtain_id,'previousWidth',600,'previousHeight',350,'previousQuantity',3,
    'width',620,'height',360,'quantity',2,'splitOpeningId',split_id,'reason','Two walls need the revised size');
  proposed:=flow.quotation||jsonb_build_object('openingSizeChanges',jsonb_build_array(split_change),
    'lines',(select jsonb_agg(case when line#>>'{opening,id}'=curtain_id::text
      then jsonb_set(line,'{opening}',line->'opening'||'{"quantity":1}'::jsonb) else line end)
      from jsonb_array_elements(flow.quotation->'lines') line)
      ||jsonb_build_array(jsonb_build_object('opening',original_curtain||jsonb_build_object('id',split_id,'width',620,'height',360,'quantity',2),'total',100000)),
    'total',300000);
  flow:=public.save_quotation_with_opening_sizes(site,flow.revision,proposed,manager);
  assert (select width=600 and height=350 and quantity=1 and created_by=outdoor and curtain_wall_capture=original_curtain->'curtain_wall_capture'
    from public.openings where id=curtain_id),'Split changed the remaining original wall';
  assert (select width=620 and height=360 and quantity=2 and created_by=outdoor and has_arch and has_curtain_wall_capture
    and notes='Original wall note' and curtain_wall_capture=original_curtain->'curtain_wall_capture'
    from public.openings where id=split_id),'Split did not preserve author, notes and media';
  assert (select sum(quantity)=3 from public.openings where id in(curtain_id,split_id)),'Split did not conserve quantity';
  assert exists(select 1 from public.opening_size_history where project_id=site and opening_id=split_id and source_opening_id=curtain_id
    and previous_quantity=3 and quantity=2 and changed_by=manager and quotation_version=3),'Split audit is incomplete';

  change:=jsonb_build_object('openingId',window_id,'previousWidth',130,'previousHeight',150,'previousQuantity',4,
    'width',140,'height',150,'quantity',4,'reason','Updated site confirmation');
  proposed:=flow.quotation||jsonb_build_object('openingSizeChanges',jsonb_build_array(change),
    'lines',(select jsonb_agg(case when line#>>'{opening,id}'=window_id::text
      then jsonb_set(line,'{opening}',line->'opening'||'{"width":140}'::jsonb) else line end)
      from jsonb_array_elements(flow.quotation->'lines') line));
  select jsonb_agg(to_jsonb(o) order by o.id) into rows_before from public.openings o where project_id=site;
  previous_flow:=to_jsonb(flow);
  select count(*) into history_before from public.opening_size_history where project_id=site;
  select count(*) into revisions_before from public.quotation_revisions where project_id=site;
  for invalid in select * from (values
    ('missing reason',change-'reason'),('blank reason',change||'{"reason":"  "}'::jsonb),
    ('oversize reason',change||jsonb_build_object('reason',repeat('x',501))),
    ('zero width',change||'{"width":0}'::jsonb),('dimension precision',change||'{"height":151.001}'::jsonb),
    ('fractional quantity',change||'{"quantity":1.5}'::jsonb),('oversize quantity',change||'{"quantity":5}'::jsonb),
    ('stale width',change||'{"previousWidth":120}'::jsonb),('stale quantity',change||'{"previousQuantity":3}'::jsonb),
    ('missing split ID',change||'{"quantity":1}'::jsonb),('existing split ID',change||jsonb_build_object('quantity',1,'splitOpeningId',split_id)),
    ('unexpected split ID',change||jsonb_build_object('splitOpeningId',gen_random_uuid())),
    ('unchanged size',change||'{"width":130}'::jsonb),('foreign opening',change||jsonb_build_object('openingId',foreign_id))
  ) cases(label,payload) loop
    begin
      perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed||jsonb_build_object('openingSizeChanges',jsonb_build_array(invalid.payload)),indoor);
      raise exception using errcode='ZX001',message='Invalid correction accepted: '||invalid.label;
    exception when sqlstate '22023' or sqlstate 'P0001' then null; end;
    assert (select jsonb_agg(to_jsonb(o) order by o.id)=rows_before from public.openings o where project_id=site),'Rejected correction changed measurements';
    assert (select to_jsonb(f)=previous_flow from public.sales_workflows f where project_id=site),'Rejected correction changed quotation';
    assert (select count(*)=history_before from public.opening_size_history where project_id=site),'Rejected correction created audit';
    assert (select count(*)=revisions_before from public.quotation_revisions where project_id=site),'Rejected correction created revision history';
    assert not exists(select 1 from public.quotation_opening_size_write_intents),'Rejected correction leaked write intents';
  end loop;

  -- Failure after the measured writes must still roll back every row and audit.
  for bad in select payload from (values
    (proposed||'{"total":0}'::jsonb),
    (proposed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(window_id))),
    (proposed||jsonb_build_object('openingSizeChanges',jsonb_build_array(change,change))),
    (proposed||jsonb_build_object('lines',(select jsonb_agg(line) from jsonb_array_elements(proposed->'lines') line where line#>>'{opening,id}'<>window_id::text)))
  ) cases(payload) loop
    begin
      perform public.save_quotation_with_opening_sizes(site,flow.revision,bad,indoor);
      raise exception using errcode='ZX001',message='Invalid complete quotation accepted';
    exception when sqlstate '22023' or sqlstate 'P0001' then null; end;
    assert (select jsonb_agg(to_jsonb(o) order by o.id)=rows_before from public.openings o where project_id=site),'Failed save did not roll back measured writes';
    assert (select count(*)=history_before from public.opening_size_history where project_id=site),'Failed save created audit';
    assert not exists(select 1 from public.quotation_opening_size_write_intents),'Failed save leaked write intents';
  end loop;
  begin
    perform public.save_quotation_with_opening_sizes(site,flow.revision-1,proposed,indoor);
    raise exception using errcode='ZX001',message='Stale quotation accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.'; end;
  begin
    perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed,outdoor);
    raise exception using errcode='ZX001',message='Outdoor correction accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed,other_branch);
    raise exception using errcode='ZX001',message='Other-office correction accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed,inactive);
    raise exception using errcode='ZX001',message='Inactive correction accepted';
  exception when insufficient_privilege then null; end;

  -- An approved quotation/unsigned contract becomes an unapproved revision.
  flow:=public.advance_sales_flow(site,'approve',flow.revision,'{}',indoor);
  update public.sales_workflows set stage='contract',contract='{"number":"SIZE-CONTRACT-FIXTURE"}' where project_id=site;
  update public.projects set sales_status='contract_generated' where id=site;
  select * into flow from public.sales_workflows where project_id=site;
  original_contract:=flow.contract;
  begin
    perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed,indoor);
    raise exception using errcode='ZX001',message='Unconfirmed unsigned-contract replacement accepted';
  exception when sqlstate 'P0001' then assert sqlerrm like 'Confirm that this revision replaces the unsigned contract%'; end;
  flow:=public.save_quotation_with_opening_sizes(site,flow.revision,proposed||'{"replaceUnsignedContract":true}'::jsonb,indoor);
  assert flow.stage='quotation' and flow.contract is null and flow.approved_at is null and flow.approved_by is null,'Correction retained stale client approval';
  assert exists(select 1 from public.quotation_revisions where project_id=site and contract=original_contract),'Previous unsigned contract was not archived';

  -- Evidence/acceptance flags protect inconsistent legacy rows as well.
  change:=change||'{"previousWidth":140,"width":145}'::jsonb;
  proposed:=flow.quotation||jsonb_build_object('openingSizeChanges',jsonb_build_array(change));
  for invalid in select * from (values
    ('signed_at','"2026-11-19T00:00:00Z"'::jsonb),('evidence','{"method":"hard_copy"}'::jsonb),
    ('accepted_at','"2026-11-19T00:00:00Z"'::jsonb),('accepted_by',to_jsonb(indoor))
  ) cases(column_name,value) loop
    execute format('update public.sales_workflows set %I=($1->>''value'')::%s where project_id=$2',invalid.column_name,
      case when invalid.column_name='evidence' then 'jsonb' when invalid.column_name='accepted_by' then 'uuid' else 'timestamptz' end)
      using jsonb_build_object('value',invalid.value),site;
    begin
      perform public.save_quotation_with_opening_sizes(site,flow.revision,proposed,indoor);
      raise exception using errcode='ZX001',message='Signed/evidenced/accepted correction accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='Signed contracts cannot be changed.'; end;
    execute format('update public.sales_workflows set %I=null where project_id=$1',invalid.column_name) using site;
  end loop;

  assert not has_function_privilege('authenticated','public.save_quotation_with_opening_sizes(uuid,integer,jsonb,uuid)','execute');
  assert not has_function_privilege('anon','public.save_quotation_with_opening_sizes(uuid,integer,jsonb,uuid)','execute');
  assert has_function_privilege('service_role','public.save_quotation_with_opening_sizes(uuid,integer,jsonb,uuid)','execute');
  assert not has_table_privilege('service_role','public.opening_size_history','insert,update,delete');
  assert not has_table_privilege('service_role','public.quotation_opening_size_write_intents','select,insert,update,delete');
  assert not has_table_privilege('authenticated','public.opening_size_history','select,insert,update,delete');
  raise notice 'PASS: atomic opening-size corrections, split quantity/media, immutable audit, revisions, access, rollback and signing locks';
end;
$$;
rollback;
