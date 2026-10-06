begin;
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
  if not found or (actor_role <> 'Admin' and project.created_by is distinct from p_actor and not(actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor)) then raise exception 'Project is not available to this employee'; end if;
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
   else update projects set next_follow_up_at=(p_payload->>'nextFollowUp')::timestamptz,project_notes=p_payload->>'note' where id=p_project; end if;
  else raise exception 'Unknown field action'; end if;
 end if;
 select jsonb_build_object('id',id,'project_number',project_number,'updated_at',updated_at,'sales_status',sales_status,'structure_readiness',structure_readiness,'next_follow_up_at',next_follow_up_at,'project_notes',project_notes) into result from projects where id=p_project;
 insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result) values(p_operation,p_actor,p_project,p_action,fingerprint,p_recorded_at,result);
 return result;
end $$;
revoke all on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) to service_role;


notify pgrst, 'reload schema';
commit;
