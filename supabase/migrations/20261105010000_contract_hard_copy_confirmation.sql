begin;

-- Extend the installed transaction so paper signatures use the same revision,
-- employee/branch permissions, audit identity and Operations handoff as uploads.
do $hard_copy$
declare
  definition text;
  original_guard text := $previous$if coalesce(p_payload->>'signer','')='' or coalesce(p_payload->>'method','') not in ('digital','upload') then raise exception 'Signed evidence required'; end if;$previous$;
  replacement text := $replacement$-- A staff attestation records a signed paper contract without inventing an attachment.
  if f.signed_at is not null or f.evidence is not null or f.accepted_at is not null or f.accepted_by is not null then
   raise exception 'Signed contracts cannot be changed.';
  end if;
  if coalesce(p_payload->>'signer','')='' or coalesce(p_payload->>'method','') not in ('digital','upload','hard_copy') then raise exception 'Signed evidence required'; end if;
  if p_payload->>'method'='hard_copy' then
   if project.sales_status is distinct from 'contract_generated' or jsonb_typeof(f.contract) is distinct from 'object' then
    raise exception using errcode='22023',message='Generate the contract first';
   end if;
   if jsonb_typeof(p_payload->'signer') is distinct from 'string' or length(trim(p_payload->>'signer')) not between 1 and 150 then
    raise exception using errcode='22023',message='Enter the client signer’s full name.';
   end if;
   if p_payload->'confirmed' is distinct from 'true'::jsonb then
    raise exception using errcode='22023',message='Confirm that the client signed the hard copy.';
   end if;
   p_payload=jsonb_build_object('method','hard_copy','signer',trim(p_payload->>'signer'),'confirmed',true);
  end if;$replacement$;
begin
  select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure)
    into definition;
  if position('-- A staff attestation records a signed paper contract without inventing an attachment.' in definition)>0 then
    if position(replacement in definition)=0 or position(original_guard in definition)>0 then
      raise exception 'Unexpected partial hard copy confirmation migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition,original_guard))<>2
    or position('require_indoor_project_branch' in definition)=0
    or position('public.sales_permission_role(' in definition)=0
    or position('from projects where id=p_project for update' in definition)=0
    or position('from sales_workflows where project_id=p_project for update' in definition)=0
    or position('This project changed. Reload before continuing.' in definition)=0
    or position('This project is closed. Its quotation and contract history is read-only.' in definition)=0
    or position('Complete the additional measurements and save a quotation revision before continuing.' in definition)=0
    or position('if f.stage <> ''contract'' or f.stage is null then raise exception ''Generate the contract first''; end if;' in definition)=0
    or position('if p_payload->>''method''=''digital'' and coalesce(p_payload->>''signature'','''')='''' then raise exception ''Signature required''; end if;' in definition)=0
    or position('if p_payload->>''method''=''upload'' and coalesce(p_payload->>''path'','''')='''' then raise exception ''Signed document required''; end if;' in definition)=0
    or position('evidence=p_payload || jsonb_build_object(''recordedBy'',p_actor),signed_at=now()' in definition)=0
    or position('sales_status=''transferred_to_operations'',status=''Contract''' in definition)=0 then
    raise exception 'Unexpected sales workflow definition; hard copy confirmation was not applied.';
  end if;
  execute replace(definition,original_guard,replacement);
end;
$hard_copy$;

notify pgrst, 'reload schema';
commit;
