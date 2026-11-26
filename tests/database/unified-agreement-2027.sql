-- Apply all migrations to a disposable database before running. Every fixture
-- and correction audit row is rolled back at the end of this script.
begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); other_branch uuid:=gen_random_uuid();
 target uuid; client uuid; opening_id uuid;
 approved_total numeric; quotation jsonb; agreement jsonb; policies jsonb;
 stages jsonb; terms jsonb; invalid jsonb; percentages integer[];
 policy_kind text; stage_index integer; amount numeric; allocated numeric;
 current_flow public.sales_workflows; original_contract jsonb;
 original_quotation jsonb; audit_count integer;
begin
 insert into auth.users(id,email) values(indoor,indoor||'@example.invalid'),(other_branch,other_branch||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
 insert into clients(client_name,mobile,created_by) values('Unified agreement fixture','00000000000',indoor) returning id into client;
 select jsonb_agg(jsonb_build_object('title','Clause '||n,'text','Canonical clause '||n) order by n) into terms from generate_series(1,19) n;
 foreach approved_total in array array[14999999::numeric,15000000::numeric,25000001::numeric,9007199254740991::numeric] loop
  target:=gen_random_uuid(); opening_id:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,branch,building_type,structure_readiness,sales_status,status)
  values(target,client,'Unified agreement fixture','UNIFIED-'||target,indoor,'Karkh','residential_building','ready','ready_for_quotation','Quotation');
  quotation:=jsonb_build_object('total',approved_total,'subtotal',approved_total,'branch','Karkh','additionalItems','[]'::jsonb,'facadeMeasurements','[]'::jsonb,'lines',jsonb_build_array(jsonb_build_object('total',approved_total,'opening',jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'quantity',1,'opening_type','Window','opening_direction','Sliding','has_arch',false,'has_roller_shutter',false))));
  policies:='[]';
  foreach policy_kind in array array['residential','commercial'] loop
   percentages:=case when policy_kind='residential' then array[50,50] when approved_total<15000000 then array[100] else array[25,25,25,15,10] end;
   allocated:=0; stages:='[]';
   for stage_index in 1..cardinality(percentages) loop
    amount:=case when stage_index=cardinality(percentages) then approved_total-allocated else round(approved_total*percentages[stage_index]/100) end;
    stages:=stages||jsonb_build_array(jsonb_build_object('id','stage-'||stage_index,'label','Installment '||stage_index,'trigger','Milestone '||stage_index,'percent',percentages[stage_index],'amount',amount));
    allocated:=allocated+amount;
   end loop;
   policies:=policies||jsonb_build_array(jsonb_build_object('id',policy_kind,'label',policy_kind,'stages',stages));
  end loop;
  agreement:=jsonb_build_object('version','agreement-2027','sourceDocument','عقد اتفاق 2027.pdf','fields',jsonb_build_object('clientLegalName','Original name'),'total',approved_total,'readiness',jsonb_build_object('measurement','[]'::jsonb,'installation','[]'::jsonb,'notes','[]'::jsonb),'specificationNotes','[]'::jsonb,'amountInWords','قيمة العقد المعتمدة بالدينار العراقي','openingSpecifications',jsonb_build_array(jsonb_build_object('openingId',opening_id,'aluminumColor','black')),'paymentSchedule','[]'::jsonb,'paymentSchedules',policies);
  current_flow:=advance_sales_flow(target,'save',0,quotation,indoor);
  current_flow:=advance_sales_flow(target,'approve',1,'{}'::jsonb,indoor);
  current_flow:=advance_sales_flow(target,'contract',2,jsonb_build_object('number','CT-UNIFIED','createdAt','2026-11-16T08:00:00Z','createdBy',indoor,'branch','Karkh','client',jsonb_build_object('name','Snapshot client'),'project',jsonb_build_object('name','Snapshot project','number','UNIFIED-'||target),'template','unified','terms',terms,'agreement2027',agreement),indoor);
  original_contract:=current_flow.contract; original_quotation:=current_flow.quotation;
  agreement:=jsonb_set(agreement,'{fields,clientLegalName}','"Updated unified legal name"');
  current_flow:=update_agreement_contract(target,current_flow.revision,agreement,terms,'unified',indoor);
  assert current_flow.contract->>'template'='unified';
  assert current_flow.contract#>'{agreement2027,paymentSchedules}'=policies,'A detail edit selected or changed a payment policy';
  assert current_flow.contract-'agreement2027'=original_contract-'agreement2027','A detail edit changed contract terms or metadata';
  assert current_flow.quotation=original_quotation,'A detail edit changed approved quotation prices';
  assert (select previous_contract=original_contract and replacement_contract=current_flow.contract from contract_template_corrections where project_id=target and workflow_revision=current_flow.revision),'Exact correction snapshots were not recorded';
  select count(*) into audit_count from contract_template_corrections where project_id=target;
  -- Incoming changes must not replace, omit, duplicate or select a policy.
  foreach invalid in array array[
   jsonb_set(agreement,'{paymentSchedules,0,stages,0,amount}','1'),
   jsonb_set(agreement,'{paymentSchedules,1,stages,0,percent}','30'),
   jsonb_set(agreement,'{paymentSchedules}',policies-1),
   jsonb_set(agreement,'{paymentSchedules,1,id}','"residential"'),
   jsonb_set(agreement,'{paymentSchedules}','{}'),
   jsonb_set(agreement,'{paymentSchedule}',policies#>'{0,stages}'),
   jsonb_set(agreement,'{total}','1')
  ] loop
   begin
    perform update_agreement_contract(target,current_flow.revision,invalid,terms,'unified',indoor);
    raise exception using errcode='ZX001',message='A forged unified policy was accepted';
   exception when invalid_parameter_value then null;end;
  end loop;
  -- Equality with stored JSON must not bypass the arithmetic checks. Each
  -- corrupt fixture is isolated in the exception block and rolled back.
  foreach invalid in array array[
   jsonb_set(agreement,'{paymentSchedules,0,stages,0,amount}','1'),
   jsonb_set(agreement,'{paymentSchedules,1,stages,0,percent}','30'),
   jsonb_set(agreement,'{paymentSchedules}',policies-1),
   jsonb_set(agreement,'{paymentSchedules,1,id}','"residential"'),
   jsonb_set(agreement,'{paymentSchedules,0,label}','""'),
   jsonb_set(agreement,'{paymentSchedules,1,stages,0,trigger}','""'),
   jsonb_set(agreement,'{paymentSchedule}',policies#>'{0,stages}')
  ] loop
   begin
    update sales_workflows set contract=jsonb_set(contract,'{agreement2027}',invalid) where project_id=target;
    perform update_agreement_contract(target,current_flow.revision,invalid,terms,'unified',indoor);
    raise exception using errcode='ZX001',message='An identical corrupt saved unified policy bypassed validation';
   exception when invalid_parameter_value then null;end;
  end loop;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,jsonb_set(terms,'{2,text}','"Changed payment terms"'),'unified',indoor);
   raise exception using errcode='ZX001',message='A detail edit replaced unified payment terms';
  exception when invalid_parameter_value then null;end;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='A unified contract selected a single policy';
  exception when invalid_parameter_value then null;end;
  begin
   perform advance_sales_flow(target,'change-contract-template',current_flow.revision,jsonb_build_object('template','commercial','terms',terms),indoor);
   raise exception using errcode='ZX001',message='The legacy correction RPC rewrote a unified agreement';
  exception when invalid_parameter_value then null;end;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'unified',other_branch);
   raise exception using errcode='ZX001',message='Another branch updated a unified agreement';
  exception when insufficient_privilege then null;end;
  assert (select count(*)=audit_count from contract_template_corrections where project_id=target),'Rejected changes left correction history';
  assert (select contract=current_flow.contract and revision=current_flow.revision from sales_workflows where project_id=target),'Rejected changes rewrote the saved agreement';
  update sales_workflows set signed_at=now(),evidence='{"method":"hard_copy","signer":"Client"}' where project_id=target;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'unified',indoor);
   raise exception using errcode='ZX001',message='A signed unified agreement was changed';
  exception when insufficient_privilege then null;end;
 end loop;
end;
$$;
rollback;
