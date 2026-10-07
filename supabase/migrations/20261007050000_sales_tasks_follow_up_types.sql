begin;
-- Follow-up scheduling stays on the project; receipts retain each prior schedule.
alter table public.projects
 add column if not exists follow_up_type text check(follow_up_type in ('call','whatsapp','site_visit','showroom_visit','other')),
 add column if not exists follow_up_detail text,
 add column if not exists follow_up_owner_id uuid references public.profiles(id) on delete set null;
create index if not exists projects_follow_up_owner_due_idx on public.projects(follow_up_owner_id,next_follow_up_at) where next_follow_up_at is not null;
-- Existing Indoor Sales schedules belong to their original creator. Do not invent
-- a contact method for historical notes or choose an employee for Outdoor Sales.
update public.projects p set follow_up_owner_id=p.created_by
from public.profiles u where p.created_by=u.id and p.follow_up_owner_id is null
and u.role='Indoor Sales' and u.is_active=true and u.status='Active';
create or replace function public.validate_follow_up_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' and new.follow_up_owner_id is null and exists(select 1 from profiles where id=new.created_by and role='Indoor Sales' and is_active=true and status='Active') then
  new.follow_up_owner_id=new.created_by;
 end if;
 if new.follow_up_owner_id is not null and (TG_OP='INSERT' or new.follow_up_owner_id is distinct from old.follow_up_owner_id) and not exists(select 1 from profiles where id=new.follow_up_owner_id and role='Indoor Sales' and is_active=true and status='Active') then
  raise exception 'Choose an active Indoor Sales employee for follow-up.';
 end if;
 return new;
end $$;
revoke all on function public.validate_follow_up_owner() from public,anon,authenticated;
create trigger project_follow_up_owner before insert or update of follow_up_owner_id on public.projects
for each row execute function public.validate_follow_up_owner();

create or replace function public.sync_field_change(p_operation uuid,p_actor uuid,p_project uuid,p_action text,p_payload jsonb,p_recorded_at timestamptz,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; saved public.field_sync_receipts; project public.projects; client_id uuid; result jsonb; fingerprint text; number_prefix text; next_sequence bigint; new_number text;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null or actor_role not in ('Admin','Indoor Sales','Outdoor Sales') then raise exception 'Sales access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 fingerprint=md5(p_payload::text || p_action || p_project::text);
 select * into saved from field_sync_receipts where operation_id=p_operation;
 if found then
  if saved.actor_id <> p_actor or saved.payload_hash <> fingerprint then raise exception 'Operation ID already used for different work'; end if;
  return saved.result;
 end if;
 if p_action='register' then
  if exists(select 1 from projects where id=p_project) then raise exception 'Project identifier already exists'; end if;
  perform pg_advisory_xact_lock(hashtextextended('alumex-field-project-number',0));
  number_prefix='PRJ-'||to_char(now() at time zone 'Asia/Baghdad','YYYYMM')||'-';
  select coalesce(max(substring(project_number from length(number_prefix)+1)::bigint),0)+1 into next_sequence from projects where project_number ~ ('^'||number_prefix||'[0-9]{1,9}$');
  new_number=number_prefix||lpad(next_sequence::text,greatest(4,length(next_sequence::text)),'0');
  insert into clients(client_name,mobile,client_type,company_name,location_latitude,location_longitude,created_by)
  values(p_payload#>>'{client,clientName}',p_payload#>>'{client,mobile}',p_payload#>>'{client,clientType}',case when p_payload#>>'{client,clientType}'='company' then p_payload#>>'{client,clientName}' end,(p_payload#>>'{client,locationLatitude}')::numeric,(p_payload#>>'{client,locationLongitude}')::numeric,p_actor) returning id into client_id;
  insert into projects(id,client_id,project_name,project_number,address,location_latitude,location_longitude,structure_readiness,status,sales_status,created_by,owner_id,sales_engineer_id,original_creator_id,original_creator_role,original_source,assigned_outdoor_sales_id)
  values(p_project,client_id,p_payload#>>'{client,clientName}',new_number,p_payload#>>'{project,address}',(p_payload#>>'{project,locationLatitude}')::numeric,(p_payload#>>'{project,locationLongitude}')::numeric,p_payload#>>'{project,structureReadiness}','Draft','new_lead',p_actor,p_actor,p_actor,p_actor,actor_role::public.app_role,case when actor_role='Outdoor Sales' then 'outdoor_sales' else 'showroom_walk_in' end,nullif(p_payload#>>'{project,assignedOutdoorSalesId}','')::uuid);
 else
  select * into project from projects where id=p_project for update;
  if not found or (actor_role <> 'Admin' and project.created_by is distinct from p_actor and not(actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor) and not(actor_role='Indoor Sales' and project.follow_up_owner_id is not distinct from p_actor)) then raise exception 'Project is not available to this employee'; end if;
  if p_action in ('opening','finish','reopen') then
   if project.structure_readiness <> 'ready' or project.sales_status not in ('new_lead','ready_for_quotation') then raise exception 'Measurements are locked or the site is not ready'; end if;
   if p_action='opening' then
    if project.sales_status <> 'new_lead' then raise exception 'Reopen measurements before adding an opening'; end if;
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values((p_payload->>'id')::uuid,p_project,'OP-'||(p_payload->>'id'),p_payload->>'floor',case when p_payload->>'room'='Other' then p_payload->>'otherRoom' else p_payload->>'room' end,(p_payload->>'width')::numeric,(p_payload->>'height')::numeric,1,p_payload->>'structuralType',p_payload->>'openingType','ready',p_actor);
   elsif p_action='finish' then
    if not exists(select 1 from openings where project_id=p_project) or exists(select 1 from openings where project_id=p_project and (coalesce(floor,'')='' or coalesce(room,'')='' or width<=0 or height<=0 or quantity<>1 or opening_type is null)) then raise exception 'Complete every opening before finishing measurements'; end if;
    update projects set sales_status='ready_for_quotation',status='Quotation' where id=p_project;
   else
    update projects set sales_status='new_lead',status='Draft' where id=p_project;
   end if;
  elsif p_action in ('follow-up','ready') then
   if p_action='ready' and project.structure_readiness <> 'not_ready' then raise exception 'This site has already moved to measurements.'; end if;
   if p_action='follow-up' and project.sales_status in ('contract_signed','transferred_to_operations','cancelled','lost','closed') then raise exception 'Sales follow-up is complete for this project. Your saved note remains on this device.'; end if;
   if p_expected_updated_at is null or project.updated_at <> p_expected_updated_at then raise exception 'This project changed on another device. Review the online project before retrying your saved notes.'; end if;
   if p_action='ready' then update projects set structure_readiness='ready',sales_status='new_lead',next_follow_up_at=null where id=p_project;
   else
    if coalesce(p_payload->>'followUpType','') not in ('call','whatsapp','site_visit','showroom_visit','other') then raise exception 'Choose a follow-up type.'; end if;
    if p_payload->>'followUpType'='other' and (coalesce(trim(p_payload->>'followUpDetail'),'')='' or length(trim(p_payload->>'followUpDetail'))>120) then raise exception 'Describe the other follow-up type in 120 characters or fewer.'; end if;
    if nullif(p_payload->>'nextFollowUp','') is null or not isfinite((p_payload->>'nextFollowUp')::timestamptz) then raise exception 'Choose the next follow-up date.'; end if;
    if length(coalesce(p_payload->>'note',''))>2000 then raise exception 'Keep the follow-up note under 2,000 characters.'; end if;
    if nullif(p_payload->>'followUpOwnerId','') is null or not exists(select 1 from profiles where id=(p_payload->>'followUpOwnerId')::uuid and role='Indoor Sales' and is_active=true and status='Active') then raise exception 'Choose an active Indoor Sales employee for follow-up.'; end if;
    update projects set next_follow_up_at=(p_payload->>'nextFollowUp')::timestamptz,project_notes=p_payload->>'note',follow_up_type=p_payload->>'followUpType',follow_up_detail=case when p_payload->>'followUpType'='other' then trim(p_payload->>'followUpDetail') end,follow_up_owner_id=(p_payload->>'followUpOwnerId')::uuid where id=p_project;
   end if;
  else raise exception 'Unknown field action'; end if;
 end if;
 select jsonb_build_object('id',id,'project_number',project_number,'updated_at',updated_at,'sales_status',sales_status,'structure_readiness',structure_readiness,'next_follow_up_at',next_follow_up_at,'project_notes',project_notes,'follow_up_type',follow_up_type,'follow_up_detail',follow_up_detail,'follow_up_owner_id',follow_up_owner_id,'follow_up_owner_name',(select coalesce(full_name,username,'Employee') from profiles where id=projects.follow_up_owner_id)) into result from projects where id=p_project;
 insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result) values(p_operation,p_actor,p_project,p_action,fingerprint,p_recorded_at,result);
 return result;
end $$;
revoke all on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) to service_role;


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
  if actor_role not in ('Admin','Indoor Sales','Outdoor Sales') or (actor_role <> 'Admin' and project.created_by is distinct from p_actor and not (actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor) and not (actor_role='Indoor Sales' and project.follow_up_owner_id is not distinct from p_actor)) then raise exception 'Not allowed'; end if;
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

notify pgrst, 'reload schema';
commit;
