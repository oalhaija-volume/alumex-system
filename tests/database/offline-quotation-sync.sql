-- Disposable PostgreSQL/PGlite only. All fixtures and saves roll back.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare
  indoor uuid:=gen_random_uuid(); other_indoor uuid:=gen_random_uuid(); shared_indoor uuid:=gen_random_uuid();
  rasafa uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); customer uuid;
  site uuid:=gen_random_uuid(); shared_site uuid:=gen_random_uuid(); other_site uuid:=gen_random_uuid();
  opening_id uuid:=gen_random_uuid(); shared_opening uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
  operation uuid:=gen_random_uuid(); shared_operation uuid:=gen_random_uuid(); failed_operation uuid;
  recorded_at timestamptz:='2026-11-23T09:00:00Z'; original_request jsonb; shared_request jsonb;
  quote jsonb; candidate jsonb; response jsonb; repeated jsonb; before_flow jsonb; before_openings jsonb;
  original_flow public.sales_workflows; flow public.sales_workflows; shared_flow public.sales_workflows;
  history_count integer; receipts_count integer; bad record; change jsonb; size_operation uuid;
begin
  insert into auth.users(id,email) values(indoor,indoor||'@example.invalid'),(other_indoor,other_indoor||'@example.invalid'),
    (shared_indoor,shared_indoor||'@example.invalid'),(rasafa,rasafa||'@example.invalid'),(outdoor,outdoor||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id in(indoor,other_indoor,shared_indoor);
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=rasafa;
  update public.profiles set role='Outdoor Sales',branch='Karkh',is_active=true,status='Active' where id=outdoor;
  insert into public.clients(client_name,mobile,created_by) values('Offline quotation fixture','00000000000',indoor) returning id into customer;
  insert into public.projects(id,client_id,project_name,project_number,created_by,branch,building_type,structure_readiness,follow_up_owner_id)
    values(site,customer,'Offline quote','OFFLINE-'||site,indoor,'Karkh','residential_building','ready',indoor),
      (shared_site,customer,'Shared offline quote','OFFLINE-'||shared_site,rasafa,'Rasafa','residential_building','ready',rasafa),
      (other_site,customer,'Other offline quote','OFFLINE-'||other_site,rasafa,'Rasafa','residential_building','ready',rasafa);
  insert into public.openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,has_roller_shutter)
    values(opening_id,site,'OP-'||opening_id,'Ground','Office',100,100,1,'Window','Sliding','ready',indoor,false,false),
      (shared_opening,shared_site,'OP-'||shared_opening,'Ground','Office',100,100,1,'Window','Sliding','ready',rasafa,false,false);
  update public.projects set sales_status='ready_for_quotation',status='Quotation' where id in(site,shared_site);
  select jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('opening',to_jsonb(o),'area',1,
      'system',jsonb_build_object('id',product,'name','Alumex system','unit','sqm','rate',265000,'quantity',1,'total',265000),
      'glass',null,'extras','[]'::jsonb,'total',265000)),
    'additionalItems','[]'::jsonb,'branch','Karkh','governorate',null,'currency','IQD','total',265000)
    into quote from public.openings o where id=opening_id;
  flow:=public.advance_sales_flow(site,'save',0,quote,indoor);
  original_flow:=flow;
  select jsonb_set(jsonb_set(quote,'{lines,0,opening}',to_jsonb(o)),'{branch}','"Rasafa"')
    into quote from public.openings o where id=shared_opening;
  shared_flow:=public.advance_sales_flow(shared_site,'save',0,quote,rasafa);
  original_request:=jsonb_build_object('action','save','revision',flow.revision,'choices','[]'::jsonb,
    'pricingPolicy',jsonb_build_object('curtainWallMinimumRate',1));
  candidate:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(flow.quotation,'{lines,0,system,rate}','275000'),
    '{lines,0,system,total}','275000'),'{lines,0,total}','275000'),'{total}','275000');
  assert public.replay_offline_quotation(operation,indoor,site,original_request,recorded_at) is null,'Fresh operation found a receipt';
  response:=public.sync_offline_quotation(operation,indoor,site,flow.revision,candidate,original_request,recorded_at);
  assert response->>'revision'='2' and response->>'replayed'='false','Initial operation did not save exactly once';
  assert response#>'{flow,contract}'='null'::jsonb and response#>'{flow,evidence}'='null'::jsonb,'Receipt copied private documents';
  assert (select count(*)=1 from public.offline_quotation_receipts where operation_id=operation),'Durable receipt missing';
  assert not exists(select 1 from public.sales_workflows where project_id=site and quotation ? 'pricingPolicy'),'Raw browser policy was trusted';
  select * into flow from public.sales_workflows where project_id=site;
  select count(*) into history_count from public.quotation_revisions where project_id=site;
  repeated:=public.sync_offline_quotation(operation,indoor,site,original_flow.revision,'{}',original_request,recorded_at);
  assert repeated->>'revision'='2' and repeated->>'replayed'='true','Lost-response retry did not replay original result';
  assert (select revision=2 from public.sales_workflows where project_id=site),'Retry saved a duplicate revision';
  assert (select count(*)=history_count from public.quotation_revisions where project_id=site),'Retry duplicated history';

  -- Later legitimate edits never cause an already committed operation to repeat.
  flow:=public.advance_sales_flow(site,'save',flow.revision,flow.quotation,indoor);
  repeated:=public.replay_offline_quotation(operation,indoor,site,original_request,recorded_at);
  assert repeated->>'revision'='2' and (select revision=3 from public.sales_workflows where project_id=site),'Old receipt changed later work';
  for bad in select * from (values
    ('different body',indoor,original_request||'{"extra":"changed"}'::jsonb,recorded_at),
    ('different actor',other_indoor,original_request,recorded_at),
    ('different recorded time',indoor,original_request,recorded_at+interval '1 second')
  ) cases(label,actor,request,at_time) loop
    begin
      perform public.replay_offline_quotation(operation,bad.actor,site,bad.request,bad.at_time);
      raise exception using errcode='ZX001',message='Changed immutable operation accepted: '||bad.label;
    exception when sqlstate '22023' then assert sqlerrm='Offline quotation operation was already used for different work.'; end;
  end loop;
  failed_operation:=gen_random_uuid();
  begin
    perform public.sync_offline_quotation(failed_operation,indoor,site,1,candidate,original_request,recorded_at);
    raise exception using errcode='ZX001',message='Stale fresh offline quotation accepted';
  exception when serialization_failure then null; end;
  assert not exists(select 1 from public.offline_quotation_receipts where operation_id=failed_operation),'Conflict created a receipt';

  -- Actor status and access are checked before a receipt, not just before writes.
  update public.profiles set is_active=false,status='Inactive' where id=indoor;
  begin
    perform public.replay_offline_quotation(operation,indoor,site,original_request,recorded_at);
    raise exception using errcode='ZX001',message='Inactive actor replayed a receipt';
  exception when insufficient_privilege then null; end;
  update public.profiles set is_active=true,status='Active' where id=indoor;
  begin
    perform public.replay_offline_quotation(operation,outdoor,site,original_request,recorded_at);
    raise exception using errcode='ZX001',message='Outdoor role replayed quotation data';
  exception when insufficient_privilege then null; end;

  insert into public.project_quotation_price_access(project_id,employee_id,reason)
    values(shared_site,shared_indoor,'Offline shared quotation fixture');
  shared_request:=jsonb_build_object('action','save-shared-prices','revision',shared_flow.revision,'systemRates','[]'::jsonb,'additionalRates','[]'::jsonb);
  candidate:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(shared_flow.quotation,'{lines,0,system,rate}','275000'),
    '{lines,0,system,total}','275000'),'{lines,0,total}','275000'),'{total}','275000');
  candidate:=jsonb_set(candidate,'{lines,0,system,rateSource}','"quotation"');
  response:=public.sync_offline_quotation(shared_operation,shared_indoor,shared_site,shared_flow.revision,candidate,shared_request,recorded_at);
  assert response->>'revision'='2','Authorized shared offline prices were not saved';
  assert (select branch='Rasafa' and follow_up_owner_id=rasafa from public.projects where id=shared_site),'Offline sharing transferred responsibility';
  begin
    perform public.replay_offline_quotation(shared_operation,shared_indoor,shared_site,shared_request||'{"action":"save"}',recorded_at);
    raise exception using errcode='ZX001',message='Shared grant became ordinary quotation access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.replay_offline_quotation(gen_random_uuid(),shared_indoor,other_site,shared_request,recorded_at);
    raise exception using errcode='ZX001',message='Shared grant escaped its project';
  exception when insufficient_privilege then null; end;
  update public.project_quotation_price_access set revoked_at=now(),reason='Revoke offline fixture access'
    where project_id=shared_site and employee_id=shared_indoor;
  begin
    perform public.replay_offline_quotation(shared_operation,shared_indoor,shared_site,shared_request,recorded_at);
    raise exception using errcode='ZX001',message='Revoked sharing replayed a receipt';
  exception when insufficient_privilege then null; end;

  -- A fresh queued save cannot write through evidence/acceptance locks. A
  -- successful old receipt remains a truthful acknowledgement without writing.
  for bad in select * from (values
    ('signed_at','"2026-11-23T00:00:00Z"'::jsonb),('evidence','{"method":"hard_copy"}'::jsonb),
    ('accepted_at','"2026-11-23T00:00:00Z"'::jsonb),('accepted_by',to_jsonb(indoor))
  ) cases(column_name,value) loop
    execute format('update public.sales_workflows set %I=($1->>''value'')::%s where project_id=$2',bad.column_name,
      case when bad.column_name='evidence' then 'jsonb' when bad.column_name='accepted_by' then 'uuid' else 'timestamptz' end)
      using jsonb_build_object('value',bad.value),site;
    failed_operation:=gen_random_uuid();
    begin
      perform public.sync_offline_quotation(failed_operation,indoor,site,flow.revision,flow.quotation,
        jsonb_build_object('action','save','revision',flow.revision),recorded_at);
      raise exception using errcode='ZX001',message='Signed/accepted quotation synced a fresh draft';
    exception when serialization_failure then assert sqlerrm='Signed contracts cannot be changed.'; end;
    assert not exists(select 1 from public.offline_quotation_receipts where operation_id=failed_operation),'Locked save created a receipt';
    assert public.replay_offline_quotation(operation,indoor,site,original_request,recorded_at)->>'revision'='2','Locked project lost its prior success acknowledgement';
    execute format('update public.sales_workflows set %I=null where project_id=$1',bad.column_name) using site;
  end loop;

  -- Size corrections and their durable receipt are one transaction as well.
  change:=jsonb_build_object('openingId',opening_id,'previousWidth',100,'previousHeight',100,'previousQuantity',1,
    'width',110,'height',100,'quantity',1,'reason','Confirmed offline drawing correction');
  candidate:=jsonb_set(flow.quotation,'{lines,0,opening,width}','110')||jsonb_build_object('openingSizeChanges',jsonb_build_array(change));
  original_request:=jsonb_build_object('action','save','revision',flow.revision,'openingSizeChanges',jsonb_build_array(change));
  size_operation:=gen_random_uuid();
  response:=public.sync_offline_quotation(size_operation,indoor,site,flow.revision,candidate,original_request,recorded_at);
  assert (select width=110 from public.openings where id=opening_id),'Offline size transaction did not persist its measurement';
  select count(*) into history_count from public.opening_size_history where project_id=site;
  repeated:=public.sync_offline_quotation(size_operation,indoor,site,flow.revision,candidate,original_request,recorded_at);
  assert repeated->>'replayed'='true' and (select count(*)=history_count from public.opening_size_history where project_id=site),'Size retry repeated measurement history';

  assert not has_function_privilege('anon','public.sync_offline_quotation(uuid,uuid,uuid,integer,jsonb,jsonb,timestamptz)','execute');
  assert not has_function_privilege('authenticated','public.sync_offline_quotation(uuid,uuid,uuid,integer,jsonb,jsonb,timestamptz)','execute');
  assert has_function_privilege('service_role','public.sync_offline_quotation(uuid,uuid,uuid,integer,jsonb,jsonb,timestamptz)','execute');
  assert not has_function_privilege('authenticated','public.replay_offline_quotation(uuid,uuid,uuid,jsonb,timestamptz)','execute');
  assert not has_table_privilege('authenticated','public.offline_quotation_receipts','select,insert,update,delete');
  assert not has_table_privilege('service_role','public.offline_quotation_receipts','insert,update,delete');
  raise notice 'PASS: durable offline quotation replay, immutable requests, stale conflicts, shared access, revocation, signing locks and atomic sizes';
end;
$$;
rollback;
