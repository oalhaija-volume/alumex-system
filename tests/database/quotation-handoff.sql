begin;
do $$
declare
 outdoor uuid:=gen_random_uuid(); assigned uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid();
 target_project uuid:=gen_random_uuid(); opening_id uuid:=gen_random_uuid(); actor uuid; action text;
 result public.sales_workflows; payload jsonb; target_client uuid; legacy_quote uuid:=gen_random_uuid(); affected integer;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(assigned,assigned::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,assigned);
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 perform public.sync_field_change(gen_random_uuid(),outdoor,target_project,'register',jsonb_build_object('client',jsonb_build_object('clientName','Quotation handoff test','clientType','individual','mobile','00000000000'),'project',jsonb_build_object('address','Baghdad','locationLatitude',33.3,'locationLongitude',44.4,'structureReadiness','ready','assignedOutdoorSalesId',assigned)),now(),null);
 perform public.sync_field_change(gen_random_uuid(),assigned,target_project,'opening',jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding'),now(),null);
 perform public.sync_field_change(gen_random_uuid(),assigned,target_project,'finish','{}'::jsonb,now(),null);
 assert (select sales_status='ready_for_quotation' from public.projects where id=target_project);
 payload:=jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('opening',jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'opening_type','Window','opening_direction','Sliding'))),'total',100000,'currency','IQD');
 foreach actor in array array[outdoor,assigned] loop
  foreach action in array array['save','approve','contract','sign'] loop
   begin
    perform public.advance_sales_flow(target_project,action,0,payload,actor);
    raise exception using errcode='ZX001',message='Outdoor commercial action was allowed';
   exception when insufficient_privilege then
    assert sqlerrm='Quotations and contracts are handled by Indoor Sales and company leadership.';
   end;
  end loop;
 end loop;
 assert not exists(select 1 from public.sales_workflows where project_id=target_project);
 result:=public.advance_sales_flow(target_project,'save',0,payload,indoor);
 assert result.stage='quotation' and result.quotation->>'preparedBy'=indoor::text;
 assert (select created_by=outdoor and assigned_outdoor_sales_id=assigned from public.projects where id=target_project);
 begin
  perform public.advance_sales_flow(target_project,'save',result.revision,payload,outdoor);
  raise exception using errcode='ZX001',message='Outdoor quotation revision was allowed';
 exception when insufficient_privilege then null;
 end;
 assert (select revision=1 from public.sales_workflows where project_id=target_project);
 assert (select count(*)=1 from public.openings where project_id=target_project);
 assert not has_function_privilege('authenticated','public.advance_sales_flow(uuid,text,integer,jsonb,uuid)','EXECUTE');
 select client_id into target_client from public.projects where id=target_project;
 insert into public.quotations(id,quotation_number,project_id,client_id,created_by) values(legacy_quote,'TEST-'||legacy_quote::text,target_project,target_client,indoor);
 perform set_config('request.jwt.claim.sub',outdoor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outdoor,'role','authenticated')::text,true);
 begin
  execute 'set local role authenticated';
  insert into public.quotations(quotation_number,project_id,client_id,created_by) values('TEST-BLOCKED-'||outdoor::text,target_project,target_client,outdoor);
  raise exception using errcode='ZX001',message='Direct Outdoor quotation insert was allowed';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 begin
  execute 'set local role authenticated';
  insert into public.quotation_items(quotation_id,opening_code,width,height) values(legacy_quote,'TEST',120,150);
  raise exception using errcode='ZX001',message='Direct Outdoor quotation item insert was allowed';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 execute 'set local role authenticated';
 update public.quotations set grand_total=999 where id=legacy_quote;
 get diagnostics affected=row_count;
 assert affected=0, 'Outdoor Sales edited an existing quotation';
 execute 'reset role';
 assert not has_function_privilege('authenticated','public.save_quotation_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,text,uuid,jsonb)','EXECUTE');
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 raise notice 'PASS: Outdoor creator and assignee can complete measurements but cannot create/revise/approve quotations or contracts; Indoor Sales can prepare their quotation.';
end;
$$;
rollback;
