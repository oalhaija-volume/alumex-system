begin;
-- Commercial history is private even from Operations / Project Managers.
create table if not exists public.quotation_revisions (
 project_id uuid not null references public.projects(id) on delete cascade,
 version integer not null check(version > 0),
 workflow_revision integer not null,
 quotation jsonb not null,
 contract jsonb,
 previous_stage text not null,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 superseded_by uuid references auth.users(id) on delete set null,
 superseded_at timestamptz not null default now(),
 primary key(project_id,version)
);
alter table public.quotation_revisions enable row level security;
revoke all on public.quotation_revisions from public,anon,authenticated;
grant all on public.quotation_revisions to service_role;

create or replace function public.advance_sales_flow(p_project uuid,p_action text,p_revision integer,p_payload jsonb,p_actor uuid)
returns public.sales_workflows language plpgsql security definer set search_path=public as $$
declare f public.sales_workflows; project public.projects; actor_role text; line jsonb; opening jsonb; existing public.openings; quote_version integer;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null then raise exception 'Inactive employee'; end if;
 select * into project from projects where id=p_project for update;
 if not found then raise exception 'Project not found'; end if;
 if p_action='accept' then
  if actor_role not in ('Admin','Operations Manager') then raise exception 'Not allowed'; end if;
 else
  if actor_role not in ('Admin','Indoor Sales','Outdoor Sales') or (actor_role <> 'Admin' and project.created_by is distinct from p_actor and not (actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor)) then raise exception 'Not allowed'; end if;
 end if;
 select * into f from sales_workflows where project_id=p_project for update;
 if coalesce(f.revision,0) <> p_revision then raise exception 'This project changed. Reload before continuing.'; end if;
 if p_action='save' then
  if f.signed_at is not null or (f.stage is not null and f.stage not in ('quotation','approved','contract')) then raise exception 'Signed contracts cannot be changed.'; end if;
  if project.sales_status::text not in ('ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated') then raise exception 'Complete measurements first.'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or coalesce(jsonb_array_length(p_payload->'lines'),0) < 1 or coalesce((p_payload->>'total')::numeric,0) <= 0 then raise exception 'Incomplete quotation'; end if;
  if (select count(distinct x#>>'{opening,id}') from jsonb_array_elements(p_payload->'lines') x) <> jsonb_array_length(p_payload->'lines') then raise exception 'Duplicate opening'; end if;
  -- Recheck the measured set under the project lock, including changes since API pricing.
  if exists(select 1 from openings o where o.project_id=p_project and not exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=o.id::text)) then raise exception 'Measurements changed. Reload the quotation.'; end if;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   if coalesce(opening->>'floor','')='' or length(opening->>'floor')>100 or coalesce(opening->>'room','')='' or length(opening->>'room')>100
     or coalesce((opening->>'width')::numeric,0) not between 0.01 and 100000 or coalesce((opening->>'height')::numeric,0) not between 0.01 and 100000
     or coalesce(opening->>'opening_type','') not in ('Window','Door','Louver','Curtain Wall','Skylight')
     or (opening->>'opening_type' in ('Window','Door') and coalesce(opening->>'opening_direction','') not in ('Sliding','Hinged'))
     or (opening->>'opening_type'='Louver' and opening->>'opening_direction' is distinct from 'Hinged')
     or (opening->>'opening_type' in ('Curtain Wall','Skylight') and opening->>'opening_direction' is not null)
     then raise exception 'Incomplete opening measurements'; end if;
   select * into existing from openings where id=(opening->>'id')::uuid;
   if found and (existing.project_id is distinct from p_project or
     not opening @> jsonb_build_object('floor',existing.floor,'room',existing.room,'width',existing.width,'height',existing.height,'opening_type',existing.opening_type,'opening_direction',existing.opening_direction))
     then raise exception 'Measurements changed. Reload the quotation.'; end if;
  end loop;
  quote_version=coalesce((f.quotation->>'version')::integer,case when f.project_id is null then 0 else 1 end)+1;
  if f.project_id is not null then
   insert into quotation_revisions(project_id,version,workflow_revision,quotation,contract,previous_stage,approved_by,approved_at,superseded_by)
   values(p_project,quote_version-1,f.revision,f.quotation,f.contract,f.stage,f.approved_by,f.approved_at,p_actor);
  end if;
  p_payload=p_payload || jsonb_build_object('version',quote_version,'preparedBy',p_actor,'createdAt',now());
  insert into sales_workflows(project_id,revision,stage,quotation) values(p_project,p_revision+1,'quotation',p_payload)
  on conflict(project_id) do update set revision=p_revision+1,stage='quotation',quotation=p_payload,approved_by=null,approved_at=null,contract=null,evidence=null,updated_at=now();
  update projects set sales_status='quotation_in_progress',status='Quotation' where id=p_project;
  -- Insert only after the authoritative snapshot exists; the trigger below permits
  -- these exact new measurements and rejects changes to any existing opening.
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   if not exists(select 1 from openings where id=(opening->>'id')::uuid) then
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values((opening->>'id')::uuid,p_project,'OP-'||(opening->>'id'),opening->>'floor',opening->>'room',(opening->>'width')::numeric,(opening->>'height')::numeric,1,opening->>'opening_type',opening->>'opening_direction','ready',p_actor);
   end if;
  end loop;
 elsif p_action='approve' then
  if f.stage <> 'quotation' or f.stage is null then raise exception 'Save a quotation first'; end if;
  update sales_workflows set stage='approved',revision=revision+1,approved_by=p_actor,approved_at=now(),updated_at=now() where project_id=p_project;
  update projects set sales_status='quotation_approved' where id=p_project;
 elsif p_action='contract' then
  if f.stage <> 'approved' or f.stage is null then raise exception 'Client approval is required'; end if;
  update sales_workflows set stage='contract',revision=revision+1,contract=p_payload || jsonb_build_object('quotation',f.quotation,'approvedAt',f.approved_at),updated_at=now() where project_id=p_project;
  update projects set sales_status='contract_generated',status='Contract' where id=p_project;
 elsif p_action='sign' then
  if f.stage <> 'contract' or f.stage is null then raise exception 'Generate the contract first'; end if;
  if coalesce(p_payload->>'signer','')='' or coalesce(p_payload->>'method','') not in ('digital','upload') then raise exception 'Signed evidence required'; end if;
  if p_payload->>'method'='digital' and coalesce(p_payload->>'signature','')='' then raise exception 'Signature required'; end if;
  if p_payload->>'method'='upload' and coalesce(p_payload->>'path','')='' then raise exception 'Signed document required'; end if;
  update sales_workflows set stage='signed',revision=revision+1,evidence=p_payload || jsonb_build_object('recordedBy',p_actor),signed_at=now(),updated_at=now() where project_id=p_project;
  update projects set sales_status='transferred_to_operations',status='Contract' where id=p_project;
 elsif p_action='accept' then
  if f.stage <> 'signed' or f.signed_at is null then raise exception 'A signed contract is required'; end if;
  update sales_workflows set stage='operations',revision=revision+1,accepted_by=p_actor,accepted_at=now(),updated_at=now() where project_id=p_project;
  update projects set status='Production' where id=p_project;
 else raise exception 'Unknown action'; end if;
 select * into f from sales_workflows where project_id=p_project;
 return f;
end $$;
revoke all on function public.advance_sales_flow(uuid,text,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.advance_sales_flow(uuid,text,integer,jsonb,uuid) to service_role;

create or replace function public.lock_quoted_openings() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid; current_status text;
begin
 target=case when TG_OP='DELETE' then OLD.project_id else NEW.project_id end;
 if TG_OP='DELETE' and exists(select 1 from deleted_project_ids where project_id=target) then return OLD; end if;
 select sales_status into current_status from projects where id=target for update;
 if TG_OP='INSERT' and NEW.quantity=1 and NEW.site_readiness='ready' and exists(
  select 1 from sales_workflows f cross join lateral jsonb_array_elements(f.quotation->'lines') line
  where f.project_id=target and f.stage='quotation' and f.signed_at is null
   and line->'opening' @> jsonb_build_object('id',NEW.id,'floor',NEW.floor,'room',NEW.room,'width',NEW.width,'height',NEW.height,'opening_type',NEW.opening_type,'opening_direction',NEW.opening_direction)
 ) then return NEW; end if;
 if current_status <> 'new_lead' then raise exception 'Add new openings through a quotation revision'; end if;
 if exists(select 1 from sales_workflows where project_id=target) or (TG_OP='UPDATE' and exists(select 1 from sales_workflows where project_id=OLD.project_id)) then raise exception 'Measurements are locked after quotation creation'; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
notify pgrst, 'reload schema';
commit;
