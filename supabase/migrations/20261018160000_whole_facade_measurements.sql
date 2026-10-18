begin;
-- Whole facades share measurement assignment, offline sync and quotation locks.
-- Existing opening records on facades remain unchanged.
alter table public.openings add constraint openings_whole_facade check (
 opening_type is distinct from 'Facade' or (
 work_area is not distinct from 'facade' and floor is not distinct from 'Whole building'
 and quantity=1 and opening_direction is null and width>0 and height>0 and width<=100000 and height<=100000
 ));
create unique index openings_whole_facade_number on public.openings(project_id,facade_number) where opening_type='Facade';
create or replace function public.sync_field_change(p_operation uuid,p_actor uuid,p_project uuid,p_action text,p_payload jsonb,p_recorded_at timestamptz,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; saved public.field_sync_receipts; project public.projects; client_id uuid; result jsonb; fingerprint text; number_prefix text; next_sequence bigint; new_number text; measurement_assignee uuid; opening_quantity numeric; measured public.openings; edit jsonb; previous jsonb;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null or actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales','Outdoor Sales') then raise exception 'Sales access required'; end if;
 if p_action in ('follow-up','ready','assign-measurements','resume-measurements','request-openings') and actor_role not in ('Indoor Sales','Admin','Sales Director','CEO','Company Owner') then raise exception 'CRM access is limited to Indoor Sales and company leadership.'; end if;
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
  if project.additional_openings_state is not null and p_action in ('opening','edit-opening','finish','reopen') then
   if project.additional_openings_state<>'requested' then raise exception 'Ask Indoor Sales to assign another additional-openings task.'; end if;
   if actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is distinct from p_actor then raise exception 'Only the assigned employee can complete this task.'; end if;
   if p_action='edit-opening' and (p_payload#>>'{opening,id}')::uuid=any(project.additional_openings_original_ids) then raise exception 'Existing measurements are preserved. Add the new openings separately.'; end if;
   if p_action='finish' and not exists(select 1 from openings where project_id=p_project and not(id=any(project.additional_openings_original_ids))) then raise exception 'Add at least one new opening before submitting this task.'; end if;
  end if;
  if p_action='request-openings' then
   if project.structure_readiness<>'ready' or project.sales_status not in ('ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated')
     or exists(select 1 from sales_workflows where project_id=p_project and signed_at is not null) then raise exception 'Additional openings can only be requested after measurements and before signing.'; end if;
   if p_expected_updated_at is null or project.updated_at<>p_expected_updated_at then raise exception 'This project changed on another device. Review the online project before retrying your saved notes.'; end if;
   measurement_assignee=nullif(p_payload->>'assignedOutdoorSalesId','')::uuid;
   perform 1 from profiles where id=measurement_assignee and role='Outdoor Sales' and is_active=true and status='Active' for share;
   if not found then raise exception 'Choose an active Outdoor Sales employee.'; end if;
   update projects set additional_openings_state='requested',additional_openings_original_ids=array(select id from openings where project_id=p_project),
    assigned_outdoor_sales_id=measurement_assignee,measurement_assignment_id=p_operation,measurement_delayed=false,sales_status='new_lead',status='Draft',
    follow_up_owner_id=coalesce(follow_up_owner_id,case when actor_role='Indoor Sales' then p_actor end) where id=p_project;
   -- Invalidate stale commercial forms without replacing the saved quotation or contract.
   update sales_workflows set revision=revision+1,updated_at=now() where project_id=p_project;
  elsif p_action='cancel-project' then
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
   if row(measured.width,measured.height,measured.quantity,measured.floor,measured.room,measured.opening_type,measured.opening_direction,measured.has_arch,measured.has_roller_shutter,measured.work_area,measured.facade_number)
      is distinct from row((previous->>'width')::numeric,(previous->>'height')::numeric,coalesce((previous->>'quantity')::numeric,1),previous->>'floor',case when previous->>'room'='Other' then previous->>'otherRoom' else previous->>'room' end,previous->>'structuralType',previous->>'openingType',normalize_opening_arch(previous->'hasArch',previous->>'structuralType'),normalize_opening_shutter(previous->'hasRollerShutter',previous->>'structuralType'),previous->>'workArea',(previous->>'facadeNumber')::integer) then
    raise exception 'This opening changed on another device. Reload measurements before editing it again.';
   end if;
   perform validate_commercial_location(edit,project.building_type);
   if jsonb_typeof(edit->'width') is distinct from 'number' or jsonb_typeof(edit->'height') is distinct from 'number'
      or (edit->>'width')::numeric<=0 or (edit->>'width')::numeric>100000 or (edit->>'height')::numeric<=0 or (edit->>'height')::numeric>100000
      or coalesce(trim(edit->>'floor'),'')='' or length(edit->>'floor')>100
      or coalesce(edit->>'room','') not in ('Living room','Bedroom','Kitchen','Bathroom','Dining room','Office','Hallway','Staircase','Balcony','Storage room','Other')
      or (edit->>'room'='Other' and (coalesce(trim(edit->>'otherRoom'),'')='' or length(edit->>'otherRoom')>100))
      or coalesce(edit->>'structuralType','') not in ('Window','Door','Louver','Curtain Wall','Skylight','Facade')
      or (edit->>'structuralType' in ('Window','Door') and coalesce(edit->>'openingType','') not in ('Sliding','Hinged'))
      or (edit->>'structuralType'='Louver' and (edit->>'openingType') is distinct from 'Hinged')
      or (edit->>'structuralType' in ('Curtain Wall','Skylight','Facade') and edit->>'openingType' is not null)
      then raise exception 'Complete the opening details.'; end if;
   if edit ? 'quantity' and jsonb_typeof(edit->'quantity') is distinct from 'number' then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   opening_quantity=coalesce((edit->>'quantity')::numeric,1);
   if opening_quantity<1 or opening_quantity>10000 or opening_quantity<>trunc(opening_quantity) then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   if measured.curtain_wall_capture is not null and edit->>'structuralType'<>'Curtain Wall' then raise exception 'A saved Curtain Wall photo and note must remain attached to a Curtain Wall.'; end if;
   if measured.skylight_capture is not null and edit->>'structuralType'<>'Skylight' then raise exception 'A saved skylight shape must remain attached to a skylight.'; end if;
   update openings set work_area=edit->>'workArea',facade_number=(edit->>'facadeNumber')::integer,floor=trim(edit->>'floor'),room=case when edit->>'room'='Other' then trim(edit->>'otherRoom') else edit->>'room' end,
    width=(edit->>'width')::numeric,height=(edit->>'height')::numeric,quantity=opening_quantity::integer,
    has_arch=normalize_opening_arch(edit->'hasArch',edit->>'structuralType'),has_roller_shutter=normalize_opening_shutter(edit->'hasRollerShutter',edit->>'structuralType'),opening_type=edit->>'structuralType',opening_direction=edit->>'openingType' where id=measured.id and project_id=p_project;
  elsif p_action in ('opening','finish','reopen') then
   if project.measurement_delayed then raise exception 'Resume measurements before recording or completing them.'; end if;
   if project.structure_readiness <> 'ready' or project.sales_status not in ('new_lead','ready_for_quotation') then raise exception 'Measurements are locked or the site is not ready'; end if;
   if p_action='opening' then
    if project.sales_status <> 'new_lead' then raise exception 'Reopen measurements before adding an opening'; end if;
    if p_payload ? 'quantity' and jsonb_typeof(p_payload->'quantity') is distinct from 'number' then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
    opening_quantity=coalesce((p_payload->>'quantity')::numeric,1);
    if opening_quantity<1 or opening_quantity>10000 or opening_quantity<>trunc(opening_quantity) then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
    perform validate_commercial_location(p_payload,project.building_type);
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,skylight_capture,curtain_wall_capture,has_arch,has_roller_shutter,work_area,facade_number)
    values((p_payload->>'id')::uuid,p_project,'OP-'||(p_payload->>'id'),p_payload->>'floor',case when p_payload->>'room'='Other' then p_payload->>'otherRoom' else p_payload->>'room' end,(p_payload->>'width')::numeric,(p_payload->>'height')::numeric,opening_quantity::integer,p_payload->>'structuralType',p_payload->>'openingType','ready',p_actor,nullif(p_payload->'skylight','null'::jsonb),nullif(p_payload->'curtainWall','null'::jsonb),normalize_opening_arch(p_payload->'hasArch',p_payload->>'structuralType'),normalize_opening_shutter(p_payload->'hasRollerShutter',p_payload->>'structuralType'),p_payload->>'workArea',(p_payload->>'facadeNumber')::integer);
   elsif p_action='finish' then
    if p_payload ? 'note' and jsonb_typeof(p_payload->'note') not in ('string','null') then raise exception 'Keep the measurement note under 2,000 characters.'; end if;
    if length(trim(coalesce(p_payload->>'note','')))>2000 then raise exception 'Keep the measurement note under 2,000 characters.'; end if;
    if p_payload ? 'photo' and jsonb_typeof(p_payload->'photo') not in ('string','null') then raise exception 'Choose a valid measurement photo.'; end if;
    if length(coalesce(p_payload->>'photo',''))>700000 or (coalesce(p_payload->>'photo','')<>'' and p_payload->>'photo' !~ '^(data:image/jpeg;base64,/9j/|data:image/png;base64,iVBORw0KGgo)[A-Za-z0-9+/]*={0,2}$') then raise exception 'Choose a valid measurement photo.'; end if;
    if coalesce(nullif(trim(p_payload->>'note'),''),nullif(p_payload->>'photo','')) is not null then
     if project.sales_status<>'new_lead' then raise exception 'Measurements already submitted. Reload this project.'; end if;
     if p_recorded_at is null or not isfinite(p_recorded_at) then raise exception 'A valid recording time is required.'; end if;
     insert into measurement_completion_reports(id,project_id,note,photo,recorded_by,recorded_by_name,recorded_at)
     values(p_operation,p_project,trim(coalesce(p_payload->>'note','')),nullif(p_payload->>'photo',''),p_actor,
      (select coalesce(full_name,username,'Employee') from profiles where id=p_actor),p_recorded_at);
    end if;
    if not exists(select 1 from openings where project_id=p_project) or exists(select 1 from openings where project_id=p_project and (coalesce(floor,'')='' or coalesce(room,'')='' or width<=0 or height<=0 or quantity is null or quantity<1 or quantity>10000 or opening_type is null)) then raise exception 'Complete every opening before finishing measurements'; end if;
    update projects set sales_status='ready_for_quotation',status='Quotation',additional_openings_state=case when additional_openings_state='requested' then 'submitted' else additional_openings_state end where id=p_project;
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
 select jsonb_build_object('additional_openings_state',additional_openings_state,'additional_openings_original_ids',additional_openings_original_ids,'building_type',building_type,'client_cancellation_note',client_cancellation_note,'client_cancelled_at',client_cancelled_at,'client_cancelled_by',client_cancelled_by,'clientCancelledBy',(select coalesce(full_name,username,'Employee') from profiles where id=projects.client_cancelled_by),'measurement_delayed',measurement_delayed,'measurement_delay_note',measurement_delay_note,'measurement_delayed_at',measurement_delayed_at,'measurement_delayed_by',measurement_delayed_by,'measurementDelayedBy',(select coalesce(full_name,username,'Employee') from profiles where id=projects.measurement_delayed_by),'branch',branch,'assigned_outdoor_sales_id',assigned_outdoor_sales_id,'measurement_assignment_id',measurement_assignment_id,'assignedOutdoorSales',(select coalesce(full_name,username,'Employee') from profiles where id=projects.assigned_outdoor_sales_id),'assignedToYou',assigned_outdoor_sales_id=p_actor,'id',id,'project_number',project_number,'updated_at',updated_at,'sales_status',sales_status,'structure_readiness',structure_readiness,'next_follow_up_at',next_follow_up_at,'project_notes',project_notes,'readiness_note',readiness_note,'follow_up_type',follow_up_type,'follow_up_detail',follow_up_detail,'follow_up_owner_id',follow_up_owner_id,'follow_up_owner_name',(select coalesce(full_name,username,'Employee') from profiles where id=projects.follow_up_owner_id)) into result from projects where id=p_project;
 insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result) values(p_operation,p_actor,p_project,p_action,fingerprint,p_recorded_at,result);
 return result;
end $$;

create or replace function public.advance_sales_flow(p_project uuid,p_action text,p_revision integer,p_payload jsonb,p_actor uuid)
returns public.sales_workflows language plpgsql security definer set search_path=public as $$
declare f public.sales_workflows; project public.projects; actor_role text; line jsonb; opening jsonb; existing public.openings; quote_version integer; opening_quantity numeric;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null then raise exception 'Inactive employee'; end if;
 select * into project from projects where id=p_project for update;
 if not found then raise exception 'Project not found'; end if;
 if project.sales_status in ('cancelled','lost','closed') then raise exception 'This project is closed. Its quotation and contract history is read-only.'; end if;
 if p_action='accept' then
  if actor_role not in ('Admin','CEO','Company Owner','Operations Manager') then raise exception 'Not allowed'; end if;
 else
  if actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') then raise exception 'Quotations and contracts are handled by Indoor Sales and company leadership.' using errcode='42501'; end if;
 end if;
 select * into f from sales_workflows where project_id=p_project for update;
 if coalesce(f.revision,0) <> p_revision then raise exception 'This project changed. Reload before continuing.'; end if;
 if project.additional_openings_state='requested' or (project.additional_openings_state='submitted' and p_action<>'save') then raise exception 'Complete the additional measurements and save a quotation revision before continuing.'; end if;
 if p_action='save' then
  if f.signed_at is not null or (f.stage is not null and f.stage not in ('quotation','approved','contract')) then raise exception 'Signed contracts cannot be changed.'; end if;
  if project.sales_status::text not in ('ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated') and not (project.sales_status::text='new_lead' and project.structure_readiness::text='ready' and not exists(select 1 from openings where project_id=p_project and opening_type is distinct from 'Skylight') and jsonb_array_length(coalesce(p_payload->'additionalItems','[]'::jsonb))>0) then raise exception 'Complete measurements first.'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or (coalesce(jsonb_array_length(p_payload->'lines'),0) + coalesce(jsonb_array_length(p_payload->'additionalItems'),0)) < 1 or coalesce((p_payload->>'total')::numeric,0) <= 0 then raise exception 'Incomplete quotation'; end if;
  if (select count(distinct x#>>'{opening,id}') from jsonb_array_elements(p_payload->'lines') x) <> jsonb_array_length(p_payload->'lines') then raise exception 'Duplicate opening'; end if;
  -- Recheck the measured set under the project lock, including changes since API pricing.
  if exists(select 1 from openings o where o.project_id=p_project and o.opening_type is distinct from 'Skylight' and o.opening_type is distinct from 'Facade' and not exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=o.id::text)) then raise exception 'Measurements changed. Reload the quotation.'; end if;
  -- Check the complete facade snapshot under the project lock as for priced openings.
  if jsonb_typeof(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) is distinct from 'array'
   or coalesce(jsonb_array_length(p_payload->'facadeMeasurements'),0)<>(select count(*) from openings where project_id=p_project and opening_type='Facade')
   or exists(select 1 from openings o where o.project_id=p_project and o.opening_type='Facade' and not exists(
    select 1 from jsonb_array_elements(coalesce(p_payload->'facadeMeasurements','[]'::jsonb)) x
    where x @> jsonb_build_object('id',o.id,'width',o.width,'height',o.height,'opening_type','Facade','facade_number',o.facade_number)
   )) then raise exception 'Facade dimensions changed. Reload the quotation.'; end if;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   perform normalize_opening_arch(opening->'has_arch',opening->>'opening_type');
   perform normalize_opening_shutter(opening->'has_roller_shutter',opening->>'opening_type');
   if opening ? 'quantity' and jsonb_typeof(opening->'quantity') is distinct from 'number' then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   opening_quantity=coalesce((opening->>'quantity')::numeric,1);
   if opening_quantity<1 or opening_quantity>10000 or opening_quantity<>trunc(opening_quantity) then raise exception 'Enter a whole-number opening quantity between 1 and 10,000.'; end if;
   if coalesce(opening->>'floor','')='' or length(opening->>'floor')>100 or coalesce(opening->>'room','')='' or length(opening->>'room')>100
     or coalesce((opening->>'width')::numeric,0) not between 0.01 and 100000 or coalesce((opening->>'height')::numeric,0) not between 0.01 and 100000
     or coalesce(opening->>'opening_type','') not in ('Window','Door','Louver','Curtain Wall')
     or (opening->>'opening_type' in ('Window','Door') and coalesce(opening->>'opening_direction','') not in ('Sliding','Hinged'))
     or (opening->>'opening_type'='Louver' and opening->>'opening_direction' is distinct from 'Hinged')
     or (opening->>'opening_type' in ('Curtain Wall','Skylight') and opening->>'opening_direction' is not null)
     then raise exception 'Incomplete opening measurements'; end if;
   select * into existing from openings where id=(opening->>'id')::uuid;
   if found and (existing.project_id is distinct from p_project or existing.has_roller_shutter is distinct from normalize_opening_shutter(opening->'has_roller_shutter',opening->>'opening_type') or existing.has_arch is distinct from normalize_opening_arch(opening->'has_arch',opening->>'opening_type') or existing.quantity is distinct from opening_quantity::integer or
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
  update projects set sales_status='quotation_in_progress',status='Quotation',additional_openings_state=null,additional_openings_original_ids='{}' where id=p_project;
  -- Insert only after the authoritative snapshot exists; the trigger below permits
  -- these exact new measurements and rejects changes to any existing opening.
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   perform normalize_opening_arch(opening->'has_arch',opening->>'opening_type');
   perform normalize_opening_shutter(opening->'has_roller_shutter',opening->>'opening_type');
   if not exists(select 1 from openings where id=(opening->>'id')::uuid) then
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by,has_arch,has_roller_shutter)
    values((opening->>'id')::uuid,p_project,'OP-'||(opening->>'id'),opening->>'floor',opening->>'room',(opening->>'width')::numeric,(opening->>'height')::numeric,coalesce((opening->>'quantity')::numeric,1)::integer,opening->>'opening_type',opening->>'opening_direction','ready',p_actor,normalize_opening_arch(opening->'has_arch',opening->>'opening_type'),normalize_opening_shutter(opening->'has_roller_shutter',opening->>'opening_type'));
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


notify pgrst, 'reload schema';
commit;
