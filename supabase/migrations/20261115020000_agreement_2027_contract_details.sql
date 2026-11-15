begin;

-- Supplemental agreement fields are part of the immutable contract snapshot.
-- Editing an unsigned agreement preserves its approved quotation and records
-- exact before/after documents under the existing correction history.
create or replace function public.update_agreement_contract(
 p_project uuid,p_revision integer,p_agreement jsonb,p_terms jsonb,p_template text,p_actor uuid
) returns public.sales_workflows
language plpgsql security definer set search_path=public as $$
declare
 project public.projects;
 flow public.sales_workflows;
 actor_role public.app_role;
 replacement jsonb;
 total numeric;
 allocated numeric:=0;
 expected_amount numeric;
 percentages integer[];
 stage jsonb;
 stage_index integer;
begin
 perform public.require_indoor_project_branch(p_project,p_actor);
 select role into actor_role from public.profiles where id=p_actor and is_active and status='Active';
 if actor_role is null or public.sales_permission_role(actor_role)::text not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then
  raise exception using errcode='42501',message='Quotations and contracts are handled by Indoor Sales and company leadership.';
 end if;
 select * into project from public.projects where id=p_project for update;
 if not found or project.archived_at is not null then raise exception using errcode='42501',message='Project not found.'; end if;
 select * into flow from public.sales_workflows where project_id=p_project for update;
 if not found or p_revision is null or flow.revision<>p_revision then
  raise exception using errcode='40001',message='The project changed. Reload and try again.';
 end if;
 if project.additional_openings_state is not null then
  raise exception using errcode='22023',message='Complete the additional measurements and save a quotation revision before continuing.';
 end if;
 if project.sales_status is distinct from 'contract_generated' or flow.stage is distinct from 'contract'
  or flow.signed_at is not null or flow.evidence is not null or flow.accepted_at is not null or flow.accepted_by is not null then
  raise exception using errcode='42501',message='Only an unsigned generated contract can have its details changed.';
 end if;
 if flow.contract#>>'{agreement2027,version}' is distinct from 'agreement-2027' then
  raise exception using errcode='22023',message='Only an unsigned 2027 contract can have its details changed.';
 end if;
 if p_template is null or p_template not in ('residential','commercial') then
  raise exception using errcode='22023',message='Choose the residential or commercial contract template.';
 end if;
 if jsonb_typeof(p_terms) is distinct from 'array' then
  raise exception using errcode='22023',message='Contract template terms are invalid.';
 end if;
 if jsonb_array_length(p_terms)<>19 or exists(select 1 from jsonb_array_elements(p_terms) section
  where jsonb_typeof(section) is distinct from 'object'
   or jsonb_typeof(section->'title') is distinct from 'string' or jsonb_typeof(section->'text') is distinct from 'string'
   or length(btrim(section->>'title')) not between 1 and 500 or length(btrim(section->>'text')) not between 1 and 20000) then
  raise exception using errcode='22023',message='Contract template terms are invalid.';
 end if;
 if jsonb_typeof(p_agreement) is distinct from 'object'
  or p_agreement->>'version' is distinct from 'agreement-2027'
  or p_agreement->>'sourceDocument' is distinct from 'عقد اتفاق 2027.pdf'
  or jsonb_typeof(p_agreement->'fields') is distinct from 'object'
  or jsonb_typeof(p_agreement->'openingSpecifications') is distinct from 'array'
  or p_agreement->'openingSpecifications' is distinct from flow.contract#>'{agreement2027,openingSpecifications}'
  or jsonb_typeof(p_agreement->'readiness') is distinct from 'object'
  or p_agreement->'readiness' is distinct from flow.contract#>'{agreement2027,readiness}'
  or jsonb_typeof(p_agreement->'specificationNotes') is distinct from 'array'
  or p_agreement->'specificationNotes' is distinct from flow.contract#>'{agreement2027,specificationNotes}'
  or jsonb_typeof(p_agreement->'amountInWords') is distinct from 'string'
  or length(btrim(p_agreement->>'amountInWords')) not between 1 and 2000
  or jsonb_typeof(p_agreement->'total') is distinct from 'number'
  or jsonb_typeof(p_agreement->'paymentSchedule') is distinct from 'array' then
  raise exception using errcode='22023',message='Contract agreement details are invalid.';
 end if;
 total:=(p_agreement->>'total')::numeric;
 if total<0 or total>9007199254740991 or total<>trunc(total)
  or p_agreement->'total' is distinct from flow.contract#>'{quotation,total}'
  or flow.contract->'quotation' is distinct from flow.quotation then
  raise exception using errcode='22023',message='Contract amounts must match the approved quotation.';
 end if;
 percentages:=case when total<15000000 then array[100] when p_template='residential' then array[50,50] else array[30,20,10,20,15,5] end;
 if jsonb_array_length(p_agreement->'paymentSchedule')<>cardinality(percentages) then
  raise exception using errcode='22023',message='Contract payment schedule is invalid.';
 end if;
 for stage_index in 1..cardinality(percentages) loop
  stage:=p_agreement->'paymentSchedule'->(stage_index-1);
  expected_amount:=case when stage_index=cardinality(percentages) then total-allocated else round(total*percentages[stage_index]/100) end;
  if jsonb_typeof(stage) is distinct from 'object'
   or jsonb_typeof(stage->'percent') is distinct from 'number' or (stage->>'percent')::numeric<>percentages[stage_index]
   or jsonb_typeof(stage->'amount') is distinct from 'number' or (stage->>'amount')::numeric<>expected_amount
   or jsonb_typeof(stage->'id') is distinct from 'string' or length(btrim(stage->>'id')) not between 1 and 100
   or jsonb_typeof(stage->'label') is distinct from 'string' or length(btrim(stage->>'label')) not between 1 and 500
   or jsonb_typeof(stage->'trigger') is distinct from 'string' or length(btrim(stage->>'trigger')) not between 1 and 2000 then
   raise exception using errcode='22023',message='Contract payment schedule is invalid.';
  end if;
  allocated:=allocated+expected_amount;
 end loop;
 replacement:=flow.contract||jsonb_build_object('template',p_template,'terms',p_terms,'agreement2027',p_agreement);
 insert into public.contract_template_corrections(project_id,workflow_revision,previous_contract,replacement_contract,corrected_by)
 values(p_project,flow.revision+1,flow.contract,replacement,p_actor);
 update public.sales_workflows set contract=replacement,revision=flow.revision+1,updated_at=now()
 where project_id=p_project returning * into flow;
 return flow;
end;
$$;
revoke all on function public.update_agreement_contract(uuid,integer,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.update_agreement_contract(uuid,integer,jsonb,jsonb,text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
