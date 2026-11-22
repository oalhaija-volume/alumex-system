-- Apply the repository migrations to a disposable Supabase database first.
-- This fixture proves that source-layout contracts work with the installed
-- generation, supplementary edits and selected-type corrections with the source policy patch.
-- Every fixture and correction audit row is rolled back.
begin;
set local request.jwt.claim.role = 'service_role';
do $$
declare
 indoor uuid:=gen_random_uuid();
 client uuid;
 target uuid;
 opening_id uuid;
 approved_total numeric;
 kind text;
 opposite_kind text;
 correction_stages jsonb;
 correction_agreement jsonb;
 prior_contract jsonb;
 percentages integer[];
 stage_ids text[];
 stage_index integer;
 allocated numeric;
 amount numeric;
 stages jsonb;
 terms jsonb;
 quotation jsonb;
 agreement jsonb;
 invalid jsonb;
 current_flow public.sales_workflows;
 original_contract jsonb;
 original_quotation jsonb;
 original_project jsonb;
 audit_count integer;
begin
 insert into auth.users(id,email) values(indoor,indoor||'@example.invalid');
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 insert into public.clients(client_name,mobile,created_by)
 values('Source PDF contract fixture','00000000000',indoor) returning id into client;
 select jsonb_agg(jsonb_build_object('title','Clause '||n,'text','Saved source clause '||n) order by n)
 into terms from generate_series(1,19) n;

 foreach kind in array array['residential','commercial'] loop
  foreach approved_total in array array[0::numeric,14999999::numeric,15000000::numeric,25000001::numeric,9007199254740991::numeric] loop
   target:=gen_random_uuid();opening_id:=gen_random_uuid();
   insert into public.projects(
    id,client_id,project_name,project_number,created_by,branch,
    assigned_outdoor_sales_id,structure_readiness,sales_status,status
   ) values(
    target,client,'Source PDF contract fixture','SOURCE-PDF-'||target,indoor,'Karkh',
    indoor,'ready','quotation_approved','Quotation'
   );
   quotation:=jsonb_build_object(
    'total',approved_total,'currency','IQD','version',1,'additionalItems','[]'::jsonb,
    'lines',jsonb_build_array(jsonb_build_object(
     'total',approved_total,
     'opening',jsonb_build_object('id',opening_id,'width',120,'height',150,'quantity',1,'opening_type','Window','opening_direction','Sliding'),
     'system',jsonb_build_object('name','Saved approved system','rate',approved_total,'total',approved_total)
    ))
   );
   insert into public.sales_workflows(project_id,revision,stage,quotation,approved_by,approved_at)
   values(target,0,'approved',quotation,indoor,now());

   -- The PDF's full-payment note sits below both policy branches.
   percentages:=case when approved_total<15000000 then array[100]
    when kind='residential' then array[50,50] else array[30,20,10,20,15,5] end;
   stage_ids:=case when approved_total<15000000 then array['signing']
    when kind='residential' then array['signing','before-installation']
    else array['signing','profiles-delivered','profiles-installed','glass-delivered','glass-installed','before-finishing'] end;
   allocated:=0;stages:='[]'::jsonb;
   for stage_index in 1..cardinality(percentages) loop
    amount:=case when stage_index=cardinality(percentages)
     then approved_total-allocated else round(approved_total*percentages[stage_index]/100) end;
    stages:=stages||jsonb_build_array(jsonb_build_object(
     'id',stage_ids[stage_index],'label','Saved installment '||stage_index,
     'trigger',case when kind='residential' and stage_index=2
      then 'Upon goods readiness at the factory, within seven days of notice'
      else 'Saved source milestone '||stage_index end,
     'percent',percentages[stage_index],'amount',amount
    ));
    allocated:=allocated+amount;
   end loop;
   agreement:=jsonb_build_object(
    'version','agreement-2027','sourceDocument','عقد اتفاق 2027.pdf','documentLayout','source-pdf-2027','selectedProductsOnly',true,'compactLayout',true,
    'fields',jsonb_build_object('clientLegalName','Captured source client'),
    'total',approved_total,'amountInWords','قيمة العقد المعتمدة بالدينار العراقي',
    'paymentSchedule',stages,
    'openingSpecifications',jsonb_build_array(jsonb_build_object('openingId',opening_id,'aluminumColor','Saved color')),
    'readiness',jsonb_build_object('measurement','[]'::jsonb,'installation','[]'::jsonb,'notes','[]'::jsonb),
    'specificationNotes','[]'::jsonb
   );
   current_flow:=public.advance_sales_flow(target,'contract',0,jsonb_build_object(
    'number','CT-SOURCE-'||target,'createdAt','2026-11-22T08:00:00Z','createdBy',indoor,
    'branch','Karkh','client',jsonb_build_object('name','Captured source client'),
    'project',jsonb_build_object('name','Captured project','number','SOURCE-PDF-'||target,'address','Saved project address'),
    'template',kind,'terms',terms,'agreement2027',agreement
   ),indoor);
   original_contract:=current_flow.contract;original_quotation:=current_flow.quotation;
   assert current_flow.stage='contract' and current_flow.revision=1;
   assert current_flow.contract#>>'{agreement2027,documentLayout}'='source-pdf-2027','Generation lost the source layout marker';
   assert current_flow.contract#>'{agreement2027,paymentSchedule}'=stages,'Generation changed the selected source policy';
   assert not (current_flow.contract->'agreement2027' ? 'paymentSchedules'),'Generation inserted the opposite payment policy';
   assert current_flow.contract->'quotation'=quotation,'Generation changed the approved quotation';
   select to_jsonb(p) into original_project from public.projects p where id=target;

   agreement:=jsonb_set(agreement,'{fields,clientLegalName}','"Reviewed source client"');
   current_flow:=public.update_agreement_contract(target,current_flow.revision,agreement,terms,kind,indoor);
   assert current_flow.contract#>>'{agreement2027,documentLayout}'='source-pdf-2027','Editing details lost the source layout marker';
   assert current_flow.contract-'agreement2027'=original_contract-'agreement2027','Editing details changed contract metadata';
   assert (current_flow.contract->'agreement2027')-'fields'=(original_contract->'agreement2027')-'fields','Editing details changed the saved financial or source policy';
   assert current_flow.quotation=original_quotation,'Editing details changed the approved quotation';
   assert (select to_jsonb(p)=original_project from public.projects p where id=target),'Editing contract details changed the project record';
   assert (select previous_contract=original_contract and replacement_contract=current_flow.contract
    from public.contract_template_corrections where project_id=target and workflow_revision=current_flow.revision),'Correction history did not preserve both document snapshots';
   assert (select sum((stage->>'amount')::numeric)=approved_total from jsonb_array_elements(stages) stage),'The selected source installments lost an IQD remainder';
   assert (select count(*)=0 from public.quotation_revisions where project_id=target),'Contract generation or details editing revised the quotation';

   select count(*) into audit_count from public.contract_template_corrections where project_id=target;
   foreach invalid in array array[
    jsonb_set(agreement,'{paymentSchedule,0,amount}',to_jsonb((agreement#>>'{paymentSchedule,0,amount}')::numeric+1)),
    jsonb_set(agreement,'{paymentSchedule,0,percent}','1'),
    jsonb_set(agreement,'{total}',to_jsonb(approved_total+1)),
    jsonb_set(agreement,'{openingSpecifications}','[]'::jsonb),
    agreement-'documentLayout',agreement-'selectedProductsOnly',agreement-'compactLayout',
    jsonb_set(agreement,'{documentLayout}','null'),jsonb_set(agreement,'{selectedProductsOnly}','false'),jsonb_set(agreement,'{compactLayout}','false')
   ] loop
    begin
     perform public.update_agreement_contract(target,current_flow.revision,invalid,terms,kind,indoor);
     raise exception using errcode='ZX001',message='A forged source contract amount or specification was accepted';
    exception when invalid_parameter_value then null;end;
   end loop;
   begin
    perform public.update_agreement_contract(target,current_flow.revision-1,agreement,terms,kind,indoor);
    raise exception using errcode='ZX001',message='A stale source contract revision was accepted';
   exception when serialization_failure then null;end;
   assert (select count(*)=audit_count from public.contract_template_corrections where project_id=target),'Rejected source edits left audit rows';
   assert (select contract=current_flow.contract and revision=current_flow.revision from public.sales_workflows where project_id=target),'Rejected source edits changed the saved contract';

   -- A marker may not promote a historical issued snapshot to a new layout.
   begin
    update public.sales_workflows set contract=jsonb_set(contract,'{agreement2027}',agreement-ARRAY['documentLayout','selectedProductsOnly','compactLayout']) where project_id=target;
    begin
     perform public.update_agreement_contract(target,current_flow.revision,agreement,terms,kind,indoor);
     raise exception using errcode='ZX001',message='A legacy agreement was promoted to source layout';
    exception when invalid_parameter_value then null;end;
    raise exception using errcode='ZT000',message='Rollback isolated marker-promotion fixture';
   exception when sqlstate 'ZT000' then null;end;

   -- Correct either selected source type and then correct it back. The source
   -- policy differs from the legacy commercial and small-residential policy.
   opposite_kind:=case when kind='residential' then 'commercial' else 'residential' end;
   percentages:=case when approved_total<15000000 then array[100]
    when opposite_kind='residential' then array[50,50] else array[30,20,10,20,15,5] end;
   allocated:=0;correction_stages:='[]'::jsonb;
   for stage_index in 1..cardinality(percentages) loop
    amount:=case when stage_index=cardinality(percentages) then approved_total-allocated else round(approved_total*percentages[stage_index]/100) end;
    correction_stages:=correction_stages||jsonb_build_array(jsonb_build_object('id','corrected-'||stage_index,'label','Corrected source stage '||stage_index,'trigger','Corrected source milestone','percent',percentages[stage_index],'amount',amount));
    allocated:=allocated+amount;
   end loop;
   correction_agreement:=jsonb_set(agreement,'{paymentSchedule}',correction_stages);
   prior_contract:=current_flow.contract;
   current_flow:=public.update_agreement_contract(target,current_flow.revision,correction_agreement,terms,opposite_kind,indoor);
   assert current_flow.contract->>'template'=opposite_kind,'Source type correction was lost';
   assert current_flow.contract#>'{agreement2027,paymentSchedule}'=correction_stages,'Source correction changed the chosen payment schedule';
   assert (current_flow.contract->'agreement2027')-'paymentSchedule'=agreement-'paymentSchedule','Source correction changed manual fields, layout or specifications';
   assert current_flow.contract->'quotation'=quotation and current_flow.quotation=quotation,'Source type correction changed the approved quotation';
   assert (select previous_contract=prior_contract and replacement_contract=current_flow.contract from public.contract_template_corrections where project_id=target and workflow_revision=current_flow.revision);
   -- Copying or changing an amount remains invalid on a type correction.
   begin
    perform public.update_agreement_contract(target,current_flow.revision,jsonb_set(agreement,'{paymentSchedule,0,amount}',to_jsonb((agreement#>>'{paymentSchedule,0,amount}')::numeric+1)),terms,kind,indoor);
    raise exception using errcode='ZX001',message='Forged source correction amount was accepted';
   exception when invalid_parameter_value then null;end;
   current_flow:=public.update_agreement_contract(target,current_flow.revision,agreement,terms,kind,indoor);
   assert current_flow.contract->>'template'=kind and current_flow.contract#>'{agreement2027,paymentSchedule}'=stages,'Reverse correction failed';
   assert (select to_jsonb(p)=original_project from public.projects p where id=target),'Source type correction changed project information';

   update public.sales_workflows set signed_at=now(),evidence='{"method":"hard_copy","signer":"Fixture client"}'::jsonb where project_id=target;
   begin
    perform public.update_agreement_contract(target,current_flow.revision,agreement,terms,kind,indoor);
    raise exception using errcode='ZX001',message='A signed source contract was edited';
   exception when insufficient_privilege then null;end;
   assert (select contract=current_flow.contract from public.sales_workflows where project_id=target),'A signed source document changed';
  end loop;
 end loop;
end;
$$;
rollback;
