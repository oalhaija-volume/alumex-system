begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 registration uuid:=gen_random_uuid(); assignment uuid:=gen_random_uuid(); payload jsonb; result jsonb; stamp timestamptz;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 payload:='{"client":{"clientName":"Not ready CRM handoff","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"not_ready","readinessNote":"Walls unfinished","buildingType":"villa_house"}}';
 result:=sync_field_change(registration,outdoor,site,'register',payload,now(),null);
 assert result->>'structure_readiness'='not_ready';
 assert (select structure_readiness='not_ready' and sales_status='new_lead' and assigned_outdoor_sales_id is null and measurement_assignment_id is null from projects where id=site),'Registration must not assign or promote a not-ready project';
 assert sync_field_change(registration,outdoor,site,'register',payload,now(),null)=result,'Sync retry must preserve not-ready registration';
 select updated_at into stamp from projects where id=site;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'ready',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
  raise exception using errcode='ZX001',message='Outdoor self-assigned a CRM project';
 exception when sqlstate 'P0001' then assert sqlerrm='CRM access is limited to Indoor Sales and company leadership.';end;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_build_object('id',gen_random_uuid(),'floor','GF','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding','hasArch',false),now(),stamp);
  raise exception using errcode='ZX001',message='Not-ready project accepted measurements';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements are locked or the site is not ready';end;
 perform sync_field_change(gen_random_uuid(),indoor,site,'follow-up',jsonb_build_object('note','Waiting for site','nextFollowUp','2026-11-08T07:00:00Z','followUpType','call','followUpOwnerId',indoor),now(),stamp);
 assert (select structure_readiness='not_ready' and assigned_outdoor_sales_id is null and measurement_assignment_id is null from projects where id=site),'A CRM follow-up must not assign measurements';
 select updated_at into stamp from projects where id=site;
 begin
  perform sync_field_change(gen_random_uuid(),indoor,site,'ready','{}',now(),stamp);
  raise exception using errcode='ZX001',message='Site promoted without choosing an employee';
 exception when sqlstate 'P0001' then assert sqlerrm='Choose an eligible employee for measurements.';end;
 result:=sync_field_change(assignment,indoor,site,'ready',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
 assert (select structure_readiness='ready' and assigned_outdoor_sales_id=outdoor and measurement_assignment_id=assignment and readiness_note='Walls unfinished' from projects where id=site),'Only the explicit CRM assignment creates the measurement task';
 assert sync_field_change(assignment,indoor,site,'ready',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp)=result;
 raise notice 'PASS: not-ready registration and retries stay in CRM; follow-ups do not assign; only an explicit Indoor assignment releases measurements';
end $$;
rollback;
