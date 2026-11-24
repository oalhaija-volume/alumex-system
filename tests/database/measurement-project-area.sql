-- Disposable PostgreSQL fixture only. Never install this fixture calendar live.
begin;
create table fixture.area_clock(at_time timestamptz not null);
insert into fixture.area_clock values('2026-11-24T08:00:00Z');
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql stable strict set search_path=public as $$
  select case when start_branch not in ('Karkh','Rasafa') then null
    when extract(day from instant at time zone 'Asia/Baghdad')<=15 then start_branch
    when start_branch='Karkh' then 'Rasafa' else 'Karkh' end
  from (select at_time as instant from fixture.area_clock) clock;
$$;

do $employees$
declare label text; job public.app_role; office text;
begin
  foreach label in array array['admin','indoorK','indoorR','indoorN','ehab','sajjad','mohd','ali','najaf','inactive'] loop
    office:=case when label in ('ehab','sajjad','indoorR') then 'Rasafa'
      when label in ('najaf','indoorN') then 'Najaf' when label='admin' then null else 'Karkh' end;
    job:=case when label='admin' then 'Admin' when label like 'indoor%' then 'Indoor Sales' else 'Outdoor Sales' end;
    insert into auth.users(id,email) values(md5('area-'||label)::uuid,label||'.area@example.invalid');
    insert into public.profiles(id,email,username,full_name,role,branch,outdoor_rotation_start_branch,outdoor_team_key,is_active,status)
      values(md5('area-'||label)::uuid,label||'.area@example.invalid','area.'||lower(label),label,job,office,
        case when office in ('Karkh','Rasafa') then office end,
        case when label in ('ehab','sajjad') then 'sajjad_ehab' when label in ('mohd','ali') then 'ahmad_mohammad' end,
        label<>'inactive',case when label='inactive' then 'Inactive' else 'Active' end);
  end loop;
end;
$employees$;

do $registered_projects$
declare label text; actor uuid; collector uuid; payload jsonb; branch text; result jsonb;
begin
  foreach label in array array['primary','second','third','default','province','najaf'] loop
    branch:=case when label='province' then 'Governorates' when label='najaf' then 'Najaf' else 'Karkh' end;
    actor:=md5('area-'||case when label='najaf' then 'indoorN' else 'indoorK' end)::uuid;
    collector:=md5('area-'||case when label='najaf' then 'najaf' else 'ehab' end)::uuid;
    payload:=jsonb_build_object('client',jsonb_build_object('clientName','Area fixture '||label,'clientType','individual','mobile','00000000000'),
      'project',jsonb_build_object('branch',branch,'address','Fixture site','structureReadiness','ready',
        'buildingType','villa_house','assignedOutdoorSalesId',collector));
    if label='province' then payload:=jsonb_set(payload,'{project,governorate}','"البصرة"'); end if;
    if label='primary' then payload:=jsonb_set(payload,'{project,legacyOutdoorSalesId}',to_jsonb(collector)); end if;
    result:=public.sync_field_change(md5('area-register-'||label)::uuid,actor,md5('area-project-'||label)::uuid,'register',payload,now(),null);
    assert result ? 'measurement_branch' and result->'measurement_branch'='null'::jsonb,'Registration did not retain null area fallback';
  end loop;
end;
$registered_projects$;

insert into public.openings(id,project_id,created_by,opening_code,floor,room,width,height,quantity,opening_type,opening_direction)
  values(md5('area-opening')::uuid,md5('area-project-primary')::uuid,md5('area-ehab')::uuid,'AREA-01','Ground Floor','Living Room',120,150,1,'Window','Sliding');
update public.projects set additional_openings_state='requested',additional_openings_original_ids=array[md5('area-opening')::uuid]
  where id=md5('area-project-primary')::uuid;
insert into public.sales_workflows(project_id,revision,stage,quotation)
  values(md5('area-project-primary')::uuid,7,'quotation','{"total":123456,"historical":"Preserve unchanged"}');
create table fixture.area_projects_before as select id,to_jsonb(project) as value from public.projects project;
create table fixture.area_openings_before as select id,to_jsonb(opening) as value from public.openings opening;
create table fixture.area_quotes_before as select project_id,to_jsonb(flow) as value from public.sales_workflows flow;

do $assign_physical_area$
declare label text; actor uuid:=md5('area-indoorK')::uuid; site uuid; updated timestamptz; request jsonb; result jsonb; replay jsonb;
begin
  foreach label in array array['primary','second','third'] loop
    site:=md5('area-project-'||label)::uuid;
    select updated_at into updated from public.projects where id=site;
    request:=jsonb_build_object('assignedOutdoorSalesId',md5('area-'||case when label='third' then 'ali' else 'mohd' end)::uuid,
      'measurementBranch','Rasafa');
    result:=public.sync_field_change(md5('area-assign-'||label)::uuid,actor,site,'assign-measurements',request,now(),updated);
    replay:=public.sync_field_change(md5('area-assign-'||label)::uuid,actor,site,'assign-measurements',request,now(),updated);
    assert result=replay,'Area assignment receipt lost idempotence';
    assert result->>'measurement_branch'='Rasafa' and result->>'branch'='Karkh';
    assert (select branch='Karkh' and measurement_branch='Rasafa' and
      assigned_outdoor_sales_id=(request->>'assignedOutdoorSalesId')::uuid and measurement_assignment_id=md5('area-assign-'||label)::uuid
      from public.projects where id=site),'Area and collector were not updated atomically';
    assert (select to_jsonb(project)-array['measurement_branch','assigned_outdoor_sales_id','measurement_assignment_id','updated_at'] =
      before.value-array['measurement_branch','assigned_outdoor_sales_id','measurement_assignment_id','updated_at']
      from public.projects project join fixture.area_projects_before before on before.id=project.id where project.id=site),
      'Area correction changed originating office, original credit, follow-up, delay or other project data';
  end loop;
  assert coalesce(current_setting('alumex.measurement_area_assignment',true),'')='','Assignment context leaked to later statements';
  assert not exists(select 1 from public.openings opening join fixture.area_openings_before before on opening.id=before.id
    where to_jsonb(opening)<>before.value),'Existing measurements changed';
  assert not exists(select 1 from public.sales_workflows flow join fixture.area_quotes_before before using(project_id)
    where to_jsonb(flow)<>before.value),'Quotation, prices or revisions changed';
end;
$assign_physical_area$;

do $malformed_and_wrong_team$
declare site uuid:=md5('area-project-primary')::uuid; actor uuid:=md5('area-indoorK')::uuid;
  updated timestamptz; request jsonb; invalid jsonb; previous jsonb;
begin
  select updated_at,to_jsonb(project) into updated,previous from public.projects project where id=site;
  request:=jsonb_build_object('assignedOutdoorSalesId',md5('area-mohd')::uuid);
  foreach invalid in array array['null'::jsonb,'123'::jsonb,'"Najaf"'::jsonb,'"Governorates"'::jsonb,'""'::jsonb] loop
    begin
      perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',request||jsonb_build_object('measurementBranch',invalid),now(),updated);
      raise exception using errcode='ZX001',message='Malformed area was accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',
      jsonb_build_object('assignedOutdoorSalesId',md5('area-ehab')::uuid,'measurementBranch','Rasafa'),now(),updated);
    raise exception using errcode='ZX001',message='A collector from the opposite current area was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.sync_field_change(gen_random_uuid(),actor,site,'follow-up',request||'{"measurementBranch":"Rasafa"}',now(),updated);
    raise exception using errcode='ZX001',message='Another field action accepted measurementBranch';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',
      jsonb_build_object('assignedOutdoorSalesId',md5('area-inactive')::uuid,'measurementBranch','Rasafa'),now(),updated);
    raise exception using errcode='ZX001',message='Inactive collector was accepted';
  exception when raise_exception then assert sqlerrm='Choose an eligible employee for measurements.'; end;
  assert (select to_jsonb(project)=previous from public.projects project where id=site),'Denied assignment changed the project';
  -- An omitted area preserves the verified override, rather than restoring office.
  perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',request,now(),updated);
  assert (select measurement_branch='Rasafa' from public.projects where id=site);
  foreach site in array array[md5('area-project-province')::uuid,md5('area-project-najaf')::uuid] loop
    actor:=md5('area-'||case when site=md5('area-project-najaf')::uuid then 'indoorN' else 'indoorK' end)::uuid;
    select updated_at into updated from public.projects where id=site;
    begin
      perform public.sync_field_change(gen_random_uuid(),actor,site,'assign-measurements',request||'{"measurementBranch":"Karkh"}',now(),updated);
      raise exception using errcode='ZX001',message='Non-Baghdad project accepted an area override';
    exception when invalid_parameter_value then null; end;
  end loop;
end;
$malformed_and_wrong_team$;

do $direct_service_denial$
begin
  begin
    update public.projects set measurement_branch='Karkh' where id=md5('area-project-primary')::uuid;
    raise exception using errcode='ZX001',message='Unscoped service update changed the area';
  exception when insufficient_privilege then null; end;
end;
$direct_service_denial$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $read_and_write_boundaries$
declare label text; visible boolean;
begin
  foreach label in array array['ehab','sajjad','mohd','ali','indoorK','indoorR','indoorN','najaf','admin'] loop
    perform set_config('request.jwt.claim.sub',md5('area-'||label)::uuid::text,true);
    visible:=label in ('mohd','ali','indoorK','admin');
    assert public.can_access_indoor_project_branch(md5('area-project-primary')::uuid)=visible,format('Wrong physical/commercial access for %s',label);
    assert exists(select 1 from public.projects where id=md5('area-project-primary')::uuid)=visible;
    if label='ehab' then
      assert not exists(select 1 from public.notifications where entity_type='project' and entity_id=md5('area-project-primary')::uuid),
        'Old project notification leaked the physical opposite area';
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',md5('area-indoorK')::uuid::text,true);
  begin
    update public.projects set measurement_branch='Karkh' where id=md5('area-project-primary')::uuid;
    raise exception using errcode='ZX001',message='Authenticated update changed the area';
  exception when insufficient_privilege then null; end;
end;
$read_and_write_boundaries$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);

do $old_hidden_receipt$
declare site uuid:=md5('area-project-primary')::uuid; actor uuid:=md5('area-ehab')::uuid;
  operation uuid:=md5('area-old-committed')::uuid; request jsonb:='{"old":"opening"}'; before_receipt jsonb;
begin
  insert into public.field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(operation,actor,site,'opening',md5(request::text||'opening'||site::text),now(),'{"privateSnapshot":"Never expose"}');
  select to_jsonb(saved) into before_receipt from public.field_sync_receipts saved where operation_id=operation;
  assert public.acknowledge_hidden_field_receipt(operation,actor,site,'opening',request),
    'Physical area correction stranded an exact committed hidden operation';
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'opening','{"changed":true}');
  begin
    perform public.sync_field_change(operation,actor,site,'opening',request,now(),null);
    raise exception using errcode='ZX001',message='Normal hidden receipt returned its project snapshot';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_field_change(gen_random_uuid(),actor,site,'opening',request,now(),null);
    raise exception using errcode='ZX001',message='Fresh opposite-physical-area write was accepted';
  exception when insufficient_privilege then null; end;
  assert (select to_jsonb(saved)=before_receipt from public.field_sync_receipts saved where operation_id=operation);
end;
$old_hidden_receipt$;

-- Rotation must follow verified site area, including load balancing, while
-- retaining commercial attribution, saved prices, partial captures and delays.
update public.projects set measurement_delayed=true,measurement_delay_reason='client_no_answer',
  measurement_delay_note='Preserve delay',measurement_delayed_at=now(),measurement_delayed_by=md5('area-mohd')::uuid
  where id=md5('area-project-primary')::uuid;
create table fixture.before_area_rotation as select id,to_jsonb(project) as value from public.projects project;
update fixture.area_clock set at_time='2026-11-30T21:00:00Z';
do $physical_rotation$
declare label text; site uuid; moved integer;
begin
  moved:=public.rotate_outdoor_measurement_tasks(); assert moved>=3;
  foreach label in array array['primary','second','third'] loop
    site:=md5('area-project-'||label)::uuid;
    assert (select branch='Karkh' and measurement_branch='Rasafa' and assigned_outdoor_sales_id in
      (md5('area-ehab')::uuid,md5('area-sajjad')::uuid) from public.projects where id=site),
      'Rotation used the originating office instead of the physical site area';
    assert (select to_jsonb(project)-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at'] =
      before.value-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at']
      from public.projects project join fixture.before_area_rotation before using(id) where project.id=site),
      'Physical rotation changed original credit, site area, follow-up or delay';
  end loop;
  assert (select count(distinct assigned_outdoor_sales_id)=2 from public.projects
    where measurement_branch='Rasafa'),'Physical area balancing ignored a receiving teammate';
  assert not exists(select 1 from public.sales_workflows flow join fixture.area_quotes_before before using(project_id) where to_jsonb(flow)<>before.value);
  assert not exists(select 1 from public.openings opening join fixture.area_openings_before before using(id) where to_jsonb(opening)<>before.value);
  assert not exists(select 1 from public.notifications where entity_id=md5('area-project-primary')::uuid and event_type='measurement_assigned' and read_at is null),
    'Rotation reactivated a delayed physical-area visit';
  assert exists(select 1 from public.activity_logs where action='outdoor_measurement_rotation'
    and entity_id=md5('area-project-primary')::uuid and metadata->>'branch'='Karkh' and metadata->>'measurement_branch'='Rasafa'),
    'Rotation audit lost original office or physical area';
  assert public.rotate_outdoor_measurement_tasks()=0,'Repeated physical rotation was not idempotent';
  assert public.employee_can_access_project_branch(md5('area-ehab')::uuid,'Karkh');
  assert public.employee_can_access_project_branch(md5('area-ehab')::uuid,'Rasafa');
end;
$physical_rotation$;
rollback;
