begin;
create table if not exists public.sales_workflows (
 project_id uuid primary key references public.projects(id),
 revision integer not null default 0,
 stage text not null check(stage in ('quotation','approved','contract','signed','operations')),
 quotation jsonb not null,
 contract jsonb,
 evidence jsonb,
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 signed_at timestamptz,
 accepted_by uuid references auth.users(id),
 accepted_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.sales_workflows enable row level security;
revoke all on public.sales_workflows from anon, authenticated;
grant all on public.sales_workflows to service_role;
create or replace function public.advance_sales_flow(p_project uuid,p_action text,p_revision integer,p_payload jsonb,p_actor uuid)
returns public.sales_workflows language plpgsql security definer set search_path=public as $$
declare f public.sales_workflows; project public.projects; actor_role text;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null then raise exception 'Inactive employee'; end if;
 select * into project from projects where id=p_project for update;
 if not found then raise exception 'Project not found'; end if;
 if p_action='accept' then
  if actor_role not in ('Admin','Operations Manager') then raise exception 'Not allowed'; end if;
 else
  if actor_role not in ('Admin','Indoor Sales','Outdoor Sales') or (actor_role <> 'Admin' and project.created_by <> p_actor) then raise exception 'Not allowed'; end if;
 end if;
 select * into f from sales_workflows where project_id=p_project for update;
 if coalesce(f.revision,0) <> p_revision then raise exception 'This project changed. Reload before continuing.'; end if;
 if p_action='save' then
  if f.stage is not null and f.stage not in ('quotation','approved') then raise exception 'Contract already generated; quotation is locked.'; end if;
  if project.sales_status::text not in ('ready_for_quotation','quotation_in_progress','quotation_approved') then raise exception 'Complete measurements first.'; end if;
  if jsonb_array_length(p_payload->'lines') < 1 or (p_payload->>'total')::numeric <= 0 then raise exception 'Incomplete quotation'; end if;
  insert into sales_workflows(project_id,revision,stage,quotation) values(p_project,p_revision+1,'quotation',p_payload)
  on conflict(project_id) do update set revision=p_revision+1,stage='quotation',quotation=p_payload,approved_by=null,approved_at=null,updated_at=now();
  update projects set sales_status='quotation_in_progress',status='Quotation' where id=p_project;
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
 select sales_status into current_status from projects where id=target for update;
 if current_status <> 'new_lead' then raise exception 'Reopen initial measurements before editing openings'; end if;
 if exists(select 1 from sales_workflows where project_id=target) or (TG_OP='UPDATE' and exists(select 1 from sales_workflows where project_id=OLD.project_id)) then raise exception 'Measurements are locked after quotation creation'; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
drop trigger if exists lock_quoted_openings on public.openings;
create trigger lock_quoted_openings before insert or update or delete on public.openings for each row execute function public.lock_quoted_openings();
create or replace function public.lock_quoted_project_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.sales_status in ('new_lead','ready_for_quotation') and exists(select 1 from sales_workflows where project_id=NEW.id) then raise exception 'The quotation has already locked these measurements'; end if;
 return NEW;
end $$;
drop trigger if exists lock_quoted_project_status on public.projects;
create trigger lock_quoted_project_status before update of sales_status on public.projects for each row execute function public.lock_quoted_project_status();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('signed-contracts-private','signed-contracts-private',false,3145728,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false;
commit;
