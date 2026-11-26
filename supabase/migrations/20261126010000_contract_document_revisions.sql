begin;

-- Revised documents have their own approval/signature lifecycle. The original
-- workflow, quotation approval, signed evidence and Operations handoff stay put.
create table public.contract_document_revisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 document_revision integer not null check(document_revision > 0),
 source_workflow_revision integer not null check(source_workflow_revision > 0),
 source_contract jsonb not null check(jsonb_typeof(source_contract)='object'),
 contract jsonb not null check(jsonb_typeof(contract)='object'),
 format_version text not null check(format_version='billable-opening-schedule-v1'),
 status text not null default 'pending_approval' check(status in ('pending_approval','approved','signed')),
 revision integer not null default 1 check(revision > 0),
 source_signed_at timestamptz,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id) on delete restrict,
 approved_at timestamptz,
 approved_by uuid references public.profiles(id) on delete restrict,
 signed_at timestamptz,
 evidence jsonb,
 unique(project_id,document_revision),
 unique(project_id,source_workflow_revision,format_version),
 check(contract->'quotation' is not distinct from source_contract->'quotation'),
 check(contract->'terms' is not distinct from source_contract->'terms'),
 check(contract->'client' is not distinct from source_contract->'client'),
 check(contract->'project' is not distinct from source_contract->'project'),
 check(contract->'template' is not distinct from source_contract->'template'),
 check((contract->'agreement2027')-'fields' is not distinct from (source_contract->'agreement2027')-'fields'),
 check((status='pending_approval' and approved_at is null and approved_by is null and signed_at is null and evidence is null)
  or (status='approved' and approved_at is not null and approved_by is not null and signed_at is null and evidence is null)
  or (status='signed' and approved_at is not null and approved_by is not null and signed_at is not null and jsonb_typeof(evidence)='object'))
);
comment on table public.contract_document_revisions is
 'Independent revisions adding the billable opening schedule; preserve exact original contracts and require new client approval and signing.';
alter table public.contract_document_revisions enable row level security;
revoke all on public.contract_document_revisions from public,anon,authenticated,service_role;
grant select on public.contract_document_revisions to service_role;

create function public.protect_contract_document_revision() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='DELETE' then
  if not exists(select 1 from public.projects where id=OLD.project_id) then return OLD; end if;
  raise exception using errcode='42501',message='Contract document revisions cannot be deleted independently.';
 end if;
 if (to_jsonb(NEW)-array['status','revision','approved_at','approved_by','signed_at','evidence'])
   is distinct from (to_jsonb(OLD)-array['status','revision','approved_at','approved_by','signed_at','evidence'])
  or NEW.revision is distinct from OLD.revision+1 then
  raise exception using errcode='42501',message='Saved contract revision content cannot be changed.';
 end if;
 if OLD.status='pending_approval' and NEW.status='approved'
  and NEW.approved_at is not null and NEW.approved_by is not null and NEW.signed_at is null and NEW.evidence is null then return NEW; end if;
 if OLD.status='approved' and NEW.status='signed' and NEW.approved_at=OLD.approved_at and NEW.approved_by=OLD.approved_by
  and NEW.signed_at is not null and jsonb_typeof(NEW.evidence)='object' then return NEW; end if;
 raise exception using errcode='42501',message='Contract revisions require approval followed by a new signature.';
end;
$$;
revoke all on function public.protect_contract_document_revision() from public,anon,authenticated,service_role;
create trigger protect_contract_document_revision before update or delete on public.contract_document_revisions
 for each row execute function public.protect_contract_document_revision();

create function public.create_contract_document_revision(p_project uuid,p_source_revision integer,p_actor uuid)
returns public.contract_document_revisions language plpgsql security definer set search_path=public as $$
declare
 site public.projects;
 flow public.sales_workflows;
 saved public.contract_document_revisions;
 actor_role text;
 replacement jsonb;
 fields jsonb;
 approvals jsonb;
 next_number integer;
begin
 select role::text into actor_role from public.profiles where id=p_actor and is_active and status='Active';
 if actor_role is distinct from 'Admin' then raise exception using errcode='42501',message='Only Admin can create contract document revisions.'; end if;
 select * into site from public.projects where id=p_project for update;
 if not found or site.archived_at is not null then raise exception using errcode='42501',message='Project not found.'; end if;
 perform public.require_indoor_project_branch(p_project,p_actor);
 if p_source_revision is null or p_source_revision<1 then raise exception using errcode='22023',message='The source contract revision is required.'; end if;
 select * into saved from public.contract_document_revisions
  where project_id=p_project and source_workflow_revision=p_source_revision and format_version='billable-opening-schedule-v1';
 if found then return saved; end if;
 select * into flow from public.sales_workflows where project_id=p_project for share;
 if not found or flow.revision is distinct from p_source_revision then
  raise exception using errcode='40001',message='The original contract changed. Reload before creating its revised copy.';
 end if;
 if jsonb_typeof(flow.contract) is distinct from 'object'
  or jsonb_typeof(flow.contract->'quotation') is distinct from 'object'
  or jsonb_typeof(flow.contract#>'{quotation,lines}') is distinct from 'array'
  or coalesce(btrim(flow.contract->>'number'),'')='' then
  raise exception using errcode='22023',message='A saved contract with its approved quotation is required.';
 end if;
 select coalesce(max(document_revision),0)+1 into next_number from public.contract_document_revisions where project_id=p_project;
 replacement:=(flow.contract-'approvedAt')||jsonb_build_object('number',flow.contract->>'number'||'-R'||next_number,'createdAt',now(),'createdBy',p_actor);
 if jsonb_typeof(replacement#>'{agreement2027,fields}')='object' then
  fields:=(replacement#>'{agreement2027,fields}')||jsonb_build_object('companyRepresentativeSignature','','companyRepresentativeDate','');
  if jsonb_typeof(fields->'approvals')='object' then
   select coalesce(jsonb_object_agg(key,case when jsonb_typeof(value)='object' then value||jsonb_build_object('signature','','date','') else value end),'{}'::jsonb)
    into approvals from jsonb_each(fields->'approvals');
   fields:=jsonb_set(fields,'{approvals}',approvals);
  end if;
  replacement:=jsonb_set(replacement,'{agreement2027,fields}',fields);
 end if;
 insert into public.contract_document_revisions(project_id,document_revision,source_workflow_revision,source_contract,contract,format_version,source_signed_at,created_by)
 values(p_project,next_number,flow.revision,flow.contract,replacement,'billable-opening-schedule-v1',flow.signed_at,p_actor) returning * into saved;
 return saved;
end;
$$;

create function public.approve_contract_document_revision(p_id uuid,p_revision integer,p_actor uuid)
returns public.contract_document_revisions language plpgsql security definer set search_path=public as $$
declare saved public.contract_document_revisions; actor_role text;
begin
 select public.sales_permission_role(role)::text into actor_role from public.profiles where id=p_actor and is_active and status='Active';
 if actor_role is null or actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then
  raise exception using errcode='42501',message='Only the commercial team can record contract revision approval.';
 end if;
 select * into saved from public.contract_document_revisions where id=p_id for update;
 if not found then raise exception using errcode='42501',message='Contract document revision not found.'; end if;
 perform public.require_indoor_project_branch(saved.project_id,p_actor);
 if not exists(select 1 from public.projects where id=saved.project_id and archived_at is null) then raise exception using errcode='42501',message='Project not found.'; end if;
 if p_revision is null or saved.revision is distinct from p_revision then raise exception using errcode='40001',message='The contract revision changed. Reload and try again.'; end if;
 if saved.status is distinct from 'pending_approval' then raise exception using errcode='22023',message='Only a pending revision can receive new client approval.'; end if;
 update public.contract_document_revisions set status='approved',revision=revision+1,approved_at=now(),approved_by=p_actor where id=p_id returning * into saved;
 return saved;
end;
$$;

create function public.sign_contract_document_revision(p_id uuid,p_revision integer,p_evidence jsonb,p_actor uuid)
returns public.contract_document_revisions language plpgsql security definer set search_path=public as $$
declare saved public.contract_document_revisions; actor_role text; method text; signer text; signature text; signed_evidence jsonb;
begin
 select public.sales_permission_role(role)::text into actor_role from public.profiles where id=p_actor and is_active and status='Active';
 if actor_role is null or actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then
  raise exception using errcode='42501',message='Only the commercial team can sign contract revisions.';
 end if;
 select * into saved from public.contract_document_revisions where id=p_id for update;
 if not found then raise exception using errcode='42501',message='Contract document revision not found.'; end if;
 perform public.require_indoor_project_branch(saved.project_id,p_actor);
 if not exists(select 1 from public.projects where id=saved.project_id and archived_at is null) then raise exception using errcode='42501',message='Project not found.'; end if;
 if p_revision is null or saved.revision is distinct from p_revision then raise exception using errcode='40001',message='The contract revision changed. Reload and try again.'; end if;
 if saved.status is distinct from 'approved' then raise exception using errcode='22023',message='New client approval is required before signing this revision.'; end if;
 if jsonb_typeof(p_evidence) is distinct from 'object' or p_evidence->'confirmed' is distinct from 'true'::jsonb then
  raise exception using errcode='22023',message='Confirm the client signed this revised contract.';
 end if;
 method:=p_evidence->>'method'; signer:=btrim(p_evidence->>'signer');
 if method is null or method not in ('digital','hard_copy') or signer is null or length(signer) not between 2 and 200 then
  raise exception using errcode='22023',message='Enter the client signer and choose a supported signing method.';
 end if;
 signed_evidence:=jsonb_build_object('method',method,'signer',signer,'confirmed',true,'recordedBy',p_actor);
 if method='digital' then
  signature:=p_evidence->>'signature';
  if signature is null or length(signature) not between 500 and 2000000 or signature !~ '^data:image/png;base64,[A-Za-z0-9+/]*={0,2}$' then
   raise exception using errcode='22023',message='Please sign in the signature box.';
  end if;
  if encode(substring(decode(split_part(signature,',',2),'base64') from 1 for 8),'hex')<>'89504e470d0a1a0a' then
   raise exception using errcode='22023',message='Invalid signature image.';
  end if;
  signed_evidence:=signed_evidence||jsonb_build_object('signature',signature);
 end if;
 update public.contract_document_revisions set status='signed',revision=revision+1,signed_at=now(),evidence=signed_evidence where id=p_id returning * into saved;
 return saved;
end;
$$;

revoke all on function public.create_contract_document_revision(uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.approve_contract_document_revision(uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.sign_contract_document_revision(uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_contract_document_revision(uuid,integer,uuid) to service_role;
grant execute on function public.approve_contract_document_revision(uuid,integer,uuid) to service_role;
grant execute on function public.sign_contract_document_revision(uuid,integer,jsonb,uuid) to service_role;

notify pgrst,'reload schema';
commit;
