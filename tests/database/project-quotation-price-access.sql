-- Run only against a disposable database after the repository migrations.
-- All fixture records and quotation revisions roll back.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare
  source_indoor uuid:=gen_random_uuid(); shared_indoor uuid:=gen_random_uuid();
  unshared_indoor uuid:=gen_random_uuid(); inactive_indoor uuid:=gen_random_uuid();
  outdoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); other_site uuid:=gen_random_uuid();
  customer uuid; opening_id uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); standalone uuid:=gen_random_uuid();
  quote jsonb; candidate jsonb; original_quote jsonb; original_project jsonb; original_openings jsonb;
  flow public.sales_workflows; before_flow jsonb; bad record; requested_action text; permission_count integer;
begin
  insert into auth.users(id,email) values
    (source_indoor,source_indoor||'@example.invalid'),(shared_indoor,shared_indoor||'@example.invalid'),
    (unshared_indoor,unshared_indoor||'@example.invalid'),(inactive_indoor,inactive_indoor||'@example.invalid'),
    (outdoor,outdoor||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=source_indoor;
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id in(shared_indoor,unshared_indoor);
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=false,status='Inactive' where id=inactive_indoor;
  update public.profiles set role='Outdoor Sales',branch='Karkh',is_active=true,status='Active' where id=outdoor;
  insert into public.clients(client_name,mobile,created_by)
    values('Shared quotation fixture','00000000000',source_indoor) returning id into customer;
  insert into public.projects(id,client_id,project_name,project_number,created_by,branch,building_type,structure_readiness,follow_up_owner_id)
    values(site,customer,'Shared quotation fixture','SHARED-'||site,source_indoor,'Rasafa','residential_building','ready',source_indoor),
      (other_site,customer,'Unshared quotation fixture','SHARED-'||other_site,source_indoor,'Rasafa','residential_building','ready',source_indoor);
  insert into public.openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,has_roller_shutter)
    values(opening_id,site,'OP-'||opening_id,'Ground','Office',100,100,1,'Window','Sliding','ready',source_indoor,false,false);
  update public.projects set sales_status='ready_for_quotation',status='Quotation' where id=site;
  select jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('opening',to_jsonb(o),'area',1,
      'system',jsonb_build_object('id',product,'name','Alumex system','unit','sqm','rate',265000,'quantity',1,'total',265000),
      'glass',null,'extras','[]'::jsonb,'total',265000)),
    'additionalItems',jsonb_build_array(jsonb_build_object('id',standalone,'name','Curtain Wall','unit','sqm','quantity',1,'rate',260000,'total',260000)),
    'branch','Rasafa','governorate',null,'currency','IQD','total',525000,'createdAt',now(),'preparedBy',source_indoor)
    into quote from public.openings o where id=opening_id;
  flow:=public.advance_sales_flow(site,'save',0,quote,source_indoor);
  original_quote:=flow.quotation;
  select to_jsonb(p)-array['updated_at'] into original_project from public.projects p where id=site;
  select jsonb_agg(to_jsonb(o) order by o.id) into original_openings from public.openings o where project_id=site;
  candidate:=jsonb_set(jsonb_set(jsonb_set(flow.quotation,'{lines,0,system,rate}','275000'),
    '{lines,0,system,total}','275000'),'{lines,0,total}','275000');
  candidate:=jsonb_set(candidate,'{total}','535000');
  candidate:=jsonb_set(candidate,'{lines,0,system,rateSource}','"quotation"');

  -- A project-specific grant never substitutes for another employee's grant.
  assert not public.employee_has_quotation_price_access(site,shared_indoor);
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,candidate,shared_indoor);
    raise exception using errcode='ZX001',message='Unshared cross-office save accepted';
  exception when insufficient_privilege then null; end;
  insert into public.project_quotation_price_access(project_id,employee_id,reason) values
    (site,shared_indoor,'Explicitly authorized fixture sharing'),
    (site,inactive_indoor,'Inactive fixture grant'),(site,outdoor,'Wrong-role fixture grant');
  assert public.employee_has_quotation_price_access(site,shared_indoor),'Active exact grant was not recognized';
  assert not public.employee_has_quotation_price_access(other_site,shared_indoor),'Grant escaped its project';
  assert not public.employee_has_quotation_price_access(site,unshared_indoor),'Grant escaped its employee';
  assert not public.employee_has_quotation_price_access(site,inactive_indoor),'Inactive employee retained a grant';
  assert not public.employee_has_quotation_price_access(site,outdoor),'Outdoor employee acquired quotation access';
  select count(*) into permission_count from public.audit_events
    where entity_id=site and action='project_quotation_price_access_granted';
  assert permission_count=3,'Grant changes did not create their audit records';
  foreach requested_action in array array['approve','contract','sign','accept','change-contract-template','set-discount'] loop
    begin
      perform public.advance_sales_flow(site,requested_action,flow.revision,'{}',shared_indoor);
      raise exception using errcode='ZX001',message='Shared grant allowed action: '||requested_action;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.require_indoor_project_branch(site,shared_indoor);
    raise exception using errcode='ZX001',message='Grant changed the generic branch guard';
  exception when insufficient_privilege then null; end;
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,candidate,inactive_indoor);
    raise exception using errcode='ZX001',message='Inactive shared employee saved prices';
  exception when insufficient_privilege then null; end;
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,candidate,unshared_indoor);
    raise exception using errcode='ZX001',message='Unshared employee saved prices';
  exception when insufficient_privilege then null; end;
  begin
    perform public.advance_sales_flow(other_site,'save',0,candidate,shared_indoor);
    raise exception using errcode='ZX001',message='Shared employee saved another project';
  exception when insufficient_privilege then null; end;
  update public.profiles set is_active=false,status='Inactive' where id=shared_indoor;
  assert not public.employee_has_quotation_price_access(site,shared_indoor),'Deactivation did not disable an existing grant';
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,candidate,shared_indoor);
    raise exception using errcode='ZX001',message='Deactivated shared employee saved prices';
  exception when insufficient_privilege then null; end;
  update public.profiles set is_active=true,status='Active' where id=shared_indoor;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',unshared_indoor::text,true);
  begin
    perform public.require_quotation_action_access(site,shared_indoor,'save',candidate);
    raise exception using errcode='ZX001',message='Shared access accepted a spoofed actor';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);

  -- Price-only changes preserve all commercial and measured structure.
  before_flow:=to_jsonb(flow);
  for bad in select * from (values
    ('dimension',jsonb_set(candidate,'{lines,0,opening,width}','120')),
    ('quantity',jsonb_set(candidate,'{lines,0,system,quantity}','2')),
    ('product',jsonb_set(candidate,'{lines,0,system,id}',to_jsonb(gen_random_uuid()))),
    ('name',jsonb_set(candidate,'{lines,0,system,name}','"Changed system"')),
    ('unit',jsonb_set(candidate,'{lines,0,system,unit}','"item"')),
    ('new option',jsonb_set(candidate,'{lines,0,systemModel}','"alumex-thermal"')),
    ('new extra',jsonb_set(candidate,'{lines,0,extras}','[{"id":"extra","rate":100,"quantity":1,"total":100}]')),
    ('branch',candidate||'{"branch":"Karkh"}'::jsonb),
    ('policy',candidate||'{"pricingPolicy":{"curtainWallMinimumRate":1}}'::jsonb),
    ('discount',candidate||'{"discount":{"percent":5,"subtotal":535000,"amount":26750}}'::jsonb),
    ('removed standalone',candidate||'{"additionalItems":[]}'::jsonb),
    ('added measurement command',candidate||'{"openingSizeChanges":[]}'::jsonb)
  ) cases(label,payload) loop
    begin
      perform public.advance_sales_flow(site,'save',flow.revision,bad.payload,shared_indoor);
      raise exception using errcode='ZX001',message='Shared structural change accepted: '||bad.label;
    exception when insufficient_privilege then null; end;
    assert (select to_jsonb(f)=before_flow from public.sales_workflows f where project_id=site),'Rejected shared edit changed quotation';
  end loop;
  for bad in select * from (values
    ('negative price',jsonb_set(candidate,'{lines,0,system,rate}','-1')),
    ('invalid source',jsonb_set(candidate,'{lines,0,system,rateSource}','"client"')),
    ('missing edited rate source',jsonb_set(candidate,'{lines,0,system}',(candidate#>'{lines,0,system}')-'rateSource')),
    ('fractional total',jsonb_set(candidate,'{lines,0,system,total}','275000.5')),
    ('fractional edited rate',jsonb_set(candidate,'{lines,0,system,rate}','275000.5')),
    ('incorrect charge total',jsonb_set(candidate,'{lines,0,system,total}','275001')),
    ('wrong line total',jsonb_set(candidate,'{lines,0,total}','1')),
    ('wrong root total',jsonb_set(candidate,'{total}','1'))
  ) cases(label,payload) loop
    begin
      perform public.advance_sales_flow(site,'save',flow.revision,bad.payload,shared_indoor);
      raise exception using errcode='ZX001',message='Invalid shared amount accepted: '||bad.label;
    exception when sqlstate '22023' then null; end;
  end loop;
  begin
    perform public.advance_sales_flow(site,'save',flow.revision-1,candidate,shared_indoor);
    raise exception using errcode='ZX001',message='Stale shared price save accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed. Reload before continuing.'; end;

  flow:=public.advance_sales_flow(site,'save',flow.revision,candidate,shared_indoor);
  assert flow.stage='quotation' and flow.quotation#>>'{lines,0,system,rate}'='275000','Authorized shared price was not saved';
  assert flow.quotation->>'preparedBy'=shared_indoor::text,'Shared revision lost real price editor';
  assert exists(select 1 from public.quotation_revisions where project_id=site and quotation=original_quote),'Original quotation history was rewritten';
  assert (select to_jsonb(p)-array['updated_at']=original_project from public.projects p where id=site),'Sharing changed project ownership, branch or other fields';
  assert (select jsonb_agg(to_jsonb(o) order by o.id)=original_openings from public.openings o where project_id=site),'Sharing changed measurements';
  candidate:=jsonb_set(jsonb_set(jsonb_set(flow.quotation,'{additionalItems,0,rate}','270000'),
    '{additionalItems,0,total}','270000'),'{total}','545000');
  candidate:=jsonb_set(candidate,'{additionalItems,0,rateSource}','"quotation"');
  flow:=public.advance_sales_flow(site,'save',flow.revision,candidate,shared_indoor);
  assert flow.quotation#>>'{additionalItems,0,rate}'='270000','Authorized standalone price was not saved';

  -- Revocation is immediate; branch-compatible original owners keep access.
  update public.project_quotation_price_access set revoked_at=now(),reason='Fixture access revoked'
    where project_id=site and employee_id=shared_indoor;
  assert not public.employee_has_quotation_price_access(site,shared_indoor),'Revoked grant stayed active';
  assert exists(select 1 from public.audit_events where entity_id=site and action='project_quotation_price_access_revoked'),'Revocation was not audited';
  begin
    perform public.advance_sales_flow(site,'save',flow.revision,flow.quotation,shared_indoor);
    raise exception using errcode='ZX001',message='Revoked shared employee saved prices';
  exception when insufficient_privilege then null; end;
  flow:=public.advance_sales_flow(site,'save',flow.revision,flow.quotation,source_indoor);
  update public.project_quotation_price_access set revoked_at=null,reason='Reauthorized fixture access'
    where project_id=site and employee_id=shared_indoor;

  -- An unchanged fractional catalog rate is historical data, not a new override.
  candidate:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(flow.quotation,'{lines,0,system,rate}','275000.5'),
    '{lines,0,system,total}','275001'),'{lines,0,total}','275001'),'{total}','545001');
  candidate:=jsonb_set(candidate,'{lines,0,system}',(candidate#>'{lines,0,system}')-'rateSource');
  flow:=public.advance_sales_flow(site,'save',flow.revision,candidate,source_indoor);
  candidate:=jsonb_set(jsonb_set(jsonb_set(flow.quotation,'{additionalItems,0,rate}','271000'),
    '{additionalItems,0,total}','271000'),'{total}','546001');
  flow:=public.advance_sales_flow(site,'save',flow.revision,candidate,shared_indoor);
  assert flow.quotation#>>'{lines,0,system,rate}'='275000.5','Shared edit changed an unchanged historical catalog rate';

  -- Existing evidence, acceptance and closed-state locks remain authoritative.
  for bad in select * from (values
    ('signed_at','"2026-11-23T00:00:00Z"'::jsonb),('evidence','{"method":"hard_copy"}'::jsonb),
    ('accepted_at','"2026-11-23T00:00:00Z"'::jsonb),('accepted_by',to_jsonb(source_indoor))
  ) cases(column_name,value) loop
    execute format('update public.sales_workflows set %I=($1->>''value'')::%s where project_id=$2',bad.column_name,
      case when bad.column_name='evidence' then 'jsonb' when bad.column_name='accepted_by' then 'uuid' else 'timestamptz' end)
      using jsonb_build_object('value',bad.value),site;
    begin
      perform public.advance_sales_flow(site,'save',flow.revision,flow.quotation,shared_indoor);
      raise exception using errcode='ZX001',message='Locked shared quotation accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='Signed contracts cannot be changed.'; end;
    execute format('update public.sales_workflows set %I=null where project_id=$1',bad.column_name) using site;
  end loop;
  assert not has_function_privilege('authenticated','public.employee_has_quotation_price_access(uuid,uuid)','execute');
  assert not has_function_privilege('anon','public.employee_has_quotation_price_access(uuid,uuid)','execute');
  assert has_function_privilege('service_role','public.employee_has_quotation_price_access(uuid,uuid)','execute');
  assert not has_function_privilege('authenticated','public.require_quotation_action_access(uuid,uuid,text,jsonb)','execute');
  assert not has_table_privilege('authenticated','public.project_quotation_price_access','insert,update,delete');
  assert not has_table_privilege('service_role','public.project_quotation_price_access','delete');
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',shared_indoor::text,true);
  set local role authenticated;
  assert (select count(*)=1 from public.project_quotation_price_access),'Grant metadata leaked another employee or project';
  assert not exists(select 1 from public.project_quotation_price_access where employee_id<>shared_indoor),'Grant metadata leaked another employee';
  begin
    update public.project_quotation_price_access set reason='Unauthorized client change' where employee_id=shared_indoor;
    raise exception using errcode='ZX001',message='Authenticated client changed its own grant';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  raise notice 'PASS: scoped shared quotation prices, revocation, unchanged ownership/measurements, monetary structure, history and signing locks';
end;
$$;
rollback;
