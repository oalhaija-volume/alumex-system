-- Run only inside an outer rollback transaction after the reviewed migration.
-- Every employee/project below is an isolated fixture; no real contract is changed.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare
 administrator uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); foreign_indoor uuid:=gen_random_uuid();
 branch_manager uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 target uuid:=gen_random_uuid(); unsigned_target uuid:=gen_random_uuid(); customer uuid;
 quote jsonb; original_contract jsonb; original_flow jsonb; original_project jsonb; original_history jsonb;
 saved public.contract_document_revisions; duplicate public.contract_document_revisions; unsigned_copy public.contract_document_revisions;
 employee uuid; invalid jsonb; procedure_name text;
begin
 insert into auth.users(id,email) values
  (administrator,administrator||'@example.invalid'),(indoor,indoor||'@example.invalid'),
  (foreign_indoor,foreign_indoor||'@example.invalid'),(branch_manager,branch_manager||'@example.invalid'),(inactive,inactive||'@example.invalid');
 update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=foreign_indoor;
 update public.profiles set role='Branch Manager',branch='Karkh',is_active=true,status='Active' where id=branch_manager;
 update public.profiles set role='Admin',is_active=false,status='Inactive' where id=inactive;
 insert into public.clients(client_name,mobile,created_by) values('Document revision fixture','00000000000',administrator) returning id into customer;
 insert into public.projects(id,client_id,project_name,project_number,created_by,branch,structure_readiness,sales_status,status)
 values(target,customer,'Signed document revision fixture','REVISION-'||target,administrator,'Karkh','ready','transferred_to_operations','Production'),
  (unsigned_target,customer,'Unsigned document revision fixture','REVISION-'||unsigned_target,administrator,'Karkh','ready','contract_generated','Contract');
 quote:=jsonb_build_object('total',300000,'currency','IQD','version',4,'createdAt','2026-11-15T08:00:00Z','preparedBy',indoor,
  'lines',jsonb_build_array(jsonb_build_object('opening',jsonb_build_object('id',gen_random_uuid(),'width',67,'height',39,'quantity',1,'opening_type','Window','opening_direction','Hinged'),
   'area',0.2613,'system',jsonb_build_object('id','hinged-system','name','Hinged','unit','sqm','quantity',1,'rate',300000,'total',300000),'glass',null,'extras','[]'::jsonb,'total',300000)));
 original_contract:=jsonb_build_object('number','CT-ORIGINAL','createdAt','2026-11-15T08:00:00Z','createdBy',indoor,'approvedAt','2026-11-15T08:00:00Z','template','residential',
  'quotation',quote,'terms',jsonb_build_array(jsonb_build_object('title','Saved custom term','text','Keep this exact custom duration and payment text.')),
  'client',jsonb_build_object('name','Original client','mobile','000'),'project',jsonb_build_object('name','Original project','number','Original reference','address','Original address'),
  'agreement2027',jsonb_build_object('total',300000,'paymentSchedule',jsonb_build_array(jsonb_build_object('percent',50,'amount',150000,'trigger','Custom original payment trigger')),
   'readiness',jsonb_build_object('notes',jsonb_build_array('Original annex note')),'openingSpecifications',jsonb_build_array(jsonb_build_object('openingId','original','notes','Original specification')),
   'fields',jsonb_build_object('clientLegalName','Original legal name','companyRepresentativeName','Original company representative','companyRepresentativeSignature','ORIGINAL_COMPANY_SIGNATURE','companyRepresentativeDate','2026-11-15',
    'approvals',jsonb_build_object('salesEngineer',jsonb_build_object('name','Original staff','signature','ORIGINAL_STAFF_SIGNATURE','date','2026-11-15')))));
 insert into public.sales_workflows(project_id,revision,stage,quotation,contract,evidence,signed_at,accepted_by,accepted_at)
 values(target,8,'operations',quote,original_contract,'{"method":"hard_copy","signer":"Original signer"}',now(),administrator,now()),
  (unsigned_target,4,'contract',quote,original_contract,null,null,null,null);
 select to_jsonb(f) into original_flow from public.sales_workflows f where project_id=target;
 select to_jsonb(p) into original_project from public.projects p where id=target;
 select coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb) into original_history from public.quotation_revisions h where project_id=target;

 saved:=public.create_contract_document_revision(target,8,administrator);
 assert saved.status='pending_approval' and saved.revision=1 and saved.document_revision=1;
 assert saved.source_contract=original_contract and saved.source_signed_at is not null;
 assert saved.contract->>'number'='CT-ORIGINAL-R1' and saved.contract->>'createdBy'=administrator::text;
 assert saved.contract->'quotation'=original_contract->'quotation' and saved.contract->'terms'=original_contract->'terms';
 assert saved.contract->'client'=original_contract->'client' and saved.contract->'project'=original_contract->'project';
 assert saved.contract#>'{agreement2027,paymentSchedule}'=original_contract#>'{agreement2027,paymentSchedule}';
 assert saved.contract#>'{agreement2027,readiness}'=original_contract#>'{agreement2027,readiness}';
 assert saved.contract#>'{agreement2027,openingSpecifications}'=original_contract#>'{agreement2027,openingSpecifications}';
 assert saved.contract#>>'{agreement2027,fields,clientLegalName}'='Original legal name';
 assert saved.contract#>>'{agreement2027,fields,companyRepresentativeName}'='Original company representative';
 assert saved.contract#>>'{agreement2027,fields,companyRepresentativeSignature}'='';
 assert saved.contract#>>'{agreement2027,fields,companyRepresentativeDate}'='';
 assert saved.contract#>>'{agreement2027,fields,approvals,salesEngineer,name}'='Original staff';
 assert saved.contract#>>'{agreement2027,fields,approvals,salesEngineer,signature}'='';
 assert saved.contract#>>'{agreement2027,fields,approvals,salesEngineer,date}'='';
 assert not(saved.contract?'approvedAt') and saved.evidence is null and saved.signed_at is null and saved.approved_at is null;
 duplicate:=public.create_contract_document_revision(target,8,administrator);
 assert duplicate.id=saved.id and (select count(*)=1 from public.contract_document_revisions where project_id=target),'Creation is not idempotent';
 unsigned_copy:=public.create_contract_document_revision(unsigned_target,4,administrator);
 assert unsigned_copy.source_signed_at is null and unsigned_copy.status='pending_approval';

 foreach employee in array array[indoor,foreign_indoor,branch_manager,inactive] loop
  begin
   perform public.create_contract_document_revision(target,8,employee);
   raise exception using errcode='ZX001',message='Non-Admin or inactive employee created a revision';
  exception when insufficient_privilege then null; end;
 end loop;
 begin
  perform public.create_contract_document_revision(target,7,administrator);
  raise exception using errcode='ZX001',message='Stale source revision accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.sign_contract_document_revision(saved.id,1,'{"method":"hard_copy","signer":"New signer","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Original approval reused for revised copy';
 exception when invalid_parameter_value then null; end;
 foreach employee in array array[foreign_indoor,branch_manager,inactive] loop
  begin
   perform public.approve_contract_document_revision(saved.id,1,employee);
   raise exception using errcode='ZX001',message='Unauthorized revision approval accepted';
  exception when insufficient_privilege then null; end;
 end loop;
 saved:=public.approve_contract_document_revision(saved.id,1,indoor);
 assert saved.status='approved' and saved.revision=2 and saved.approved_by=indoor and saved.approved_at is not null;
 begin
  perform public.approve_contract_document_revision(saved.id,1,indoor);
  raise exception using errcode='ZX001',message='Stale approval accepted';
 exception when serialization_failure then null; end;
 for invalid in select value from jsonb_array_elements('[{"method":"hard_copy","signer":"New signer"},{"method":"hard_copy","signer":"New signer","confirmed":false},{"method":"hard_copy","signer":" ","confirmed":true},{"method":"upload","signer":"New signer","confirmed":true},{"method":"digital","signer":"New signer","signature":"forged","confirmed":true}]'::jsonb) loop
  begin
   perform public.sign_contract_document_revision(saved.id,2,invalid,indoor);
   raise exception using errcode='ZX001',message='Invalid revised signature accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 saved:=public.sign_contract_document_revision(saved.id,2,'{"method":"hard_copy","signer":"New signer","confirmed":true}',indoor);
 assert saved.status='signed' and saved.revision=3 and saved.evidence->>'signer'='New signer' and saved.signed_at is not null;
 unsigned_copy:=public.approve_contract_document_revision(unsigned_copy.id,1,indoor);
 unsigned_copy:=public.sign_contract_document_revision(unsigned_copy.id,2,jsonb_build_object('method','digital','signer','Digital fixture signer','confirmed',true,
  'signature','data:image/png;base64,'||replace(encode(decode('89504e470d0a1a0a'||repeat('00',600),'hex'),'base64'),E'\n','')),indoor);
 assert unsigned_copy.status='signed' and unsigned_copy.evidence->>'method'='digital' and unsigned_copy.source_signed_at is null;
 begin
  perform public.sign_contract_document_revision(saved.id,3,'{"method":"hard_copy","signer":"Another signer","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Signed revision overwritten';
 exception when invalid_parameter_value then null; end;
 begin
  update public.contract_document_revisions set contract=jsonb_set(contract,'{terms}','[]'),revision=revision+1 where id=saved.id;
  raise exception using errcode='ZX001',message='Revision content overwritten';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.contract_document_revisions where id=saved.id;
  raise exception using errcode='ZX001',message='Revision deleted independently';
 exception when insufficient_privilege then null; end;
 assert (select to_jsonb(f)=original_flow from public.sales_workflows f where project_id=target),'Original workflow changed';
 assert (select to_jsonb(p)=original_project from public.projects p where id=target),'Original project/Operations stage changed';
 assert (select coalesce(jsonb_agg(to_jsonb(h) order by version),'[]'::jsonb)=original_history from public.quotation_revisions h where project_id=target),'Quotation history changed';

 assert not has_table_privilege('anon','public.contract_document_revisions','SELECT');
 assert not has_table_privilege('authenticated','public.contract_document_revisions','SELECT');
 assert not has_table_privilege('service_role','public.contract_document_revisions','INSERT');
 assert not has_table_privilege('service_role','public.contract_document_revisions','UPDATE');
 assert not has_table_privilege('service_role','public.contract_document_revisions','DELETE');
 foreach procedure_name in array array['public.create_contract_document_revision(uuid,integer,uuid)','public.approve_contract_document_revision(uuid,integer,uuid)','public.sign_contract_document_revision(uuid,integer,jsonb,uuid)'] loop
  assert not has_function_privilege('anon',procedure_name,'EXECUTE');
  assert not has_function_privilege('authenticated',procedure_name,'EXECUTE');
  assert has_function_privilege('service_role',procedure_name,'EXECUTE');
 end loop;
 -- Preserve the existing explicitly authorized Admin project-deletion lifecycle.
 -- This deletes only the ephemeral unsigned fixture, inside this rollback block.
 perform public.delete_projects_as_admin(array[unsigned_target],administrator);
 assert not exists(select 1 from public.contract_document_revisions where project_id=unsigned_target),'Revision FK blocked existing Admin project deletion';
end;
$$;
rollback;
