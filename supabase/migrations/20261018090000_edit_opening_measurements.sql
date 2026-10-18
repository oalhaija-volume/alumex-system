begin;
-- Edit measured openings atomically, retaining identity, media and concurrent changes.
create or replace function public.sync_field_change(p_operation uuid,p_actor uuid,p_project uuid,p_action text,p_payload jsonb,p_recorded_at timestamptz,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; saved public.field_sync_receipts; project public.projects; client_id uuid; result jsonb; fingerprint text; number_prefix text; next_sequence bigint; new_number text; measurement_assignee uuid; opening_quantity numeric; measured public.openings; edit jsonb; previous jsonb;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null or actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales','Outdoor Sales') then raise exception 'Sales access required'; end if;
 if p_action in ('follow-up','ready','assign-measurements','resume-measurements') and actor_role not in ('Indoor Sales','Admin','Sales Director','CEO','Company Owner') then raise exception 'CRM access is limited to Indoor Sales and company leadership.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 fingerprint=md5(p_payload::text || p_action || p_project::text);
 select * into saved from field_sync_receipts where operation_id=p_operation;
 if found then
  if saved.actor_id <> p_actor or saved.payload_hash <> fingerprint then raise exception 'Operation ID already used for different work'; end if;
  return saved.result;
 end if;
 if p_action='register' then
  -- Omitted fields remain compatible with registrations queued by older installed clients.
  if (p_payload->'project') ? 'buildingType' and (
   (p_payload#>'{project,buildingType}'='null'::jsonb and actor_role='Outdoor Sales')
   or (p_payload#>'{project,buildingType}'<>'null'::jsonb and (
    jsonb_typeof(p_payload#>'{project,buildingType}')<>'string'
    or p_payload#>>'{project,buildingType}' not in ('commercial_building','residential_building','villa_house')
   ))
  ) then raise exception using errcode='22023',message='Choose the building type: commercial building, residential building, or villa / house.'; end if;
  if exists(select 1 from projects where id=p_project) then raise exception 'Project identifier already exists'; end if;
  perform pg_advisory_xact_lock(hashtextextended('alumex-field-project-number',0));
  number_prefix='PRJ-'||to_char(now() at time zone 'Asia/Baghdad','YYYYMM')||'-';
  select coalesce(max(substring(project_number from length(number_prefix)+1)::bigint),0)+1 into next_sequence from projects where project_number ~ ('^'||number_prefix||'[0-9]{1,9}$');
  new_number=number_prefix||lpad(next_sequence::text,greatest(4,length(next_sequence::text)),'0');
  insert into clients(client_name,mobile,client_type,company_name,location_latitude,location_longitude,created_by)
  values(p_payload#>>'{client,clientName}',p_payload#>>'{client,mobile}',p_payload#>>'{client,clientType}',case when p_payload#>>'{client,clientType}'='company' then p_payload#>>'{client,clientName}' end,(p_payload#>>'{client,locationLatitude}')::numeric,(p_payload#>>'{client,locationLongitude}')::numeric,p_actor) returning id into client_id;
  insert into projects(id,client_id,project_name,project_number,address,location_latitude,location_longitude,structure_readiness,status,sales_status,created_by,owner_id,sales_engineer_id,original_creator_id,original_creator_role,original_source,assigned_outdoor_sales_id,readiness_note,building_type)
  values(p_project,client_id,p_payload#>>'{client,clientName}',new_number,p_payload#>>'{project,address}',(p_payload#>>'{project,locationLatitude}')::numeric,(p_payload#>>'{project,locationLongitude}')::numeric,p_payload#>>'{project,structureReadiness}','Draft','new_lead',p_actor,p_actor,p_actor,p_actor,actor_role::public.app_role,case when actor_role='Outdoor Sales' then 'outdoor_sales' else 'showroom_walk_in' end,nullif(p_payload#>>'{project,assignedOutdoorSalesId}','')::uuid,nullif(trim(p_payload#>>'{project,readinessNote}'),''),p_payload#>>'{project,buildingType}');
 else
  select * into project from projects where id=p_project for update;
  if not found or (actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') and project.created_by is distinct from p_actor and not(actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor) and not(actor_role='Indoor Sales' and (project.follow_up_owner_id is not distinct from p_actor or (p_action in ('follow-up','ready','assign-measurements') and project.follow_up_owner_id is null and project.sales_status not in ('contract_signed','transferred_to_operations','cancelled','lost','closed'))))) then raise exception 'Project is not available to this employee'; end if;
  if p_action='cancel-project' then
   if not ((actor_role in ('Indoor Sales','Admin','Sales Director','CEO','Company Owner') and project.sales_status in ('new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'))
     or (actor_role='Outdoor Sales' and project.sales_status in ('new_lead','ready_for_quotation') and (project.assigned_outdoor_sales_id is not distinct from p_actor))) then
    raise exception using errcode='42501',message='This project cannot be cancelled by this employee at its current stage.';
   end if;
   if exists(select 1 from sales_workflows where project_id=p_project and signed_at is not null) then raise exception 'Signed projects cannot be cancelled from the sales workspace.'; end if;
   if p_expected_updated_at is null or project.updated_at<>p_expected_updated_at then raise exception 'This project changed on another device. Review the online project before retrying your saved notes.'; end if;
   if p_payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'Confirm that the client cancelled this project.'; end if;
   if jsonb_typeof(p_payload->'note') is distinct from 'string' or coalesce(trim(p_payload->>'note'),'')='' then raise exception 'Enter the client cancellation reason.'; end if;
   if length(trim(p_payload->>'note'))>2000 then raise exception 'Keep the cancellation reason under 2,000 characters.'; end if;
   if p_recorded_at is null or not isfinite(p_recorded_at) then raise exception 'A valid recording time is required.'; end if;
   update projects set sales_status='cancelled',measurement_delayed=false,next_follow_up_at=null,
    client_cancellation_note=trim(p_payload->>'note'),client_cancelled_at=p_recorded_at,client_cancelled_by=p_actor where id=p_project;
  elsif p_action in ('delay-measurements','resume-measurements') then
   if not ((actor_role='Outdoor Sales' and (project.assigned_outdoor_sales_id is not distinct from p_actor))
      or (p_action='resume-measurements' and actor_role in ('Indoor Sales','Admin','Sales Director','CEO','Company Owner'))) then
    raise exception using errcode='42501',message='Only the assigned Outdoor Sales employee can report a client delay.';
   end if;
   if project.structure_readiness<>'ready' or project.sales_status<>'new_lead' then raise exception 'Client delays can only be recorded before measurements are completed.'; end if;
   if p_expected_updated_at is null or project.updated_at<>p_expected_updated_at then raise exception 'This project changed on another device. Review the online project before retrying your saved notes.'; end if;
   if p_action='delay-measurements' then
    if project.measurement_delayed then raise exception 'This project is already delayed by the client.'; end if;
    if jsonb_typeof(p_payload->'note') is distinct from 'string' or coalesce(trim(p_payload->>'note'),'')='' then raise exception 'Add a note explaining the client delay.'; end if;
    if length(trim(p_payload->>'note'))>2000 then raise exception 'Keep the delay note under 2,000 characters.'; end if;
    if p_recorded_at is null or not isfinite(p_recorded_at) then raise exception 'A valid recording time is required.'; end if;
    update projects set next_follow_up_at=null,follow_up_type=null,follow_up_detail=null,measurement_delayed=true,measurement_delay_note=trim(p_payload->>'note'),measurement_delayed_at=p_recorded_at,measurement_delayed_by=p_actor where id=p_project;
   else
    if not project.measurement_delayed then raise exception 'This project is not delayed by the client.'; end if;
    -- Compatibility for older Indoor clients: only CRM staff may restart a visit.
    perform 1 from profiles where id=project.assigned_outdoor_sales_id and (role='Outdoor Sales' or (role='Indoor Sales' and id=project.created_by)) and is_active=true and status='Active' for share;
    if not found then raise exception 'Choose an eligible employee for measurements.'; end if;
    update projects set measurement_delayed=false,measurement_assignment_id=p_operation where id=p_project;
   end if;
  elsif p_action='edit-opening' then
   if project.measurement_delayed then raise exception 'Resume measurements before recording or completing them.'; end if;
   if project.structure_readiness<>'ready' or project.sales_status<>'new_lead' then raise exception 'Reopen measurements before editing an opening.'; end if;
   edit=p_payload->'opening'; previous=p_payload->'previous';
   if jsonb_typeof(edit) is distinct from 'object' or jsonb_typeof(previous) is distinct from 'object'
      or edit->>'id' is null or (edit->>'id') is distinct from (previous->>'id') then raise exception 'Complete the opening details.'; end if;
   select * into measured from openings where id=(edit->>'id')::uuid and project_id=p_project for update;
   if not found then raise exception 'Opening not found in this project.'; end if;
   if row(measured.width,measured.height,measured.quantity,measured.floor,measured.room,measured.opening_type,measured.opening_direction)
      is distinct from row((previous->>'width')::numeric,(previous->>'height')::numeric,coalesce((previous->>'quantity')::numeric,1),previous->>'floor',case when previous->>'room'='Other' then previous->>'otherRoom' else previous->>'room' end,previous->>'structuralType',previous->>'openingType') then
    raise exception 'This opening changed on another device. Reload measurements before editing it again.';
   end if;
   if jsonb_typeof(edit->'width') is distinct from 'number' or jsonb_typeof(edit->'height') is distinct from 'number'
      or (edit->>'width')::numeric<=0 or (edit->>'width')::numeric>100000 or (edit->>'height')::numeric<=0 or (edit->>'height')::numeric>100000
      or coalesce(trim(edit->>'floor'),'')='' or length(edit->>'floor')>100
      or coalesce(edit->>'room','') not in ('Living room','Bedroom','Kitchen','Bathroom','Dining room','Office','Hallway','Staircase','Balcony','Storage room','Other')
      or (edit->>'room'='Other' and (coalesce(trim(edit->>'otherRoom'),'')='' or length(edit->>'otherRoom')>100))
      or coalesce(edit->>'structuralType','') not in ('Window','Door','Louver','Curtain Wall','Skylight')
      or (edit->>'structuralType' in ('Window','Door') and coalesce(edit->>'openingType','') not in ('Sliding','Hinged'))
      or (edit->>'structuralType'='Louver' and (edit->>'openingType') is distinct from 'Hinged')
      or (edit->>'structuralType' in ('Curtain Wall','Skylight') and edit->>'openingType' is not null)
      then raise exception 'Complete the opening details.'; end if;
   if edit ? 'quantity' and jsonb_typeof(edit->'quantity') is distinct from 'number' then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   opening_quantity=coalesce((edit->>'quantity')::numeric,1);
   if opening_quantity<1 or opening_quantity>10000 or opening_quantity<>trunc(opening_quantity) then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   if measured.skylight_capture is not null and edit->>'structuralType'<>'Skylight' then raise exception 'A saved skylight shape must remain attached to a skylight.'; end if;
   update openings set floor=trim(edit->>'floor'),room=case when edit->>'room'='Other' then trim(edit->>'otherRoom') else edit->>'room' end,
    width=(edit->>'width')::numeric,height=(edit->>'height')::numeric,quantity=opening_quantity::integer,
    opening_type=edit->>'structuralType',opening_direction=edit->>'openingType' where id=measured.id and project_id=p_project;
  elsif p_action in ('opening','finish','reopen') then
   if project.measurement_delayed then raise exception 'Resume measurements before recording or completing them.'; end if;
   if project.structure_readiness <> 'ready' or project.sales_status not in ('new_lead','ready_for_quotation') then raise exception 'Measurements are locked or the site is not ready'; end if;
   if p_action='opening' then
    if project.sales_status <> 'new_lead' then raise exception 'Reopen measurements before adding an opening'; end if;
    if p_payload ? 'quantity' and jsonb_typeof(p_payload->'quantity') is distinct from 'number' then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
    opening_quantity=coalesce((p_payload->>'quantity')::numeric,1);
    if opening_quantity<1 or opening_quantity>10000 or opening_quantity<>trunc(opening_quantity) then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,skylight_capture)
    values((p_payload->>'id')::uuid,p_project,'OP-'||(p_payload->>'id'),p_payload->>'floor',case when p_payload->>'room'='Other' then p_payload->>'otherRoom' else p_payload->>'room' end,(p_payload->>'width')::numeric,(p_payload->>'height')::numeric,opening_quantity::integer,p_payload->>'structuralType',p_payload->>'openingType','ready',p_actor,nullif(p_payload->'skylight','null'::jsonb));
   elsif p_action='finish' then
    if not exists(select 1 from openings where project_id=p_project) or exists(select 1 from openings where project_id=p_project and (coalesce(floor,'')='' or coalesce(room,'')='' or width<=0 or height<=0 or quantity is null or quantity<1 or quantity>10000 or opening_type is null)) then raise exception 'Complete every opening before finishing measurements'; end if;
    update projects set sales_status='ready_for_quotation',status='Quotation' where id=p_project;
   else
    update projects set sales_status='new_lead',status='Draft' where id=p_project;
   end if;
  elsif p_action in ('follow-up','ready','assign-measurements') then
   if p_action='assign-measurements' and (project.structure_readiness <> 'ready' or project.sales_status <> 'new_lead') then raise exception 'Measurement assignment is only available before measurements are completed.'; end if;
   if p_action='ready' and (project.structure_readiness <> 'not_ready' or project.sales_status <> 'new_lead') then raise exception 'This project has already moved beyond site readiness.'; end if;
   if p_action='follow-up' and project.sales_status in ('contract_signed','transferred_to_operations','cancelled','lost','closed') then raise exception 'Sales follow-up is complete for this project. Your saved note remains on this device.'; end if;
   if p_expected_updated_at is null or project.updated_at <> p_expected_updated_at then raise exception 'This project changed on another device. Review the online project before retrying your saved notes.'; end if;
   if p_action in ('ready','assign-measurements') then
    measurement_assignee=coalesce(nullif(p_payload->>'assignedOutdoorSalesId','')::uuid,project.assigned_outdoor_sales_id);
    if measurement_assignee is null then raise exception 'Choose an eligible employee for measurements.'; end if;
    -- Lock the selected profile so deactivation cannot race the handoff.
    perform 1 from profiles where id=measurement_assignee and (role='Outdoor Sales' or (role='Indoor Sales' and id=project.created_by)) and is_active=true and status='Active' for share;
    if not found then raise exception 'Choose an eligible employee for measurements.'; end if;
    update projects set measurement_delayed=false,assigned_outdoor_sales_id=measurement_assignee,measurement_assignment_id=p_operation,
     structure_readiness='ready',sales_status='new_lead',
     next_follow_up_at=case when p_action='ready' then null else next_follow_up_at end,
     follow_up_owner_id=coalesce(follow_up_owner_id,case when actor_role='Indoor Sales' then p_actor end)
    where id=p_project;
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
 select jsonb_build_object('building_type',building_type,'client_cancellation_note',client_cancellation_note,'client_cancelled_at',client_cancelled_at,'client_cancelled_by',client_cancelled_by,'clientCancelledBy',(select coalesce(full_name,username,'Employee') from profiles where id=projects.client_cancelled_by),'measurement_delayed',measurement_delayed,'measurement_delay_note',measurement_delay_note,'measurement_delayed_at',measurement_delayed_at,'measurement_delayed_by',measurement_delayed_by,'measurementDelayedBy',(select coalesce(full_name,username,'Employee') from profiles where id=projects.measurement_delayed_by),'branch',branch,'assigned_outdoor_sales_id',assigned_outdoor_sales_id,'measurement_assignment_id',measurement_assignment_id,'assignedOutdoorSales',(select coalesce(full_name,username,'Employee') from profiles where id=projects.assigned_outdoor_sales_id),'assignedToYou',assigned_outdoor_sales_id=p_actor,'id',id,'project_number',project_number,'updated_at',updated_at,'sales_status',sales_status,'structure_readiness',structure_readiness,'next_follow_up_at',next_follow_up_at,'project_notes',project_notes,'readiness_note',readiness_note,'follow_up_type',follow_up_type,'follow_up_detail',follow_up_detail,'follow_up_owner_id',follow_up_owner_id,'follow_up_owner_name',(select coalesce(full_name,username,'Employee') from profiles where id=projects.follow_up_owner_id)) into result from projects where id=p_project;
 insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result) values(p_operation,p_actor,p_project,p_action,fingerprint,p_recorded_at,result);
 return result;
end $$;
revoke all on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz) to service_role;

commit;
