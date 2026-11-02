begin;

-- An unsigned contract's template can be corrected without revising its prices.
-- Keep both exact document snapshots independently of quotation-version history.
create table if not exists public.contract_template_corrections (
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_revision integer not null check (workflow_revision > 0),
  previous_contract jsonb not null check (jsonb_typeof(previous_contract) = 'object'),
  replacement_contract jsonb not null check (jsonb_typeof(replacement_contract) = 'object'),
  corrected_by uuid not null references auth.users(id) on delete restrict,
  corrected_at timestamptz not null default now(),
  primary key (project_id, workflow_revision)
);
comment on table public.contract_template_corrections is
  'Exact before/after snapshots for unsigned contract template corrections. Quotation versions, prices, approval and signed contracts are unchanged.';
alter table public.contract_template_corrections enable row level security;
revoke all on public.contract_template_corrections from public, anon, authenticated, service_role;
grant select on public.contract_template_corrections to service_role;

-- Patch only the new action into the installed workflow. Preserve existing role,
-- branch, optimistic revision, additional-measurement and quoted-opening guards,
-- as well as the function owner, security settings and execution grants.
do $correction$
declare
  definition text;
  marker text := 'elsif p_action=''sign'' then';
  action_marker text := 'elsif p_action=''change-contract-template'' then';
begin
  select pg_get_functiondef('public.advance_sales_flow(uuid,text,integer,jsonb,uuid)'::regprocedure)
    into definition;
  if position(action_marker in definition) > 0 then
    if position('insert into public.contract_template_corrections' in definition) = 0 then
      raise exception 'Unexpected partial contract template correction migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition, marker)) <> 2
    or position('require_indoor_project_branch' in definition) = 0
    or position('public.sales_permission_role(' in definition) = 0
    or position('Include new whole-building facades without changing any saved measurement.' in definition) = 0
    or position('This project changed. Reload before continuing.' in definition) = 0
    or position('Complete the additional measurements and save a quotation revision before continuing.' in definition) = 0 then
    raise exception 'Unexpected sales workflow definition; contract template correction migration was not applied.';
  end if;
  definition := replace(definition, marker, $action$elsif p_action='change-contract-template' then
  if f.stage is distinct from 'contract' or project.sales_status is distinct from 'contract_generated'
    or jsonb_typeof(f.contract) is distinct from 'object'
    or f.signed_at is not null or f.evidence is not null
    or f.accepted_at is not null or f.accepted_by is not null then
   raise exception using errcode='22023',message='Only an unsigned generated contract can have its type changed.';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'template') is distinct from 'string'
    or p_payload->>'template' not in ('residential','commercial') then
   raise exception using errcode='22023',message='Choose the residential or commercial contract template.';
  end if;
  if f.contract->>'template'=p_payload->>'template' then
   raise exception using errcode='22023',message='Choose a different contract type.';
  end if;
  if jsonb_typeof(p_payload->'terms') is distinct from 'array' then
   raise exception using errcode='22023',message='Contract template terms are invalid.';
  end if;
  if jsonb_array_length(p_payload->'terms') not between 1 and 50 or exists (
   select 1 from jsonb_array_elements(p_payload->'terms') section
   where jsonb_typeof(section) is distinct from 'object'
    or jsonb_typeof(section->'title') is distinct from 'string'
    or jsonb_typeof(section->'text') is distinct from 'string'
    or length(trim(section->>'title')) not between 1 and 500
    or length(trim(section->>'text')) not between 1 and 20000
  ) then
   raise exception using errcode='22023',message='Contract template terms are invalid.';
  end if;
  insert into public.contract_template_corrections(
   project_id,workflow_revision,previous_contract,replacement_contract,corrected_by
  ) values (
   p_project,f.revision+1,f.contract,
   jsonb_set(jsonb_set(f.contract,'{template}',p_payload->'template'),'{terms}',p_payload->'terms'),p_actor
  );
  update public.sales_workflows set
   contract=jsonb_set(jsonb_set(f.contract,'{template}',p_payload->'template'),'{terms}',p_payload->'terms'),
   revision=f.revision+1,updated_at=now() where project_id=p_project;
 elsif p_action='sign' then$action$);
  execute definition;
end;
$correction$;

notify pgrst, 'reload schema';
commit;
