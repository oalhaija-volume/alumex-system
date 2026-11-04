-- Disposable database only. Original measurements, media and history stay intact.
begin;
do $$
declare
  indoor uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_branch uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
  site uuid:=gen_random_uuid(); foreign_site uuid:=gen_random_uuid(); legacy_site uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid(); client uuid;
  window_id uuid:=gen_random_uuid(); curtain_id uuid:=gen_random_uuid(); louver_id uuid:=gen_random_uuid(); skylight_id uuid:=gen_random_uuid(); facade_id uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid(); added_id uuid:=gen_random_uuid();
  quote jsonb; removed jsonb; proposed jsonb; original_rows jsonb; rows_before jsonb; old_quote jsonb; old_contract jsonb; history_before integer;
  flow public.sales_workflows; previous_flow public.sales_workflows; invalid record;
begin
  insert into auth.users(id,email) values
    (indoor,indoor||'@example.invalid'),(manager,manager||'@example.invalid'),(outdoor,outdoor||'@example.invalid'),
    (other_branch,other_branch||'@example.invalid'),(inactive,inactive||'@example.invalid');
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=false,status='Inactive' where id=inactive;
  insert into clients(client_name,mobile,created_by) values('Quotation removal fixture','00000000000',indoor) returning id into client;
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,branch,building_type)
    values(site,client,'Quote removal fixture','REM-'||site,indoor,outdoor,'Karkh','commercial_building'),
      (foreign_site,client,'Other quote fixture','REM-'||foreign_site,indoor,outdoor,'Karkh','commercial_building');
  insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,work_area,facade_number,curtain_wall_capture,skylight_capture)
    values(window_id,site,'OP-'||window_id,'GF','Kitchen',120,150,2,'Window','Sliding','ready',outdoor,false,'internal',null,null,null),
      (curtain_id,site,'OP-'||curtain_id,'GF','Entrance',630,360,1,'Curtain Wall',null,'ready',outdoor,true,'internal',null,'{"note":"Keep the original arch and site photo","photo":"original-photo"}',null),
      (louver_id,site,'OP-'||louver_id,'F1','Office',100,100,1,'Louver','Hinged','ready',outdoor,false,'internal',null,null,null),
      (skylight_id,site,'OP-'||skylight_id,'Roof','Office',100,100,1,'Skylight',null,'ready',outdoor,false,'internal',null,null,'{"drawing":"original-drawing","sections":[]}'),
      (facade_id,site,'OP-'||facade_id,'Whole building','Facade 1',1650,390,1,'Facade',null,'ready',outdoor,false,'facade',1,null,null),
      (foreign_id,foreign_site,'OP-'||foreign_id,'GF','Office',100,100,1,'Window','Sliding','ready',outdoor,false,'internal',null,null,null);
  update projects set sales_status='ready_for_quotation',status='Quotation' where id=site;
  select jsonb_build_object('total',300000,'subtotal',300000,'branch','Karkh','additionalItems','[]'::jsonb,
    'facadeMeasurements',(select jsonb_agg(to_jsonb(o)) from openings o where o.id=facade_id),
    'lines',(select jsonb_agg(jsonb_build_object('opening',to_jsonb(o),'total',100000) order by o.id) from openings o where o.project_id=site and o.opening_type not in ('Skylight','Facade'))) into quote;
  select jsonb_agg(to_jsonb(o) order by o.id) into original_rows from openings o where o.project_id=site;
  flow:=advance_sales_flow(site,'save',0,quote,indoor);
  old_quote:=flow.quotation;
  removed:=quote||jsonb_build_object('excludedOpeningIds',jsonb_build_array(curtain_id),'total',200000,'subtotal',200000,
    'lines',(select jsonb_agg(line) from jsonb_array_elements(quote->'lines') line where line#>>'{opening,id}'<>curtain_id::text));
  flow:=advance_sales_flow(site,'save',flow.revision,removed,indoor);
  assert flow.quotation->'excludedOpeningIds'=jsonb_build_array(curtain_id),'Exclusion is not persisted';
  assert jsonb_array_length(flow.quotation->'lines')=2,'Removed curtain wall is still quoted';
  assert (select quotation=old_quote from quotation_revisions where project_id=site and version=1),'Original quotation revision changed';
  assert (select jsonb_agg(to_jsonb(o) order by o.id)=original_rows from openings o where o.project_id=site),'Removal changed a measurement, author or media';

  -- Repricing/discount saves reuse the same measured partition and preserve exclusions.
  proposed:=flow.quotation||'{"total":190000,"discount":{"percent":5,"amount":10000}}'::jsonb;
  flow:=advance_sales_flow(site,'save',flow.revision,proposed,manager);
  assert flow.quotation->'excludedOpeningIds'=jsonb_build_array(curtain_id),'Discount/reprice save lost the removed opening';
  flow:=advance_sales_flow(site,'save',flow.revision,quote||'{"excludedOpeningIds":[]}'::jsonb,indoor);
  assert jsonb_array_length(flow.quotation->'lines')=3,'Restoring a measured opening failed';
  assert (select quotation->'excludedOpeningIds'=jsonb_build_array(curtain_id) from quotation_revisions where project_id=site and version=2),'Removed-opening revision history changed';

  previous_flow:=flow;
  select count(*) into history_before from quotation_revisions where project_id=site;
  for invalid in select * from (values
    ('null list',quote||'{"excludedOpeningIds":null}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('object list',quote||'{"excludedOpeningIds":{}}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('string list',quote||'{"excludedOpeningIds":"x"}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('number item',quote||'{"excludedOpeningIds":[1]}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('null item',quote||'{"excludedOpeningIds":[null]}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('object item',quote||'{"excludedOpeningIds":[{}]}'::jsonb,'Invalid removed openings. Reload the quotation.'),
    ('duplicate item',removed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(curtain_id,curtain_id)),'Invalid removed openings. Reload the quotation.'),
    ('unknown item',removed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(gen_random_uuid())),'Invalid removed openings. Reload the quotation.'),
    ('foreign item',removed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(foreign_id)),'Invalid removed openings. Reload the quotation.'),
    ('unpriced skylight',removed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(skylight_id)),'Invalid removed openings. Reload the quotation.'),
    ('facade item',removed||jsonb_build_object('excludedOpeningIds',jsonb_build_array(facade_id)),'Invalid removed openings. Reload the quotation.'),
    ('line overlap',quote||jsonb_build_object('excludedOpeningIds',jsonb_build_array(curtain_id)),'Invalid removed openings. Reload the quotation.'),
    ('silent omission',removed-'excludedOpeningIds','Measurements changed. Reload the quotation.'),
    ('omission with empty list',removed||'{"excludedOpeningIds":[]}'::jsonb,'Measurements changed. Reload the quotation.'),
    ('empty quotation',quote||jsonb_build_object('lines','[]'::jsonb,'excludedOpeningIds',jsonb_build_array(window_id,curtain_id,louver_id),'additionalItems','[]'::jsonb,'total',0),'Incomplete quotation')
  ) cases(label,payload,message) loop
    begin
      perform advance_sales_flow(site,'save',flow.revision,invalid.payload,indoor);
      raise exception using errcode='ZX001',message='Invalid removal accepted: '||invalid.label;
    exception when sqlstate '22023' or sqlstate 'P0001' then assert sqlerrm=invalid.message,invalid.label||': '||sqlerrm; end;
    assert (select to_jsonb(f)=to_jsonb(previous_flow) from sales_workflows f where f.project_id=site),'Rejected removal changed the saved quotation';
    assert (select count(*)=history_before from quotation_revisions where project_id=site),'Rejected removal created history';
    assert (select jsonb_agg(to_jsonb(o) order by o.id)=original_rows from openings o where o.project_id=site),'Rejected removal changed measurements';
  end loop;
  begin
    perform advance_sales_flow(site,'save',flow.revision-1,removed,indoor);
    raise exception using errcode='ZX001',message='Stale removal accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.'; end;
  begin
    perform advance_sales_flow(site,'save',flow.revision,removed,outdoor);
    raise exception using errcode='ZX001',message='Outdoor commercial removal accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform advance_sales_flow(site,'save',flow.revision,removed,other_branch);
    raise exception using errcode='ZX001',message='Other-branch commercial removal accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform advance_sales_flow(site,'save',flow.revision,removed,inactive);
    raise exception using errcode='ZX001',message='Inactive removal accepted';
  exception when insufficient_privilege then null;
    when sqlstate 'P0001' then assert sqlerrm='Inactive employee'; end;

  -- Removing all measured opening charges is valid when a standalone item remains.
  proposed:=quote||jsonb_build_object('lines','[]'::jsonb,'excludedOpeningIds',jsonb_build_array(window_id,curtain_id,louver_id),
    'additionalItems','[{"total":1500,"item":{"id":"fixture-product","rate":1500,"quantity":1}}]'::jsonb,'total',1500,'subtotal',1500);
  flow:=advance_sales_flow(site,'save',flow.revision,proposed,indoor);
  assert jsonb_array_length(flow.quotation->'lines')=0,'Standalone-only quotation was not saved';
  assert (select jsonb_agg(to_jsonb(o) order by o.id)=original_rows from openings o where o.project_id=site),'Standalone quote removed measured rows';

  -- A shared additional-measurement task remains locked until submitted. Its new
  -- opening must join either the quoted or excluded set on the subsequent save.
  update projects set additional_openings_state='requested',additional_openings_original_ids=array(select id from openings where project_id=site),sales_status='new_lead' where id=site;
  begin
    perform advance_sales_flow(site,'save',flow.revision,removed,indoor);
    raise exception using errcode='ZX001',message='Unsubmitted measurement task removal accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Complete the additional measurements and save a quotation revision before continuing.'; end;
  insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values(added_id,site,'OP-'||added_id,'GF','Office',130,150,1,'Window','Sliding','ready',outdoor);
  update projects set additional_openings_state='submitted',sales_status='ready_for_quotation' where id=site;
  begin
    perform advance_sales_flow(site,'save',flow.revision,removed,indoor);
    raise exception using errcode='ZX001',message='Unaccounted additional opening accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;
  proposed:=removed||jsonb_build_object('lines',(removed->'lines')||jsonb_build_array(jsonb_build_object('total',100000,'opening',(select to_jsonb(o) from openings o where o.id=added_id))),'total',300000,'subtotal',300000);
  flow:=advance_sales_flow(site,'save',flow.revision,proposed,indoor);
  assert (select additional_openings_state is null from projects where id=site),'Submitted measurement task was not finalized';
  assert flow.quotation->'excludedOpeningIds'=jsonb_build_array(curtain_id),'Additional task reintroduced an excluded opening';
  select jsonb_agg(to_jsonb(o) order by o.id) into rows_before from openings o where o.project_id=site;

  -- Revising an unsigned contract archives it, resets approval and keeps the
  -- exact measurements. Signed contracts cannot be revised or have lines removed.
  flow:=advance_sales_flow(site,'approve',flow.revision,'{}',indoor);
  flow:=advance_sales_flow(site,'contract',flow.revision,'{"template":"commercial","number":"FIXTURE","terms":[]}',indoor);
  old_contract:=flow.contract;
  proposed:=flow.quotation||jsonb_build_object('excludedOpeningIds',jsonb_build_array(curtain_id,window_id),
    'lines',(select jsonb_agg(line) from jsonb_array_elements(flow.quotation->'lines') line where line#>>'{opening,id}'<>window_id::text),'total',200000,'subtotal',200000);
  flow:=advance_sales_flow(site,'save',flow.revision,proposed,indoor);
  assert flow.stage='quotation' and flow.contract is null and flow.approved_at is null,'Unsigned contract revision was not reset';
  assert exists(select 1 from quotation_revisions where project_id=site and contract=old_contract and previous_stage='contract'),'Unsigned contract snapshot was not archived';
  assert (select jsonb_agg(to_jsonb(o) order by o.id)=rows_before from openings o where o.project_id=site),'Unsigned contract revision changed measurements';
  flow:=advance_sales_flow(site,'approve',flow.revision,'{}',indoor);
  flow:=advance_sales_flow(site,'contract',flow.revision,'{"template":"commercial","number":"FIXTURE","terms":[]}',indoor);
  flow:=advance_sales_flow(site,'sign',flow.revision,'{"method":"upload","signer":"Fixture signer","path":"fixture-signed-file"}',indoor);
  previous_flow:=flow;
  begin
    perform advance_sales_flow(site,'save',flow.revision,quote,indoor);
    raise exception using errcode='ZX001',message='Signed quotation removal accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='Signed contracts cannot be changed.'; end;
  assert (select to_jsonb(f)=to_jsonb(previous_flow) from sales_workflows f where f.project_id=site),'Signed commercial snapshot changed';
  assert not has_function_privilege('authenticated','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','execute');
  assert not has_function_privilege('anon','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','execute');

  -- A malformed legacy measurement can be explicitly left out instead of
  -- forcing Indoor Sales to price or rewrite an entry with an unknown type.
  insert into projects(id,client_id,project_name,project_number,created_by,branch,building_type)
    values(legacy_site,client,'Legacy removal fixture','REM-'||legacy_site,indoor,'Karkh','residential_building');
  insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values(legacy_id,legacy_site,'OP-'||legacy_id,'GF','Kitchen',120,150,1,null,null,'ready',outdoor);
  update projects set sales_status='ready_for_quotation',status='Quotation' where id=legacy_site;
  proposed:=jsonb_build_object('lines','[]'::jsonb,'facadeMeasurements','[]'::jsonb,'excludedOpeningIds',jsonb_build_array(legacy_id),
    'additionalItems','[{"total":1500,"item":{"id":"fixture-product","rate":1500,"quantity":1}}]'::jsonb,'total',1500,'subtotal',1500);
  flow:=advance_sales_flow(legacy_site,'save',0,proposed,indoor);
  assert flow.quotation->'excludedOpeningIds'=jsonb_build_array(legacy_id),'Legacy unknown-type measurement cannot be excluded';
  assert (select opening_type is null from openings where id=legacy_id),'Exclusion rewrote a legacy measurement';
  raise notice 'PASS: quotation-only removal, restore, history, measurements/media, roles, revisions and workflow locks';
end;
$$;
rollback;
