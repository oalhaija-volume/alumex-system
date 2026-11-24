-- Disposable PostgreSQL fixture only. No live database or real employee rows.
begin;
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql immutable strict set search_path=public as $$
  select case when start_branch='Rasafa' then 'Karkh' when start_branch='Karkh' then 'Rasafa' end;
$$;

do $employees$
declare label text; office text; job public.app_role;
begin
 foreach label in array array['admin','director','indoorK','duaa','indoorN','ehab','sajjad','mohd','ali','najaf'] loop
  office:=case when label in ('duaa','ehab','sajjad') then 'Rasafa' when label in ('najaf','indoorN') then 'Najaf'
   when label in ('admin','director') then null else 'Karkh' end;
  job:=case when label='admin' then 'Admin' when label='director' then 'Sales Director'
   when label in ('indoorK','duaa','indoorN') then 'Indoor Sales' else 'Outdoor Sales' end;
  insert into auth.users(id,email) values(md5('exception-'||label)::uuid,lower(label)||'.exception@example.invalid');
  insert into public.profiles(id,email,username,full_name,role,branch,outdoor_rotation_start_branch,outdoor_team_key,is_active,status)
   values(md5('exception-'||label)::uuid,lower(label)||'.exception@example.invalid','exception.'||lower(label),label,job,office,
    case when office in ('Karkh','Rasafa') then office end,
    case when label in ('ehab','sajjad') then 'sajjad_ehab' when label in ('mohd','ali') then 'ahmad_mohammad' end,true,'Active');
 end loop;
end;
$employees$;

do $projects$
declare label text; office text; creator uuid; collector uuid; payload jsonb; result jsonb;
begin
 foreach label in array array['target','otherRasafa','karkh','province','najaf'] loop
  office:=case when label in ('target','otherRasafa') then 'Rasafa' when label='province' then 'Governorates'
   when label='najaf' then 'Najaf' else 'Karkh' end;
  creator:=md5('exception-'||case when label in ('target','otherRasafa') then 'duaa' when label='najaf' then 'indoorN' else 'indoorK' end)::uuid;
  collector:=md5('exception-'||case when label='target' then 'mohd' when label='najaf' then 'najaf' else 'ehab' end)::uuid;
  payload:=jsonb_build_object('client',jsonb_build_object('clientName','Exception fixture','mobile','00000000000','clientType','individual'),
   'project',jsonb_build_object('branch',office,'address','Fixture site','structureReadiness','ready','buildingType','villa_house','assignedOutdoorSalesId',collector));
  if label='target' then payload:=jsonb_set(payload,'{project,legacyOutdoorSalesId}',to_jsonb(md5('exception-ehab')::uuid)); end if;
  if label='province' then payload:=jsonb_set(payload,'{project,governorate}','"البصرة"'); end if;
  result:=public.sync_field_change(md5('exception-register-'||label)::uuid,creator,md5('exception-project-'||label)::uuid,'register',payload,now(),null);
  assert result->'measurement_exception_employee_id'='null'::jsonb;
 end loop;
end;
$projects$;
insert into public.openings(id,project_id,created_by,opening_code,floor,room,width,height,quantity,opening_type,opening_direction)
 values(md5('exception-old-opening')::uuid,md5('exception-project-target')::uuid,md5('exception-mohd')::uuid,'EX-01','Ground Floor','Kitchen',120,150,1,'Window','Sliding');
create table fixture.exception_project_before as select to_jsonb(project) as value from public.projects project where id=md5('exception-project-target')::uuid;
create table fixture.exception_openings_before as select id,to_jsonb(opening) as value from public.openings opening;

do $admin_assignment$
declare site uuid:=md5('exception-project-target')::uuid; actor uuid:=md5('exception-admin')::uuid;
 operation uuid:=md5('exception-grant')::uuid; updated timestamptz; request jsonb; result jsonb; replay jsonb;
begin
 select updated_at into updated from public.projects where id=site;
 request:=jsonb_build_object('assignedOutdoorSalesId',md5('exception-ehab')::uuid,'measurementExceptionReason','  User requested one named task  ');
 result:=public.sync_field_change(operation,actor,site,'assign-measurements',request,now(),updated);
 replay:=public.sync_field_change(operation,actor,site,'assign-measurements',request,now(),updated);
 assert result=replay and result->>'measurement_exception_employee_id'=md5('exception-ehab')::uuid::text;
 assert result->>'measurement_exception_assignment_id'=operation::text;
 assert result->>'measurement_exception_reason'='User requested one named task';
 assert result->>'branch'='Rasafa' and result->'measurement_branch'='null'::jsonb;
 assert public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site);
 assert not public.employee_has_measurement_rotation_exception(md5('exception-sajjad')::uuid,site),'Exception leaked to teammate';
 assert not public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,md5('exception-project-otherRasafa')::uuid),'Exception leaked to another task';
 assert (select to_jsonb(project)-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at',
  'measurement_exception_employee_id','measurement_exception_assignment_id','measurement_exception_reason'] =
  (select value from fixture.exception_project_before)-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at',
  'measurement_exception_employee_id','measurement_exception_assignment_id','measurement_exception_reason']
  from public.projects project where id=site),'Exception changed Rasafa area, owner, sales credit, Duaa or project data';
 assert not exists(select 1 from public.openings opening join fixture.exception_openings_before before using(id) where to_jsonb(opening)<>before.value);
 assert (select count(*)=1 and bool_and(recipient_id=md5('exception-ehab')::uuid) from public.notifications
  where entity_id=site and event_type='measurement_assigned' and read_at is null),'Exception alert was shared with a teammate';
 assert coalesce(current_setting('alumex.measurement_rotation_exception',true),'')='';
end;
$admin_assignment$;

do $denied_grants$
declare site uuid:=md5('exception-project-target')::uuid; updated timestamptz; request jsonb; actor uuid; invalid jsonb;
begin
 select updated_at into updated from public.projects where id=site;
 request:=jsonb_build_object('assignedOutdoorSalesId',md5('exception-ehab')::uuid,'measurementExceptionReason','Named request');
 foreach actor in array array[md5('exception-duaa')::uuid,md5('exception-director')::uuid] loop
  begin perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',request,now(),updated);
   raise exception using errcode='ZX001',message='Non-Admin granted an exception';
  exception when insufficient_privilege then null;end;
 end loop;
 begin perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'assign-measurements',request-'measurementExceptionReason',now(),updated);
  raise exception using errcode='ZX001',message='Normal assignment bypassed rotation';
 exception when invalid_parameter_value then null;end;
 foreach invalid in array array['null'::jsonb,'123'::jsonb,'""'::jsonb,'"   "'::jsonb,to_jsonb(repeat('x',1001))] loop
  begin perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'assign-measurements',
   request||jsonb_build_object('measurementExceptionReason',invalid),now(),updated);
   raise exception using errcode='ZX001',message='Invalid reason accepted';
  exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'follow-up',request,now(),updated);
  raise exception using errcode='ZX001',message='Exception accepted outside assignment';
 exception when invalid_parameter_value then null;end;
 foreach site in array array[md5('exception-project-province')::uuid,md5('exception-project-najaf')::uuid] loop
  select updated_at into updated from public.projects where id=site;
  begin perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'assign-measurements',request,now(),updated);
   raise exception using errcode='ZX001',message='Exception crossed Governorates/Najaf boundary';
  exception when invalid_parameter_value then null;end;
 end loop;
 begin update public.projects set measurement_exception_reason='Forged direct service grant' where id=md5('exception-project-target')::uuid;
  raise exception using errcode='ZX001',message='Unscoped service mutation changed exception';
 exception when insufficient_privilege then null;end;
end;
$denied_grants$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $authenticated_visibility$
declare label text; expected boolean; site uuid:=md5('exception-project-target')::uuid;
begin
 foreach label in array array['ehab','sajjad','duaa','indoorK','najaf','admin'] loop
  perform set_config('request.jwt.claim.sub',md5('exception-'||label)::uuid::text,true);
  expected:=label in ('ehab','duaa','admin');
  assert public.can_access_indoor_project_branch(site)=expected,format('Wrong named exception visibility for %s',label);
  assert exists(select 1 from public.projects where id=site)=expected;
  assert public.current_employee_has_measurement_rotation_exception(site)=(label='ehab');
 end loop;
 perform set_config('request.jwt.claim.sub',md5('exception-ehab')::uuid::text,true);
 assert public.can_access_indoor_project_branch(md5('exception-project-karkh')::uuid),'Normal Karkh assignment disappeared';
 assert not public.can_access_indoor_project_branch(md5('exception-project-otherRasafa')::uuid);
 begin update public.projects set measurement_exception_reason='Forged browser grant' where id=site;
  raise exception using errcode='ZX001',message='Browser altered exception';
 exception when insufficient_privilege then null;end;
 begin perform public.employee_has_measurement_rotation_exception(auth.uid(),site);
  raise exception using errcode='ZX001',message='Browser executed actor-based private helper';
 exception when insufficient_privilege then null;end;
end;
$authenticated_visibility$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);

create table fixture.exception_before_cron as select to_jsonb(project) as value from public.projects project where id=md5('exception-project-target')::uuid;
do $cron_and_opening$
declare result jsonb; site uuid:=md5('exception-project-target')::uuid;
begin
 assert public.rotate_outdoor_measurement_tasks()>=1,'Ordinary overdue Rasafa work did not rotate';
 assert (select to_jsonb(project)=(select value from fixture.exception_before_cron) from public.projects project where id=site),
  'Cron overwrote the named exception';
 assert (select assigned_outdoor_sales_id in (md5('exception-mohd')::uuid,md5('exception-ali')::uuid)
  from public.projects where id=md5('exception-project-otherRasafa')::uuid),'Normal Rasafa team rotation changed';
 result:=public.sync_field_change(md5('exception-new-opening')::uuid,md5('exception-ehab')::uuid,site,'opening',
  jsonb_build_object('id',md5('exception-new-opening')::uuid,'floor','Ground Floor','room','Living Room','width',100,'height',150,
   'quantity',1,'structuralType','Window','openingType','Sliding','siteReadiness','ready'),now(),null);
 assert exists(select 1 from public.openings where id=md5('exception-new-opening')::uuid and created_by=md5('exception-ehab')::uuid),
  'Named employee could not save actual measurements';
 begin perform public.sync_field_change(gen_random_uuid(),md5('exception-sajjad')::uuid,site,'finish','{}',now(),null);
  raise exception using errcode='ZX001',message='Teammate inherited exception mutation access';
 exception when insufficient_privilege then null;end;
end;
$cron_and_opening$;

do $lifecycle$
declare site uuid:=md5('exception-project-target')::uuid; updated timestamptz; result jsonb; request jsonb;
begin
 -- A changed task version invalidates the grant, even with the same assignee.
 begin
  update public.projects set measurement_assignment_id=gen_random_uuid() where id=site;
  assert not public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site);
  assert (select measurement_exception_employee_id is null from public.projects where id=site);
  raise exception using errcode='ZX002',message='Rollback version fixture';
 exception when sqlstate 'ZX002' then null;end;
 begin
  update public.projects set archived_at=now(),archive_reason='Fixture archive' where id=site;
  assert not public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site);
  assert (select measurement_exception_employee_id is null from public.projects where id=site);
  raise exception using errcode='ZX002',message='Rollback archive fixture';
 exception when sqlstate 'ZX002' then null;end;
 assert public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site);
 update public.profiles set is_active=false,status='Inactive' where id=md5('exception-ehab')::uuid;
 assert not public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site);
 perform public.rotate_outdoor_measurement_tasks();
 assert (select measurement_exception_employee_id is null from public.projects where id=site),'Inactive exception pinned cron forever';
 update public.profiles set is_active=true,status='Active' where id=md5('exception-ehab')::uuid;
 select updated_at into updated from public.projects where id=site;
 request:=jsonb_build_object('assignedOutdoorSalesId',md5('exception-ehab')::uuid,'measurementExceptionReason',repeat('x',1000));
 perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'assign-measurements',request,now(),updated);
 select updated_at into updated from public.projects where id=site;
 result:=public.sync_field_change(gen_random_uuid(),md5('exception-duaa')::uuid,site,'assign-measurements',
  jsonb_build_object('assignedOutdoorSalesId',md5('exception-mohd')::uuid),now(),updated);
 assert result->'measurement_exception_employee_id'='null'::jsonb,'Normal reassignment retained exception';
 select updated_at into updated from public.projects where id=site;
 perform public.sync_field_change(gen_random_uuid(),md5('exception-admin')::uuid,site,'assign-measurements',request,now(),updated);
 result:=public.sync_field_change(gen_random_uuid(),md5('exception-ehab')::uuid,site,'finish','{}',now(),null);
 assert result->>'sales_status'='ready_for_quotation';
 assert result->'measurement_exception_employee_id'='null'::jsonb;
 assert not public.employee_has_measurement_rotation_exception(md5('exception-ehab')::uuid,site),'Completed task retained cross-area exception';
 assert public.acknowledge_hidden_field_receipt(md5('exception-new-opening')::uuid,md5('exception-ehab')::uuid,site,'opening',
  jsonb_build_object('id',md5('exception-new-opening')::uuid,'floor','Ground Floor','room','Living Room','width',100,'height',150,
   'quantity',1,'structuralType','Window','openingType','Sliding','siteReadiness','ready')),
  'Completing the exception stranded an already committed device operation';
 assert (select branch='Rasafa' and measurement_branch is null and owner_id=md5('exception-ehab')::uuid
  and follow_up_owner_id=md5('exception-duaa')::uuid from public.projects where id=site);
end;
$lifecycle$;
rollback;
