-- Isolated PostgreSQL fixtures only. Existing project/quotation content is never
-- recreated by the correction function. The whole fixture is rolled back.
begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); other_branch uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 target uuid:=gen_random_uuid(); client uuid; opening_id uuid:=gen_random_uuid();
 quotation jsonb; terms jsonb; agreement jsonb; invalid jsonb; historical jsonb; historical_schedule jsonb;
 current_flow public.sales_workflows; before_flow public.sales_workflows;
 probe_flow public.sales_workflows;
 before_project jsonb; before_openings jsonb; before_history jsonb; before_contract jsonb;
 employee uuid; field_name text; stage_name text; expected_history integer:=0;
begin
 insert into auth.users(id,email) values(indoor,indoor||'@example.invalid'),(other_branch,other_branch||'@example.invalid'),(outdoor,outdoor||'@example.invalid'),(manager,manager||'@example.invalid'),(administrator,administrator||'@example.invalid'),(inactive,inactive||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
 update profiles set role='Outdoor Sales',branch='Karkh',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
 update profiles set role='Admin',is_active=true,status='Active' where id=administrator;
 update profiles set role='Admin',is_active=false,status='Inactive' where id=inactive;
 insert into clients(client_name,mobile,created_by) values('2027 agreement fixture','00000000000',indoor) returning id into client;
 insert into projects(id,client_id,project_name,project_number,created_by,branch,building_type,structure_readiness,sales_status,status)
 values(target,client,'2027 agreement fixture','AGREEMENT-'||target,indoor,'Karkh','residential_building','ready','ready_for_quotation','Quotation');
 quotation:=jsonb_build_object('total',25000001,'subtotal',25000001,'branch','Karkh','additionalItems','[]'::jsonb,'facadeMeasurements','[]'::jsonb,'lines',jsonb_build_array(jsonb_build_object('total',25000001,'opening',jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'quantity',1,'opening_type','Window','opening_direction','Sliding','has_arch',false,'has_roller_shutter',false))));
 select jsonb_agg(jsonb_build_object('title','Clause '||n,'text','Canonical clause '||n) order by n) into terms from generate_series(1,19) n;
 agreement:=jsonb_build_object('version','agreement-2027','sourceDocument','عقد اتفاق 2027.pdf','fields',jsonb_build_object('clientLegalName','Original legal name'),'total',25000001,'readiness',jsonb_build_object('measurement',jsonb_build_array('Measurement readiness'),'installation',jsonb_build_array('Installation readiness'),'notes',jsonb_build_array('Annex note')),'specificationNotes',jsonb_build_array('Specification exclusion'),'amountInWords','خمسة وعشرون مليوناً وواحد دينار عراقي','openingSpecifications',jsonb_build_array(jsonb_build_object('openingId',opening_id,'aluminumColor','black')),
 'paymentSchedule',jsonb_build_array(jsonb_build_object('id','signing','label','Signing','percent',50,'amount',12500001,'trigger','At signing'),jsonb_build_object('id','ready','label','Ready','percent',50,'amount',12500000,'trigger','At factory readiness')));
 current_flow:=advance_sales_flow(target,'save',0,quotation,indoor);
 current_flow:=advance_sales_flow(target,'approve',1,'{}'::jsonb,indoor);
 current_flow:=advance_sales_flow(target,'contract',2,jsonb_build_object('number','CT-ORIGINAL','createdAt','2026-11-15T08:00:00Z','createdBy',indoor,'branch','Karkh','client',jsonb_build_object('name','Snapshot client','mobile','000'),'project',jsonb_build_object('name','Snapshot project','number','AGREEMENT-'||target,'address','Snapshot address'),'template','residential','terms',terms,'agreement2027',agreement),indoor);
 before_flow:=current_flow;before_contract:=current_flow.contract;
 select to_jsonb(p) into before_project from projects p where id=target;
 select jsonb_agg(to_jsonb(o) order by id) into before_openings from openings o where project_id=target;
 select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]'::jsonb) into before_history from quotation_revisions r where project_id=target;
 agreement:=jsonb_set(agreement,'{fields,clientLegalName}','"Updated contract legal name"');
 current_flow:=update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);expected_history:=expected_history+1;
 assert current_flow.revision=before_flow.revision+1 and current_flow.stage='contract';
 assert current_flow.quotation=before_flow.quotation and current_flow.approved_at=before_flow.approved_at and current_flow.approved_by=before_flow.approved_by;
 assert current_flow.contract-ARRAY['terms','template','agreement2027']=before_contract-ARRAY['terms','template','agreement2027'],'Saved metadata or approved quotation changed';
 assert current_flow.contract#>>'{agreement2027,fields,clientLegalName}'='Updated contract legal name';
 assert (select previous_contract=before_contract and replacement_contract=current_flow.contract and corrected_by=indoor from contract_template_corrections where project_id=target and workflow_revision=current_flow.revision);
 assert (select to_jsonb(p)=before_project from projects p where id=target),'Project changed';
 assert (select jsonb_agg(to_jsonb(o) order by id)=before_openings from openings o where project_id=target),'Measured openings changed';
 assert (select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]'::jsonb)=before_history from quotation_revisions r where project_id=target),'Quote history changed';
 before_flow:=current_flow;
 begin
  perform update_agreement_contract(target,current_flow.revision-1,agreement,terms,'residential',indoor);
  raise exception using errcode='ZX001',message='Stale details accepted';
 exception when serialization_failure then null;end;
 foreach invalid in array array[jsonb_set(agreement,'{total}','1'),jsonb_set(agreement,'{paymentSchedule,0,amount}','1'),jsonb_set(agreement,'{paymentSchedule,0,percent}','1'),jsonb_set(agreement,'{openingSpecifications}','[]'),jsonb_set(agreement,'{readiness}','{}'),jsonb_set(agreement,'{specificationNotes}','[]'),jsonb_set(agreement,'{fields}','[]'),jsonb_set(agreement,'{version}','"legacy"'),jsonb_set(agreement,'{sourceDocument}','"forged.pdf"')] loop
  begin
   perform update_agreement_contract(target,current_flow.revision,invalid,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='Forged agreement accepted';
  exception when invalid_parameter_value then null;end;
 end loop;
 begin
  perform update_agreement_contract(target,current_flow.revision,agreement,'[]','residential',indoor);
  raise exception using errcode='ZX001',message='Missing canonical clauses accepted';
 exception when invalid_parameter_value then null;end;
 foreach employee in array array[outdoor,other_branch,inactive] loop
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',employee);
   raise exception using errcode='ZX001',message='Unauthorized employee accepted';
  exception when insufficient_privilege then null;end;
 end loop;
 foreach stage_name in array array['requested','submitted'] loop
  update projects set additional_openings_state=stage_name where id=target;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='Pending measurements accepted';
  exception when invalid_parameter_value then null;end;
 end loop;
 update projects set additional_openings_state=null where id=target;
 foreach field_name in array array['signed_at','evidence','accepted_at','accepted_by'] loop
  if field_name='signed_at' then update sales_workflows set signed_at=now() where project_id=target;
  elsif field_name='evidence' then update sales_workflows set evidence='{"method":"hard_copy"}' where project_id=target;
  elsif field_name='accepted_at' then update sales_workflows set accepted_at=now() where project_id=target;
  else update sales_workflows set accepted_by=administrator where project_id=target;end if;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='Executed document accepted';
  exception when insufficient_privilege then null;end;
  update sales_workflows set signed_at=null,evidence=null,accepted_at=null,accepted_by=null where project_id=target;
 end loop;
 foreach stage_name in array array['quotation','approved','signed','operations'] loop
  update sales_workflows set stage=stage_name where project_id=target;
  begin
   perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='Ineligible workflow stage accepted';
  exception when insufficient_privilege then null;end;
 end loop;
 update sales_workflows set stage='contract' where project_id=target;
 update sales_workflows set contract=contract-'agreement2027' where project_id=target;
 begin
  perform update_agreement_contract(target,current_flow.revision,agreement,terms,'residential',indoor);
  raise exception using errcode='ZX001',message='Legacy contract silently upgraded';
 exception when invalid_parameter_value then null;end;
 update sales_workflows set contract=before_flow.contract where project_id=target;
 assert (select count(*)=expected_history from contract_template_corrections where project_id=target),'Rejected updates left audit rows';
 historical_schedule:='[{"id":"sign","label":"Signing","percent":30,"amount":7500000,"trigger":"At signing"},{"id":"profiles","label":"Profiles","percent":20,"amount":5000000,"trigger":"Profiles supplied"},{"id":"frame","label":"Frame","percent":10,"amount":2500000,"trigger":"Frame installed"},{"id":"glass","label":"Glass","percent":20,"amount":5000000,"trigger":"Glass supplied"},{"id":"installation","label":"Installation","percent":15,"amount":3750000,"trigger":"Glass installed"},{"id":"finish","label":"Finish","percent":5,"amount":1250001,"trigger":"Before finish"}]';
 begin
  perform update_agreement_contract(target,current_flow.revision,jsonb_set(agreement,'{paymentSchedule}',historical_schedule),terms,'commercial',indoor);
  raise exception using errcode='ZX001',message='A type change accepted the superseded six-stage commercial policy';
 exception when invalid_parameter_value then null;end;
 agreement:=jsonb_set(agreement,'{paymentSchedule}','[{"id":"signing","label":"Signing","percent":25,"amount":6250000,"trigger":"At signing"},{"id":"profiles-delivered","label":"Profiles","percent":25,"amount":6250000,"trigger":"Profiles supplied"},{"id":"profiles-installed","label":"Frame","percent":25,"amount":6250000,"trigger":"Frame installed"},{"id":"glass-delivered","label":"Glass","percent":15,"amount":3750000,"trigger":"Glass supplied before installation"},{"id":"before-finishing","label":"Finish","percent":10,"amount":2500001,"trigger":"After glass installation, before finishing"}]');
 foreach employee in array array[manager,administrator] loop
  current_flow:=update_agreement_contract(target,current_flow.revision,agreement,terms,'commercial',employee);expected_history:=expected_history+1;
  assert current_flow.contract->>'template'='commercial' and current_flow.contract#>'{agreement2027,total}'='25000001';
  assert (select corrected_by=employee from contract_template_corrections where project_id=target and workflow_revision=current_flow.revision);
 end loop;
 assert current_flow.contract->'quotation'=before_contract->'quotation' and current_flow.quotation=before_flow.quotation;
 assert (select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]'::jsonb)=before_history from quotation_revisions r where project_id=target);
 assert (select sum((stage->>'amount')::numeric)=25000001 from jsonb_array_elements(current_flow.contract#>'{agreement2027,paymentSchedule}') stage),'Restored commercial installments lost the IQD remainder';
 foreach invalid in array array[jsonb_set(agreement,'{paymentSchedule,0,amount}','6250001'),jsonb_set(agreement,'{paymentSchedule,0,percent}','30'),jsonb_set(agreement,'{paymentSchedule,4,amount}','2500000'),jsonb_set(agreement,'{paymentSchedule}',(agreement->'paymentSchedule')-4)] loop
  begin
   perform update_agreement_contract(target,current_flow.revision,invalid,terms,'commercial',indoor);
   raise exception using errcode='ZX001',message='Forged restored commercial payments were accepted';
  exception when invalid_parameter_value then null;end;
 end loop;
 assert (select count(*)=expected_history from contract_template_corrections where project_id=target),'Rejected commercial payments retained audit rows';
 -- Preserve an actual historical commercial schedule during supplementary
 -- edits, without accepting edited historical percentages, amounts or text.
 begin
  historical:=jsonb_set(agreement,'{paymentSchedule}',historical_schedule);
  update sales_workflows set contract=jsonb_set(contract,'{agreement2027}',historical) where project_id=target;
  historical:=jsonb_set(historical,'{fields,clientLegalName}','"Historical commercial details"');
  probe_flow:=update_agreement_contract(target,current_flow.revision,historical,terms,'commercial',indoor);
  assert probe_flow.contract#>'{agreement2027,paymentSchedule}'=historical_schedule,'A detail edit rewrote the historical commercial schedule';
  foreach invalid in array array[jsonb_set(historical,'{paymentSchedule,0,amount}','1'),jsonb_set(historical,'{paymentSchedule,0,percent}','29'),jsonb_set(historical,'{paymentSchedule,0,trigger}','"Changed legacy milestone"')] loop
   begin
    perform update_agreement_contract(target,probe_flow.revision,invalid,terms,'commercial',indoor);
    raise exception using errcode='ZX001',message='A forged historical commercial schedule was accepted';
   exception when invalid_parameter_value then null;end;
  end loop;
  -- Equality with stored JSON is not an amount-validation bypass. Even an
  -- already-corrupt historical fixture must satisfy the original arithmetic.
  foreach invalid in array array[jsonb_set(historical,'{paymentSchedule,0,amount}','1'),jsonb_set(historical,'{paymentSchedule,0,percent}','29')] loop
   update sales_workflows set contract=jsonb_set(contract,'{agreement2027}',invalid) where project_id=target;
   begin
    perform update_agreement_contract(target,probe_flow.revision,invalid,terms,'commercial',indoor);
    raise exception using errcode='ZX001',message='A copied corrupt historical schedule bypassed amount validation';
   exception when invalid_parameter_value then null;end;
  end loop;
  raise exception using errcode='ZT000',message='Rollback isolated historical commercial fixture';
 exception when sqlstate 'ZT000' then null;
 end;
 -- Existing small residential contracts retain their saved 100% schedule.
 -- A newly selected residential policy must instead use 50%/50%, even for an
 -- amount below fifteen million; commercial keeps its original 100% exception.
 begin
  historical:=jsonb_set(jsonb_set(agreement,'{total}','10000001'),'{paymentSchedule}','[{"id":"signing","label":"Signing","percent":100,"amount":10000001,"trigger":"Historical small-contract upfront payment"}]');
  update sales_workflows stored set quotation=jsonb_set(stored.quotation,'{total}','10000001'),contract=jsonb_set(jsonb_set(jsonb_set(stored.contract,'{quotation,total}','10000001'),'{template}','"residential"'),'{agreement2027}',historical) where stored.project_id=target;
  historical:=jsonb_set(historical,'{fields,clientLegalName}','"Historical residential details"');
  probe_flow:=update_agreement_contract(target,current_flow.revision,historical,terms,'residential',indoor);
  assert probe_flow.contract#>'{agreement2027,paymentSchedule,0,percent}'='100' and jsonb_array_length(probe_flow.contract#>'{agreement2027,paymentSchedule}')=1,'A detail edit changed an existing residential payment agreement';
  invalid:=jsonb_set(historical,'{paymentSchedule,0,amount}','10000000');
  begin
   perform update_agreement_contract(target,probe_flow.revision,invalid,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='A forged small residential legacy amount was accepted';
  exception when invalid_parameter_value then null;end;
  update sales_workflows set contract=jsonb_set(contract,'{template}','"commercial"') where project_id=target;
  begin
   perform update_agreement_contract(target,probe_flow.revision,historical,terms,'residential',indoor);
   raise exception using errcode='ZX001',message='A newly selected small residential policy accepted 100% upfront';
  exception when invalid_parameter_value then null;end;
  invalid:=jsonb_set(historical,'{paymentSchedule}','[{"id":"signing","label":"Signing","percent":50,"amount":5000001,"trigger":"At signing"},{"id":"before-installation","label":"Before installation","percent":50,"amount":5000000,"trigger":"Before installation"}]');
  probe_flow:=update_agreement_contract(target,probe_flow.revision,invalid,terms,'residential',indoor);
  assert probe_flow.contract#>'{agreement2027,paymentSchedule}'=invalid->'paymentSchedule','A new small residential agreement did not use 50%/50%';
  probe_flow:=update_agreement_contract(target,probe_flow.revision,historical,terms,'commercial',indoor);
  assert probe_flow.contract#>'{agreement2027,paymentSchedule,0,amount}'='10000001','The old small commercial upfront exception was lost';
  raise exception using errcode='ZT000',message='Rollback isolated historical residential fixture';
 exception when sqlstate 'ZT000' then null;
 end;
 -- A persisted zero-value approved snapshot remains zero; the supplemental
 -- editor must neither invent a charge nor reject the same nonnegative bound
 -- used by the application calculator. Roll this special fixture back locally.
 begin
  invalid:=jsonb_set(jsonb_set(agreement,'{total}','0'),'{paymentSchedule}','[{"id":"sign","label":"Signing","percent":100,"amount":0,"trigger":"At signing"}]');
  update sales_workflows stored set quotation=jsonb_set(stored.quotation,'{total}','0'),contract=jsonb_set(jsonb_set(stored.contract,'{quotation,total}','0'),'{agreement2027}',invalid) where stored.project_id=target;
  perform update_agreement_contract(target,current_flow.revision,invalid,terms,'commercial',indoor);
  assert (select contract#>'{agreement2027,total}'='0' and contract#>'{agreement2027,paymentSchedule,0,amount}'='0' from sales_workflows where project_id=target),'Zero approved amount changed';
  raise exception using errcode='ZT000',message='Rollback isolated zero-value fixture';
 exception when sqlstate 'ZT000' then null;
 end;
 -- If the workflow update fails, its history INSERT must be rolled back too.
 execute $ddl$create function pg_temp.reject_agreement_update() returns trigger language plpgsql as $fail$begin raise exception using errcode='ZT001',message='Injected agreement update failure';end;$fail$;$ddl$;
 execute 'create trigger agreement_test_failure before update of contract on sales_workflows for each row execute function pg_temp.reject_agreement_update()';
 begin
  perform update_agreement_contract(target,current_flow.revision,agreement,terms,'commercial',indoor);
  raise exception using errcode='ZX001',message='Late failure was not triggered';
 exception when sqlstate 'ZT001' then null;end;
 assert (select count(*)=expected_history from contract_template_corrections where project_id=target),'Late failure retained partial history';
 assert (select contract=current_flow.contract and revision=current_flow.revision from sales_workflows where project_id=target),'Late failure changed workflow';
end;
$$;
rollback;
