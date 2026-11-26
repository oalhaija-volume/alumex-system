-- Disposable fixtures only. Run after the reviewed migration inside an outer
-- rollback transaction; no real customer, employee or signed document changes.
begin;
set local plpgsql.check_asserts=on;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare
 administrator uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid();
 foreign_employee uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); branch_manager uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 customer uuid; repair_customer uuid; target uuid:=gen_random_uuid(); default_site uuid:=gen_random_uuid(); custom_site uuid:=gen_random_uuid();
 signed_copy_site uuid:=gen_random_uuid(); foreign_site uuid:=gen_random_uuid(); archived_site uuid:=gen_random_uuid(); repair_site uuid:=gen_random_uuid();
 site uuid; employee uuid; quote jsonb; base_contract jsonb; snapshot jsonb; terms jsonb; result jsonb; before_client jsonb;
 target_before public.sales_workflows; default_before jsonb; custom_before jsonb; signed_before jsonb; foreign_before jsonb; archived_before jsonb;
 before_history jsonb; before_openings jsonb; before_unchanged jsonb; audit_count bigint;
 first_target public.contract_document_revisions; first_default public.contract_document_revisions; first_custom public.contract_document_revisions;
 first_signed public.contract_document_revisions; first_foreign public.contract_document_revisions; first_archived public.contract_document_revisions;
 current_copy public.contract_document_revisions; duplicate public.contract_document_revisions; repair_before public.sales_workflows;
 invalid text;
begin
 if current_setting('plpgsql.check_asserts') is distinct from 'on' then raise exception 'Fixture assertions must be enabled.'; end if;
 insert into auth.users(id,email) select id,id||'@example.invalid'
  from unnest(array[administrator,indoor,manager,foreign_employee,outdoor,branch_manager,inactive]) id;
 update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update public.profiles set role='Sales Manager',branch='Karkh',is_active=true,status='Active' where id=manager;
 update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=foreign_employee;
 update public.profiles set role='Outdoor Sales',branch='Karkh',is_active=true,status='Active' where id=outdoor;
 update public.profiles set role='Branch Manager',branch='Karkh',is_active=true,status='Active' where id=branch_manager;
 update public.profiles set role='Admin',is_active=false,status='Inactive' where id=inactive;
 insert into public.clients(client_name,mobile,notes,client_type,company_name,created_by)
 values('Original client','00000000000','Preserved contact note','individual','Independent legal company',indoor) returning id into customer;
 insert into public.projects(id,client_id,project_name,project_number,created_by,branch,structure_readiness,sales_status,status,updated_at)
 values(target,customer,'Selected custom title','NAME-SYNC-'||target,administrator,'Karkh','ready','contract_generated','Contract','2026-01-01T00:00:00Z'),
  (default_site,customer,'Original client','NAME-SYNC-'||default_site,administrator,'Karkh','ready','transferred_to_operations','Production','2026-01-01T00:00:00Z'),
  (custom_site,customer,'Preserved custom site','NAME-SYNC-'||custom_site,administrator,'Karkh','ready','transferred_to_operations','Contract','2026-01-01T00:00:00Z'),
  (signed_copy_site,customer,'Original client','NAME-SYNC-'||signed_copy_site,administrator,'Karkh','ready','transferred_to_operations','Contract','2026-01-01T00:00:00Z'),
  (foreign_site,customer,'Original client','NAME-SYNC-'||foreign_site,administrator,'Rasafa','ready','contract_generated','Contract','2026-01-01T00:00:00Z'),
  (archived_site,customer,'Original client','NAME-SYNC-'||archived_site,administrator,'Karkh','ready','contract_generated','Contract','2026-01-01T00:00:00Z');
 quote:='{"total":300000,"currency":"IQD","version":4,"createdAt":"2026-11-15T08:00:00Z","lines":[{"opening":{"id":"fixture","width":67,"height":39,"quantity":1,"opening_type":"Window","opening_direction":"Hinged"},"area":0.2613,"system":{"id":"hinged","name":"Hinged","unit":"sqm","quantity":1,"rate":300000,"total":300000},"glass":null,"extras":[],"total":300000}]}'::jsonb;
 terms:='[{"title":"Saved custom agreement","text":"Original delivery and payment wording must not change."}]';
 base_contract:=jsonb_build_object('number','CT-NAME-FIXTURE','createdAt','2026-11-15T08:00:00Z','createdBy',indoor,'approvedAt','2026-11-15T08:00:00Z',
  'template','residential','quotation',quote,'terms',terms,'client',jsonb_build_object('name','Original client','mobile','000','client_type','individual'),
  'project',jsonb_build_object('name','Original client','number','Original project reference','address','Original address'),
  'agreement2027',jsonb_build_object('total',300000,'paymentSchedule',jsonb_build_array(jsonb_build_object('percent',50,'amount',150000,'trigger','Original saved payment trigger')),
   'readiness',jsonb_build_object('notes',jsonb_build_array('Original annex note')),'openingSpecifications',jsonb_build_array(jsonb_build_object('openingId','fixture','notes','Original specification')),
   'fields',jsonb_build_object('clientLegalName','Original client','ownerName','Original client','companyName','Independent legal company',
    'companyRepresentativeName','Original company signer','companyRepresentativeSignature','ORIGINAL_COMPANY_SIGNATURE','companyRepresentativeDate','2026-11-15',
    'approvals',jsonb_build_object('salesEngineer',jsonb_build_object('name','Original employee','signature','ORIGINAL_STAFF_SIGNATURE','date','2026-11-15')))));
 foreach site in array array[target,default_site,custom_site,signed_copy_site,foreign_site,archived_site] loop
  snapshot:=jsonb_set(base_contract,'{project,name}',to_jsonb((select project_name from public.projects where id=site)));
  if site=custom_site then
   snapshot:=jsonb_set(jsonb_set(snapshot,'{agreement2027,fields,clientLegalName}','"Independent legal identity"'),'{agreement2027,fields,ownerName}','"Preserved custom site"');
  end if;
  insert into public.sales_workflows(project_id,revision,stage,quotation,contract,evidence,signed_at,accepted_at,accepted_by)
  values(site,6,case when site in(default_site,signed_copy_site) then 'signed' else 'contract' end,quote,snapshot,
   case when site in(default_site,signed_copy_site) then '{"method":"hard_copy","signer":"Original signer"}'::jsonb else null end,
   case when site in(default_site,signed_copy_site) then now() else null end,null,null);
 end loop;
 first_target:=public.create_contract_document_revision(target,6,administrator);
 first_default:=public.create_contract_document_revision(default_site,6,administrator);
 first_custom:=public.create_contract_document_revision(custom_site,6,administrator);
 first_signed:=public.create_contract_document_revision(signed_copy_site,6,administrator);
 first_foreign:=public.create_contract_document_revision(foreign_site,6,administrator);
 first_archived:=public.create_contract_document_revision(archived_site,6,administrator);
 first_custom:=public.approve_contract_document_revision(first_custom.id,1,indoor);
 first_signed:=public.approve_contract_document_revision(first_signed.id,1,indoor);
 first_signed:=public.sign_contract_document_revision(first_signed.id,2,'{"method":"hard_copy","signer":"Original revision signer","confirmed":true}',indoor);
 update public.projects set archived_at=now(),archived_by=administrator,archive_reason='Isolated archive fixture' where id=archived_site;
 insert into public.quotation_revisions(project_id,version,workflow_revision,quotation,contract,previous_stage)
 values(target,1,1,quote,base_contract,'contract');
 select * into target_before from public.sales_workflows where project_id=target;
 select to_jsonb(f) into default_before from public.sales_workflows f where project_id=default_site;
 select to_jsonb(f) into custom_before from public.sales_workflows f where project_id=custom_site;
 select to_jsonb(f) into signed_before from public.sales_workflows f where project_id=signed_copy_site;
 select to_jsonb(f) into foreign_before from public.sales_workflows f where project_id=foreign_site;
 select to_jsonb(f) into archived_before from public.sales_workflows f where project_id=archived_site;
 select to_jsonb(c)-array['client_name','updated_at'] into before_client from public.clients c where id=customer;
 select coalesce(jsonb_agg(to_jsonb(h) order by project_id,version),'[]'::jsonb) into before_history from public.quotation_revisions h where project_id in(target,default_site,custom_site,signed_copy_site,foreign_site,archived_site);
 select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb) into before_openings from public.openings o where project_id in(target,default_site,custom_site,signed_copy_site,foreign_site,archived_site);

 result:=public.rename_project_client(target,indoor,'  Corrected client  ','Original client');
 assert result#>>'{client,id}'=customer::text and result#>>'{client,client_name}'='Corrected client';
 assert jsonb_array_length(result->'projects')=4 and (result->>'documentRevisionsCreated')::int=4;
 assert (select project_name='Corrected client' from public.projects where id=target);
 assert (select project_name='Corrected client' from public.projects where id=default_site);
 assert (select project_name='Preserved custom site' from public.projects where id=custom_site);
 assert (select updated_at>'2026-01-01T00:00:00Z' from public.projects where id=custom_site),'Custom title did not receive a new identity version';
 assert (select project_name='Original client' from public.projects where id=foreign_site);
 assert (select project_name='Original client' from public.projects where id=archived_site);
 assert (select to_jsonb(c)-array['client_name','updated_at']=before_client from public.clients c where id=customer),'Contact/company details changed';
 assert (select quotation=target_before.quotation and stage=target_before.stage and revision=target_before.revision+1 and evidence is null and signed_at is null
  and contract=public.contract_with_corrected_names(target_before.contract,'Corrected client','Corrected client','Original client') from public.sales_workflows where project_id=target),'Unsigned contract did not receive names-only correction';
 assert (select count(*)=1 from public.contract_template_corrections where project_id=target and previous_contract=target_before.contract and corrected_by=indoor);
 assert (select to_jsonb(f)=default_before from public.sales_workflows f where project_id=default_site),'Signed original changed';
 assert (select to_jsonb(f)=custom_before from public.sales_workflows f where project_id=custom_site),'Custom-site signed original changed';
 assert (select to_jsonb(f)=signed_before from public.sales_workflows f where project_id=signed_copy_site),'Already signed document source changed';
 assert (select to_jsonb(f)=foreign_before from public.sales_workflows f where project_id=foreign_site),'Foreign branch flow changed';
 assert (select to_jsonb(f)=archived_before from public.sales_workflows f where project_id=archived_site),'Archived flow changed';
 assert (select to_jsonb(r)=to_jsonb(first_foreign) from public.contract_document_revisions r where id=first_foreign.id),'Foreign branch revision changed';
 assert (select to_jsonb(r)=to_jsonb(first_archived) from public.contract_document_revisions r where id=first_archived.id),'Archived revision changed';
 assert (select to_jsonb(r)=to_jsonb(first_signed) from public.contract_document_revisions r where id=first_signed.id),'Signed document revision changed';
 select * into current_copy from public.contract_document_revisions where project_id=default_site order by document_revision desc limit 1;
 assert current_copy.document_revision=2 and current_copy.revision_reason='client_name_correction' and current_copy.status='pending_approval' and current_copy.revision=1;
 assert current_copy.evidence is null and current_copy.signed_at is null and current_copy.approved_at is null and current_copy.approved_by is null and current_copy.superseded_at is null;
 assert current_copy.source_contract=default_before->'contract' and current_copy.contract#>>'{client,name}'='Corrected client' and current_copy.contract#>>'{project,name}'='Corrected client';
 assert current_copy.contract->'quotation'=quote and current_copy.contract->'terms'=terms;
 assert current_copy.contract#>'{agreement2027,paymentSchedule}'=base_contract#>'{agreement2027,paymentSchedule}';
 assert current_copy.contract#>>'{agreement2027,fields,ownerName}'='Corrected client';
 assert current_copy.contract#>>'{agreement2027,fields,companyName}'='Independent legal company';
 assert current_copy.contract#>>'{agreement2027,fields,companyRepresentativeSignature}'='';
 assert current_copy.contract#>>'{agreement2027,fields,approvals,salesEngineer,signature}'='';
 assert (select contract#>>'{agreement2027,fields,clientLegalName}'='Independent legal identity' and contract#>>'{project,name}'='Preserved custom site'
  and contract#>>'{agreement2027,fields,ownerName}'='Preserved custom site'
  from public.contract_document_revisions where project_id=custom_site order by document_revision desc limit 1),'Explicit legal identity/custom site was overwritten';
 assert (select contract=first_target.contract and source_contract=first_target.source_contract and revision=first_target.revision+1 and superseded_at is not null from public.contract_document_revisions where id=first_target.id),'Old pending content was overwritten';
 assert (select contract=first_custom.contract and approved_at=first_custom.approved_at and approved_by=first_custom.approved_by and superseded_at is not null from public.contract_document_revisions where id=first_custom.id),'Old approval history was overwritten';
 begin
  perform public.approve_contract_document_revision(first_target.id,first_target.revision+1,indoor);
  raise exception using errcode='ZX001',message='Superseded pending copy approved';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.sign_contract_document_revision(first_custom.id,first_custom.revision+1,'{"method":"hard_copy","signer":"Wrong old copy","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Superseded approved copy signed';
 exception when invalid_parameter_value then null; end;
 assert (select coalesce(jsonb_agg(to_jsonb(h) order by project_id,version),'[]'::jsonb)=before_history from public.quotation_revisions h where project_id in(target,default_site,custom_site,signed_copy_site,foreign_site,archived_site)),'Historical snapshots changed';
 assert (select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb)=before_openings from public.openings o where project_id in(target,default_site,custom_site,signed_copy_site,foreign_site,archived_site)),'Measurements changed';
 select jsonb_build_object('projects',(select jsonb_agg(to_jsonb(p) order by id) from public.projects p where client_id=customer),'flows',(select jsonb_agg(to_jsonb(f) order by project_id) from public.sales_workflows f where project_id in(select id from public.projects where client_id=customer)),
  'revisions',(select jsonb_agg(to_jsonb(r) order by project_id,document_revision) from public.contract_document_revisions r where project_id in(select id from public.projects where client_id=customer)),
  'audit',(select count(*) from public.audit_events where entity_id=customer or entity_id in(select id from public.projects where client_id=customer))) into before_unchanged;
 result:=public.rename_project_client(target,indoor,' Corrected client ','Corrected client');
 assert result->>'documentRevisionsCreated'='0';
 assert before_unchanged=jsonb_build_object('projects',(select jsonb_agg(to_jsonb(p) order by id) from public.projects p where client_id=customer),'flows',(select jsonb_agg(to_jsonb(f) order by project_id) from public.sales_workflows f where project_id in(select id from public.projects where client_id=customer)),
  'revisions',(select jsonb_agg(to_jsonb(r) order by project_id,document_revision) from public.contract_document_revisions r where project_id in(select id from public.projects where client_id=customer)),
  'audit',(select count(*) from public.audit_events where entity_id=customer or entity_id in(select id from public.projects where client_id=customer))),'No-op rename made changes';
 result:=public.rename_project_client(target,manager,'Second correction','Corrected client');
 assert result->>'documentRevisionsCreated'='4';
 assert (select max(document_revision)=3 from public.contract_document_revisions where project_id=default_site),'Repeated signed correction collided with opening-copy uniqueness';
 duplicate:=public.create_contract_document_revision(default_site,6,administrator);
 assert duplicate.id=first_default.id,'Opening-copy idempotency returned a name correction';
 assert (select to_jsonb(f)=default_before from public.sales_workflows f where project_id=default_site),'Repeated rename changed signed original';

 -- PRJ-202611-0097 analogue: client already corrected, project/main contract
 -- still old, and an older pending opening copy must be replaced safely.
 insert into public.clients(client_name,mobile,created_by) values('Already corrected','00000000000',indoor) returning id into repair_customer;
 insert into public.projects(id,client_id,project_name,project_number,created_by,branch,structure_readiness,sales_status,status)
 values(repair_site,repair_customer,'Stale display name','NAME-REPAIR-'||repair_site,administrator,'Karkh','ready','contract_generated','Contract');
 snapshot:=jsonb_set(jsonb_set(base_contract,'{client,name}','"Stale display name"'),'{project,name}','"Stale display name"');
 insert into public.sales_workflows(project_id,revision,stage,quotation,contract) values(repair_site,5,'contract',quote,snapshot);
 duplicate:=public.create_contract_document_revision(repair_site,5,administrator);
 update public.sales_workflows set contract=jsonb_set(contract,'{agreement2027,fields,clientLegalName}','"Already corrected"'),revision=6 where project_id=repair_site;
 select * into repair_before from public.sales_workflows where project_id=repair_site;
 select to_jsonb(c) into before_client from public.clients c where id=repair_customer;
 result:=public.rename_project_client(repair_site,indoor,'Already corrected','Already corrected');
 assert result->>'documentRevisionsCreated'='1' and (select project_name='Already corrected' from public.projects where id=repair_site);
 assert (select to_jsonb(c)=before_client from public.clients c where id=repair_customer),'A repair rewrote unchanged contact data';
 assert (select contract#>>'{client,name}'='Already corrected' and contract#>>'{project,name}'='Already corrected' and contract#>>'{agreement2027,fields,clientLegalName}'='Already corrected'
  and quotation=repair_before.quotation and revision=7 and stage='contract' from public.sales_workflows where project_id=repair_site);
 assert (select contract=duplicate.contract and superseded_at is not null from public.contract_document_revisions where id=duplicate.id),'Repair rewrote old pending snapshot';

 -- An unsigned source cannot bypass the fresh correction approval/signature.
 begin
  perform public.advance_sales_flow(repair_site,'sign',7,'{"method":"hard_copy","signer":"Bypassed signer","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Original unsigned contract bypassed fresh correction approval';
 exception when invalid_parameter_value then null; end;
 select * into current_copy from public.contract_document_revisions where project_id=repair_site order by document_revision desc limit 1;
 current_copy:=public.approve_contract_document_revision(current_copy.id,current_copy.revision,indoor);
 -- A subsequent detail/price revision must invalidate signing the frozen copy.
 update public.sales_workflows set revision=revision+1 where project_id=repair_site;
 begin
  perform public.sign_contract_document_revision(current_copy.id,current_copy.revision,'{"method":"hard_copy","signer":"Stale signer","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Stale source revision signed';
 exception when serialization_failure then null; end;
 assert (select status='approved' and evidence is null from public.contract_document_revisions where id=current_copy.id),'Failed signing did not roll back';
 update public.sales_workflows set revision=7 where project_id=repair_site;
 update public.sales_workflows set contract=jsonb_set(contract,'{quotation,total}','300001') where project_id=repair_site;
 begin
  perform public.sign_contract_document_revision(current_copy.id,current_copy.revision,'{"method":"hard_copy","signer":"Stale price signer","confirmed":true}',indoor);
  raise exception using errcode='ZX001',message='Stale source content signed';
 exception when serialization_failure then null; end;
 update public.sales_workflows set contract=current_copy.source_contract where project_id=repair_site;
 current_copy:=public.sign_contract_document_revision(current_copy.id,current_copy.revision,'{"method":"hard_copy","signer":"Fresh corrected client","confirmed":true}',indoor);
 assert current_copy.status='signed' and current_copy.revision=3 and current_copy.evidence->>'signer'='Fresh corrected client';
 assert (select stage='signed' and revision=8 and signed_at is not null and evidence->>'signer'='Fresh corrected client'
  and approved_at=current_copy.approved_at and approved_by=current_copy.approved_by
  and contract=current_copy.contract||jsonb_build_object('approvedAt',current_copy.approved_at)
  and quotation=quote from public.sales_workflows where project_id=repair_site),'Revised unsigned contract did not complete normal signing';
 assert (select sales_status='transferred_to_operations' from public.projects where id=repair_site),'Corrected signed contract did not reach Operations';
 select * into current_copy from public.contract_document_revisions where project_id=custom_site order by document_revision desc limit 1;
 current_copy:=public.approve_contract_document_revision(current_copy.id,current_copy.revision,indoor);
 current_copy:=public.sign_contract_document_revision(current_copy.id,current_copy.revision,
  jsonb_build_object('method','digital','signer','Fresh legacy client','confirmed',true,'signature','data:image/png;base64,'||replace(encode(decode('89504e470d0a1a0a','hex')||decode(repeat('00',400),'hex'),'base64'),E'\n','')),indoor);
 assert current_copy.status='signed';
 assert (select to_jsonb(f)=custom_before from public.sales_workflows f where project_id=custom_site),'Legacy executed source was promoted or mutated';
 select * into current_copy from public.contract_document_revisions where project_id=default_site order by document_revision desc limit 1;
 current_copy:=public.approve_contract_document_revision(current_copy.id,current_copy.revision,indoor);
 current_copy:=public.sign_contract_document_revision(current_copy.id,current_copy.revision,'{"method":"hard_copy","signer":"Fresh already signed client","confirmed":true}',indoor);
 assert (select to_jsonb(f)=default_before from public.sales_workflows f where project_id=default_site),'Signing a revised executed contract changed its original';
 foreach employee in array array[foreign_employee,outdoor,branch_manager,inactive] loop
  begin
   perform public.rename_project_client(target,employee,'Forbidden','Second correction');
   raise exception using errcode='ZX001',message='Unauthorized rename accepted';
  exception when insufficient_privilege then null; end;
 end loop;
 foreach invalid in array array[null::text,'','   ',repeat('ع',151)] loop
  begin
   perform public.rename_project_client(target,indoor,invalid,'Second correction');
   raise exception using errcode='ZX001',message='Invalid name accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.rename_project_client(target,indoor,'Stale','Original client');
  raise exception using errcode='ZX001',message='Stale client editor accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='This client changed on another device. Reload the projects before changing its name.'; end;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub',foreign_employee::text,true);
 begin
  perform public.rename_project_client(target,indoor,'Spoofed','Second correction');
  raise exception using errcode='ZX001',message='Spoofed actor accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.role','service_role',true);
 assert not has_function_privilege('anon','public.rename_project_client(uuid,uuid,text,text)','execute');
 assert not has_function_privilege('authenticated','public.rename_project_client(uuid,uuid,text,text)','execute');
 assert has_function_privilege('service_role','public.rename_project_client(uuid,uuid,text,text)','execute');
end;
$$;
rollback;
