begin;

alter table public.contract_document_revisions
 add column revision_reason text not null default 'opening_schedule'
  check(revision_reason in ('opening_schedule','client_name_correction')),
 add column superseded_at timestamptz;
alter table public.contract_document_revisions add constraint signed_document_revision_not_superseded
 check(status<>'signed' or superseded_at is null);

-- These pure helpers never read current customer/catalog data. Every revised
-- document retains its source quote, prices, terms, dates and specifications.
create function public.clear_contract_document_signatures(p_contract jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb:=p_contract-'approvedAt'; fields jsonb; approvals jsonb;
begin
 if jsonb_typeof(result#>'{agreement2027,fields}')='object' then
  fields:=(result#>'{agreement2027,fields}')||jsonb_build_object('companyRepresentativeSignature','','companyRepresentativeDate','');
  if jsonb_typeof(fields->'approvals')='object' then
   select coalesce(jsonb_object_agg(key,case when jsonb_typeof(value)='object' then value||jsonb_build_object('signature','','date','') else value end),'{}'::jsonb)
    into approvals from jsonb_each(fields->'approvals');
   fields:=jsonb_set(fields,'{approvals}',approvals);
  end if;
  result:=jsonb_set(result,'{agreement2027,fields}',fields);
 end if;
 return result;
end;
$$;

create function public.contract_with_corrected_names(p_contract jsonb,p_client_name text,p_project_name text,p_previous_client_name text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb:=p_contract; field_name text; previous_value text;
 aliases text[]:=array[p_previous_client_name,p_contract#>>'{client,name}'];
begin
 if jsonb_typeof(result->'client')='object' then result:=jsonb_set(result,'{client,name}',to_jsonb(p_client_name)); end if;
 if jsonb_typeof(result->'project')='object' then result:=jsonb_set(result,'{project,name}',to_jsonb(p_project_name)); end if;
 if jsonb_typeof(result#>'{agreement2027,fields}')='object' then
  foreach field_name in array array['clientLegalName','ownerName','companyName'] loop
   previous_value:=p_contract#>>array['agreement2027','fields',field_name];
   if coalesce(previous_value,'')<>'' and previous_value=any(aliases) then
    result:=jsonb_set(result,array['agreement2027','fields',field_name],to_jsonb(p_client_name));
   end if;
  end loop;
 end if;
 return result;
end;
$$;

create function public.contract_document_content_valid(p_source jsonb,p_contract jsonb,p_reason text)
returns boolean language plpgsql immutable set search_path=public as $$
declare original jsonb:=public.clear_contract_document_signatures(p_source)-array['number','createdAt','createdBy','approvedAt'];
 revised jsonb:=p_contract-array['number','createdAt','createdBy','approvedAt'];
 field_name text; old_value jsonb; new_value jsonb;
begin
 if p_contract is distinct from public.clear_contract_document_signatures(p_contract) then return false; end if;
 if p_reason='opening_schedule' then return original is not distinct from revised; end if;
 if p_reason is distinct from 'client_name_correction' or jsonb_typeof(p_contract->'client') is distinct from 'object'
  or jsonb_typeof(p_contract->'project') is distinct from 'object'
  or jsonb_typeof(p_source->'client') is distinct from 'object' or jsonb_typeof(p_source->'project') is distinct from 'object'
  or jsonb_typeof(p_contract#>'{client,name}') is distinct from 'string'
  or jsonb_typeof(p_contract#>'{project,name}') is distinct from 'string'
  or length(btrim(p_contract#>>'{client,name}')) not between 1 and 150
  or length(btrim(p_contract#>>'{project,name}')) not between 1 and 150 then return false; end if;
 original:=jsonb_set(jsonb_set(original,'{client}',(original->'client')-'name'),'{project}',(original->'project')-'name');
 revised:=jsonb_set(jsonb_set(revised,'{client}',(revised->'client')-'name'),'{project}',(revised->'project')-'name');
 if jsonb_typeof(original#>'{agreement2027,fields}')='object' then
  foreach field_name in array array['clientLegalName','ownerName','companyName'] loop
   old_value:=original#>array['agreement2027','fields',field_name];
   new_value:=revised#>array['agreement2027','fields',field_name];
   if old_value is distinct from new_value and new_value is distinct from p_contract#>'{client,name}' then return false; end if;
   original:=original#-array['agreement2027','fields',field_name];
   revised:=revised#-array['agreement2027','fields',field_name];
  end loop;
 end if;
 return original is not distinct from revised;
end;
$$;

revoke all on function public.clear_contract_document_signatures(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.contract_with_corrected_names(jsonb,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.contract_document_content_valid(jsonb,jsonb,text) from public,anon,authenticated,service_role;

-- Replace only exact source-name checks and opening-copy deduplication. Prices,
-- terms, template, agreement/payment data and immutable rows keep their guards.
do $revision_constraints$
declare saved record; name_key text; expected text;
begin
 foreach name_key in array array['client','project'] loop
  expected:=format('CHECK ((NOT ((contract -> %L::text) IS DISTINCT FROM (source_contract -> %L::text))))',name_key,name_key);
  select conname into saved from pg_constraint where conrelid='public.contract_document_revisions'::regclass and contype='c' and pg_get_constraintdef(oid)=expected;
  if not found then raise exception 'Unexpected contract source-name constraint.'; end if;
  execute format('alter table public.contract_document_revisions drop constraint %I',saved.conname);
 end loop;
 select conname into saved from pg_constraint where conrelid='public.contract_document_revisions'::regclass and contype='u'
  and pg_get_constraintdef(oid)='UNIQUE (project_id, source_workflow_revision, format_version)';
 if not found then raise exception 'Unexpected contract document revision uniqueness.'; end if;
 execute format('alter table public.contract_document_revisions drop constraint %I',saved.conname);
end;
$revision_constraints$;
alter table public.contract_document_revisions add constraint contract_document_content_preserved
 check(public.contract_document_content_valid(source_contract,contract,revision_reason));
create unique index contract_document_opening_source_key on public.contract_document_revisions(project_id,source_workflow_revision,format_version)
 where revision_reason='opening_schedule';

do $revision_lifecycle$
declare definition text; old_guard text; new_guard text; routine text;
begin
 select pg_get_functiondef('public.protect_contract_document_revision()'::regprocedure) into definition;
 old_guard:='array[''status'',''revision'',''approved_at'',''approved_by'',''signed_at'',''evidence'']';
 if cardinality(string_to_array(definition,old_guard))<>3 or position('if OLD.status=''pending_approval'' and NEW.status=''approved''' in definition)=0 then
  raise exception 'Unexpected contract document immutability guard.';
 end if;
 definition:=replace(definition,old_guard,'array[''status'',''revision'',''approved_at'',''approved_by'',''signed_at'',''evidence'',''superseded_at'']');
 old_guard:=' if OLD.status=''pending_approval'' and NEW.status=''approved''';
 new_guard:=$guard$ if OLD.superseded_at is not null then
  raise exception using errcode='42501',message='A superseded contract revision is read-only.';
 end if;
 if OLD.status in ('pending_approval','approved') and NEW.status=OLD.status and NEW.superseded_at is not null
  and NEW.approved_at is not distinct from OLD.approved_at and NEW.approved_by is not distinct from OLD.approved_by
  and NEW.signed_at is not distinct from OLD.signed_at and NEW.evidence is not distinct from OLD.evidence then return NEW; end if;
 if NEW.superseded_at is distinct from OLD.superseded_at then
  raise exception using errcode='42501',message='Signed contract revisions cannot be superseded.';
 end if;
 if OLD.status='pending_approval' and NEW.status='approved'$guard$;
 if cardinality(string_to_array(definition,old_guard))<>2 then raise exception 'Unexpected contract revision transition guard.'; end if;
 execute replace(definition,old_guard,new_guard);

 select pg_get_functiondef('public.create_contract_document_revision(uuid,integer,uuid)'::regprocedure) into definition;
 old_guard:='where project_id=p_project and source_workflow_revision=p_source_revision and format_version=''billable-opening-schedule-v1'';';
 if cardinality(string_to_array(definition,old_guard))<>2 then raise exception 'Unexpected opening document revision lookup.'; end if;
 execute replace(definition,old_guard,'where project_id=p_project and source_workflow_revision=p_source_revision and format_version=''billable-opening-schedule-v1'' and revision_reason=''opening_schedule'';');

 foreach routine in array array['public.approve_contract_document_revision(uuid,integer,uuid)','public.sign_contract_document_revision(uuid,integer,jsonb,uuid)'] loop
  select pg_get_functiondef(routine::regprocedure) into definition;
  old_guard:=' select * into saved from public.contract_document_revisions where id=p_id for update;';
  if cardinality(string_to_array(definition,old_guard))<>2 then raise exception 'Unexpected contract approval/signature row lock.'; end if;
  definition:=replace(definition,old_guard,$guard$ perform public.require_indoor_project_branch((select project_id from public.contract_document_revisions where id=p_id),p_actor);
 select * into saved from public.contract_document_revisions where id=p_id for update;$guard$);
  old_guard:=' if p_revision is null or saved.revision is distinct from p_revision then';
  if cardinality(string_to_array(definition,old_guard))<>2 then raise exception 'Unexpected contract approval/signature revision guard.'; end if;
  execute replace(definition,old_guard,$guard$ if saved.superseded_at is not null then
  raise exception using errcode='22023',message='This contract revision was superseded. Open the latest revised contract.';
 end if;
 if p_revision is null or saved.revision is distinct from p_revision then$guard$);
 end loop;
end;
$revision_lifecycle$;

-- A corrected unsigned contract must complete the normal sales handoff after
-- its fresh approval/signature. Executed source workflows remain untouched.
do $corrected_contract_handoff$
declare definition text; anchor text;
begin
 select pg_get_functiondef('public.sign_contract_document_revision(uuid,integer,jsonb,uuid)'::regprocedure) into definition;
 anchor:=' signed_evidence jsonb;';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'Unexpected revision signature declarations.'; end if;
 definition:=replace(definition,anchor,' signed_evidence jsonb; source_flow public.sales_workflows; source_project public.projects; promote_main boolean:=false;');
 anchor:=' select * into saved from public.contract_document_revisions where id=p_id for update;';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'Unexpected revision signing lock order.'; end if;
 definition:=replace(definition,anchor,$handoff$ perform 1 from public.sales_workflows
  where project_id=(select project_id from public.contract_document_revisions where id=p_id) for update;
 select * into saved from public.contract_document_revisions where id=p_id for update;$handoff$);
 anchor:=' update public.contract_document_revisions set status=''signed'',revision=revision+1,signed_at=now(),evidence=signed_evidence where id=p_id returning * into saved;';
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'Unexpected revision signature transition.'; end if;
 definition:=replace(definition,anchor,$handoff$ if saved.revision_reason='client_name_correction' then
  select * into source_project from public.projects where id=saved.project_id;
  select * into source_flow from public.sales_workflows where project_id=saved.project_id for update;
  if not found then raise exception using errcode='40001',message='The source contract changed. Reload before signing the revised copy.'; end if;
  promote_main:=source_flow.signed_at is null and source_flow.evidence is null and source_flow.accepted_at is null and source_flow.accepted_by is null
   and source_flow.stage not in ('signed','operations') and source_project.sales_status not in ('contract_signed','transferred_to_operations');
  if promote_main and (source_flow.stage is distinct from 'contract' or source_project.sales_status is distinct from 'contract_generated'
   or source_flow.revision is distinct from saved.source_workflow_revision or source_flow.contract is distinct from saved.source_contract) then
   raise exception using errcode='40001',message='The source contract changed. Correct its names again before signing the revised copy.';
  end if;
 end if;
 update public.contract_document_revisions set status='signed',revision=revision+1,signed_at=now(),evidence=signed_evidence where id=p_id returning * into saved;
 if promote_main then
  update public.sales_workflows set contract=saved.contract||jsonb_build_object('approvedAt',saved.approved_at),
   approved_at=saved.approved_at,approved_by=saved.approved_by where project_id=saved.project_id;
  perform public.advance_sales_flow(saved.project_id,'sign',source_flow.revision,signed_evidence,p_actor);
 end if;$handoff$);
 execute definition;

 select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure) into definition;
 anchor:=$guard$ elsif p_action='sign' then
  if f.stage <> 'contract' or f.stage is null then raise exception 'Generate the contract first'; end if;$guard$;
 if cardinality(string_to_array(definition,anchor))<>2 then raise exception 'Unexpected sales contract signing guard.'; end if;
 execute replace(definition,anchor,anchor||$guard$
  if exists(select 1 from public.contract_document_revisions r where r.project_id=p_project
   and r.revision_reason='client_name_correction' and r.superseded_at is null and r.status in ('pending_approval','approved')) then
   raise exception using errcode='22023',message='Approve and sign the latest corrected contract before continuing.';
  end if;$guard$);
end;
$corrected_contract_handoff$;

create or replace function public.rename_project_client(p_project uuid,p_actor uuid,p_client_name text,p_expected_client_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 employee public.profiles; project public.projects; customer public.clients; site public.projects;
 flow public.sales_workflows; latest public.contract_document_revisions; created public.contract_document_revisions;
 renamed_client text; renamed_company text; renamed_project text; corrected_contract jsonb; candidate jsonb;
 before_contract jsonb; is_executed boolean; has_latest boolean; needs_copy boolean; contract_changed boolean;
 next_document integer; created_count integer:=0; updated_projects jsonb:='[]'; correlation uuid:=gen_random_uuid();
begin
 if auth.role()='authenticated' and p_actor is distinct from auth.uid() then raise exception using errcode='42501',message='The actor does not match the authenticated user.'; end if;
 select * into employee from public.profiles where id=p_actor for share;
 if employee.id is null or employee.is_active is not true or employee.status is distinct from 'Active'
  or (employee.role is distinct from 'Admin' and public.sales_permission_role(employee.role) is distinct from 'Indoor Sales') then
  raise exception using errcode='42501',message='Only Admin, Indoor Sales and Sales Managers can change client names.';
 end if;
 select * into project from public.projects where id=p_project;
 if not found or project.archived_at is not null or not public.employee_can_access_project_row(p_actor,
  public.effective_project_branch(project.branch,project.governorate,project.governorate_office),project.created_by,project.assigned_outdoor_sales_id,null) then
  raise exception using errcode='42501',message='Project is not available to this employee';
 end if;
 renamed_client:=regexp_replace(p_client_name,'^[[:space:]]+|[[:space:]]+$','','g');
 if renamed_client is null or renamed_client='' or length(renamed_client)>150 then raise exception using errcode='22023',message='Enter a client name of 1 to 150 characters.'; end if;
 -- Lock the shared client before project rows so two projects of that client
 -- cannot deadlock each other while synchronizing their visible documents.
 select * into customer from public.clients where id=project.client_id for update;
 if not found then raise exception using errcode='42501',message='Client is not available to this employee'; end if;
 perform public.require_indoor_project_branch(p_project,p_actor);
 if not exists(select 1 from public.projects where id=p_project and client_id=customer.id and archived_at is null) then
  raise exception using errcode='40001',message='The project changed. Reload and try again.';
 end if;
 if p_expected_client_name is null or customer.client_name is distinct from p_expected_client_name then
  raise exception 'This client changed on another device. Reload the projects before changing its name.';
 end if;
 renamed_company:=case when customer.client_type='company' and customer.company_name=customer.client_name then renamed_client else customer.company_name end;
 if customer.client_name is distinct from renamed_client or customer.company_name is distinct from renamed_company then
  update public.clients set client_name=renamed_client,company_name=renamed_company where id=customer.id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,correlation_id)
  values(p_actor,employee.role,'client_renamed','client',customer.id,jsonb_build_object('client_name',customer.client_name,'company_name',customer.company_name),jsonb_build_object('client_name',renamed_client,'company_name',renamed_company),correlation);
 end if;
 for site in select p.* from public.projects p where p.client_id=customer.id and p.archived_at is null
  and public.employee_can_access_project_row(p_actor,public.effective_project_branch(p.branch,p.governorate,p.governorate_office),p.created_by,p.assigned_outdoor_sales_id,null)
  order by p.id for update loop
  renamed_project:=case when site.id=p_project or site.project_name=customer.client_name then renamed_client else site.project_name end;
  if site.project_name is distinct from renamed_project or customer.client_name is distinct from renamed_client then
   update public.projects set project_name=renamed_project where id=site.id;
  end if;
  if site.project_name is distinct from renamed_project then
   insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,correlation_id)
   values(p_actor,employee.role,'project_renamed','project',site.id,jsonb_build_object('project_name',site.project_name),jsonb_build_object('project_name',renamed_project),correlation);
  end if;
  select * into flow from public.sales_workflows where project_id=site.id for update;
  if found and jsonb_typeof(flow.contract)='object' then
   before_contract:=flow.contract;
   corrected_contract:=public.contract_with_corrected_names(flow.contract,renamed_client,renamed_project,customer.client_name);
   is_executed:=flow.signed_at is not null or flow.evidence is not null or flow.accepted_at is not null or flow.accepted_by is not null or flow.stage in ('signed','operations')
    or site.sales_status in ('contract_signed','transferred_to_operations');
   contract_changed:=corrected_contract is distinct from flow.contract;
   if not is_executed and contract_changed then
    insert into public.contract_template_corrections(project_id,workflow_revision,previous_contract,replacement_contract,corrected_by)
    values(site.id,flow.revision+1,flow.contract,corrected_contract,p_actor);
    update public.sales_workflows set contract=corrected_contract,revision=revision+1,updated_at=now() where project_id=site.id returning * into flow;
   end if;
   candidate:=public.clear_contract_document_signatures(case when is_executed then corrected_contract else flow.contract end);
   select * into latest from public.contract_document_revisions where project_id=site.id and superseded_at is null order by document_revision desc limit 1 for update;
   has_latest:=found;
   needs_copy:=(contract_changed or site.project_name is distinct from renamed_project or customer.client_name is distinct from renamed_client or has_latest)
    and (not has_latest or latest.source_workflow_revision is distinct from flow.revision or latest.source_contract is distinct from flow.contract
     or latest.contract-array['number','createdAt','createdBy','approvedAt'] is distinct from candidate-array['number','createdAt','createdBy','approvedAt']);
   if needs_copy then
    if site.project_name is not distinct from renamed_project and customer.client_name is not distinct from renamed_client then
     update public.projects set updated_at=now() where id=site.id;
    end if;
    update public.contract_document_revisions set superseded_at=now(),revision=revision+1
     where project_id=site.id and status in ('pending_approval','approved') and superseded_at is null;
    select coalesce(max(document_revision),0)+1 into next_document from public.contract_document_revisions where project_id=site.id;
    candidate:=candidate||jsonb_build_object('number',flow.contract->>'number'||'-R'||next_document,'createdAt',now(),'createdBy',p_actor);
    insert into public.contract_document_revisions(project_id,document_revision,source_workflow_revision,source_contract,contract,format_version,source_signed_at,created_by,revision_reason)
    values(site.id,next_document,flow.revision,flow.contract,candidate,'billable-opening-schedule-v1',flow.signed_at,p_actor,'client_name_correction') returning * into created;
    created_count:=created_count+1;
    insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,correlation_id)
    values(p_actor,employee.role,'contract_client_names_corrected','project',site.id,
     jsonb_build_object('client_name',before_contract#>>'{client,name}','project_name',before_contract#>>'{project,name}'),
     jsonb_build_object('client_name',renamed_client,'project_name',renamed_project,'document_revision_id',created.id,'original_signed_contract_preserved',is_executed),correlation);
   end if;
  end if;
  select p.updated_at into site.updated_at from public.projects p where p.id=site.id;
  updated_projects:=updated_projects||jsonb_build_array(jsonb_build_object('id',site.id,'project_name',renamed_project,'updated_at',site.updated_at));
 end loop;
 return jsonb_build_object('client',jsonb_build_object('id',customer.id,'client_name',renamed_client),'projects',updated_projects,'documentRevisionsCreated',created_count);
end;
$$;

notify pgrst,'reload schema';
commit;
