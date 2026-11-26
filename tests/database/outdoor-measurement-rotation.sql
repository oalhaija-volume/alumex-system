-- Disposable PostgreSQL fixture only. The fixture calendar never reaches a live database.
begin;

create table fixture.rotation_clock(at_time timestamptz not null);
insert into fixture.rotation_clock values('2026-11-15T20:59:59.999Z');
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql stable strict set search_path=public as $$
  select case when start_branch not in ('Karkh','Rasafa') then null
    when extract(day from fixture_time at time zone 'Asia/Baghdad')<=15 then start_branch
    when start_branch='Karkh' then 'Rasafa' else 'Karkh' end
  from (select at_time as fixture_time from fixture.rotation_clock) clock;
$$;

do $employees$
declare label text; employee uuid; office text; seed text; job public.app_role; team text;
begin
  foreach label in array array['admin','indoor','ali','mohammad','sajjad','ehab','najaf','inactive'] loop
    employee:=md5('rotation-employee-'||label)::uuid;
    office:=case when label='admin' then null when label in ('sajjad','ehab','inactive') then 'Rasafa'
      when label='najaf' then 'Najaf' else 'Karkh' end;
    seed:=case when label in ('sajjad','ehab','inactive') then 'Rasafa' else 'Karkh' end;
    job:=case when label='admin' then 'Admin' when label='indoor' then 'Indoor Sales' else 'Outdoor Sales' end;
    team:=case when label in ('ali','mohammad') then 'ahmad_mohammad' when label in ('sajjad','ehab') then 'sajjad_ehab' end;
    insert into auth.users(id,email) values(employee,label||'.rotation@example.invalid');
    insert into public.profiles(id,email,username,full_name,role,branch,is_active,status,outdoor_rotation_start_branch,outdoor_team_key)
      values(employee,label||'.rotation@example.invalid','rotation.'||label,label,job,office,label<>'inactive',
        case when label='inactive' then 'Inactive' else 'Active' end,seed,team);
  end loop;
end;
$employees$;

do $projects$
declare label text; project_branch text; assignee uuid; creator uuid; client uuid:=md5('rotation-client')::uuid;
  status_value text; readiness text;
begin
  insert into public.clients(id,client_name,created_by) values(client,'Rotation test client',md5('rotation-employee-admin')::uuid);
  foreach label in array array['karkh','rasafa','delayed','additional','complete','not-ready','archived','governorates','najaf','self','unassigned'] loop
    project_branch:=case when label in ('rasafa','additional') then 'Rasafa' when label='governorates' then 'Governorates'
      when label='najaf' then 'Najaf' else 'Karkh' end;
    assignee:=case when label='unassigned' then null when label='self' then md5('rotation-employee-indoor')::uuid
      when label='najaf' then md5('rotation-employee-najaf')::uuid
      when project_branch='Rasafa' then md5('rotation-employee-sajjad')::uuid else md5('rotation-employee-ali')::uuid end;
    creator:=case when label='self' then assignee else md5('rotation-employee-admin')::uuid end;
    status_value:=case when label='complete' then 'ready_for_quotation' else 'new_lead' end;
    readiness:=case when label='not-ready' then 'not_ready' else 'ready' end;
    insert into public.projects(id,project_number,project_name,client_id,branch,governorate,address,created_by,owner_id,
      assigned_outdoor_sales_id,measurement_assignment_id,sales_status,structure_readiness,
      archived_at,archive_reason,measurement_delayed,measurement_delay_reason,measurement_delay_note,measurement_delayed_at,measurement_delayed_by,
      additional_openings_state,additional_openings_original_ids,next_follow_up_at,follow_up_owner_id,project_notes,updated_at)
      values(md5('rotation-project-'||label)::uuid,'ROTATION-'||label,'Rotation '||label,client,project_branch,
        case when project_branch='Governorates' then 'البصرة' end,'Fixture address',creator,creator,
        assignee,md5('rotation-assignment-'||label)::uuid,status_value,readiness,
        case when label='archived' then '2026-11-01T10:00:00Z'::timestamptz end,case when label='archived' then 'Fixture archive' end,
        label='delayed',case when label='delayed' then 'client_no_answer' end,case when label='delayed' then 'Retain the client visit note' end,
        case when label='delayed' then '2026-11-02T11:00:00Z'::timestamptz end,case when label='delayed' then assignee end,
        case when label='additional' then 'requested' end,
        case when label='additional' then array[md5('rotation-opening-partial')::uuid] else '{}'::uuid[] end,
        '2026-11-20T09:00:00Z',case when project_branch='Karkh' then md5('rotation-employee-indoor')::uuid end,'Retain project notes',
        '2026-11-01T09:00:00Z');
  end loop;
  insert into public.openings(id,project_id,created_by,floor,room,width,height,quantity,opening_type,opening_code)
    values(md5('rotation-opening-partial')::uuid,md5('rotation-project-karkh')::uuid,
      md5('rotation-employee-ali')::uuid,'Ground Floor','Living Room',120,150,1,'Window','W-01');
  insert into public.measurement_completion_reports(id,project_id,note,recorded_by,recorded_by_name,recorded_at)
    values(md5('rotation-completion')::uuid,md5('rotation-project-complete')::uuid,'Completed historically',
      md5('rotation-employee-ali')::uuid,'ali','2026-11-01T10:00:00Z');
  insert into public.field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(md5('rotation-old-receipt')::uuid,md5('rotation-employee-ali')::uuid,md5('rotation-project-karkh')::uuid,
      'opening',md5('{}'::jsonb::text||'opening'||md5('rotation-project-karkh')::uuid::text),'2026-11-01T09:00:00Z',
      jsonb_build_object('id',md5('rotation-project-karkh')::uuid,'assigned_outdoor_sales_id',md5('rotation-employee-ali')::uuid,
        'measurement_assignment_id',md5('rotation-assignment-karkh')::uuid));
  insert into public.notifications(recipient_id,notification_kind,event_type,entity_type,entity_id,title_key,message_key,deduplication_key)
    select md5('rotation-employee-ali')::uuid,'action_required','measurement_assigned','project',id,
      'notifications.measurementAssigned','notifications.collectInitialMeasurements','rotation-old:'||id::text
      from public.projects where project_number in ('ROTATION-karkh','ROTATION-delayed');
end;
$projects$;

create table fixture.before_projects as select id,to_jsonb(project) as value from public.projects project;
create table fixture.before_openings as select id,to_jsonb(opening) as value from public.openings opening;
create table fixture.before_reports as select id,to_jsonb(report) as value from public.measurement_completion_reports report;
create table fixture.before_receipts as select operation_id,to_jsonb(receipt) as value from public.field_sync_receipts receipt;

do $before_boundary$
begin
  assert public.outdoor_sales_branch_for_date('Karkh',now())='Karkh';
  assert public.rotate_outdoor_measurement_tasks()=0,'First-half valid assignments must stay assigned';
  assert not exists(select 1 from public.activity_logs where action='outdoor_measurement_rotation');
end;
$before_boundary$;

update fixture.rotation_clock set at_time='2026-11-15T21:00:00Z';

do $after_boundary$
declare moved integer; audit_count integer; notification_count integer; label text; assigned uuid; replay jsonb;
begin
  assert public.outdoor_sales_branch_for_date('Karkh',now())='Rasafa','Baghdad midnight must rotate at 21:00 UTC';
  moved:=public.rotate_outdoor_measurement_tasks();
  assert moved=4,format('Expected four pending projects to rotate, got %s',moved);
  foreach label in array array['karkh','rasafa','delayed','additional'] loop
    select assigned_outdoor_sales_id into assigned from public.projects where id=md5('rotation-project-'||label)::uuid;
    assert (select public.outdoor_sales_branch_for_date(outdoor_rotation_start_branch,now())=
      case when label in ('rasafa','additional') then 'Rasafa' else 'Karkh' end from public.profiles where id=assigned),
      'The new assignee must cover the physical project area';
    assert (select measurement_assignment_id is distinct from md5('rotation-assignment-'||label)::uuid
      from public.projects where id=md5('rotation-project-'||label)::uuid),'New assignment must invalidate the previous assignment version';
    assert (select (to_jsonb(project)-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at'])=
      (before.value-array['assigned_outdoor_sales_id','measurement_assignment_id','updated_at'])
      from public.projects project join fixture.before_projects before on before.id=project.id
      where project.id=md5('rotation-project-'||label)::uuid),'Rotation changed unrelated project information';
  end loop;
  assert not exists(select 1 from public.projects project join fixture.before_projects before on before.id=project.id
    where project.project_number not in ('ROTATION-karkh','ROTATION-rasafa','ROTATION-delayed','ROTATION-additional')
      and to_jsonb(project)<>before.value),'Excluded project changed';
  assert not exists(select 1 from public.openings opening join fixture.before_openings before on before.id=opening.id
    where to_jsonb(opening)<>before.value),'Partial measurements or recorder ownership changed';
  assert not exists(select 1 from public.measurement_completion_reports report join fixture.before_reports before on before.id=report.id
    where to_jsonb(report)<>before.value),'Historical completion reports changed';
  assert not exists(select 1 from public.field_sync_receipts receipt join fixture.before_receipts before on before.operation_id=receipt.operation_id
    where to_jsonb(receipt)<>before.value),'Existing offline receipts changed';
  replay:=public.sync_field_change(md5('rotation-old-receipt')::uuid,md5('rotation-employee-ali')::uuid,
    md5('rotation-project-karkh')::uuid,'opening','{}',now(),null);
  assert replay=(select result from public.field_sync_receipts where operation_id=md5('rotation-old-receipt')::uuid),
    'Previously accepted offline work stopped replaying after reassignment';
  assert (select assigned_outdoor_sales_id<>md5('rotation-employee-ali')::uuid from public.projects
    where id=md5('rotation-project-karkh')::uuid),'Receipt replay reverted the current assignment';
  begin
    perform public.sync_field_change(md5('rotation-stale-assignment')::uuid,md5('rotation-employee-indoor')::uuid,
      md5('rotation-project-karkh')::uuid,'assign-measurements',
      jsonb_build_object('assignedOutdoorSalesId',md5('rotation-employee-ali')::uuid),now(),'2026-11-01T09:00:00Z');
    raise exception 'An outdated assignment overwrote the rotation';
  exception when raise_exception then
    assert sqlerrm='This project changed on another device. Review the online project before retrying your saved notes.',
      'Stale writes must fail through the existing concurrency guard';
  end;
  assert (select measurement_delayed and measurement_delay_reason='client_no_answer' and
    measurement_delay_note='Retain the client visit note' and measurement_delayed_by=md5('rotation-employee-ali')::uuid
    from public.projects where id=md5('rotation-project-delayed')::uuid),'A postponed visit was silently resumed';
  assert not exists(select 1 from public.notifications where deduplication_key like 'rotation-old:%' and read_at is null),
    'Previous assignment notifications were left unread';
  foreach label in array array['karkh','rasafa','additional'] loop
    assert (select count(*)=2 from public.notifications where entity_id=md5('rotation-project-'||label)::uuid
      and event_type='measurement_assigned' and read_at is null),'Both receiving teammates must be notified';
    assert not exists(select 1 from public.notifications notification join public.profiles employee on employee.id=notification.recipient_id
      where notification.entity_id=md5('rotation-project-'||label)::uuid and notification.event_type='measurement_assigned'
        and notification.read_at is null and public.outdoor_sales_branch_for_date(employee.outdoor_rotation_start_branch,now())<>
          case when label='karkh' then 'Karkh' else 'Rasafa' end),'The former team received a new measurement alert';
  end loop;
  assert not exists(select 1 from public.notifications where entity_id=md5('rotation-project-delayed')::uuid
    and event_type='measurement_assigned' and read_at is null),'Delayed visits must not be activated by notification';
  assert (select count(*)=4 and bool_and(actor_id is null) from public.activity_logs where action='outdoor_measurement_rotation'),
    'System handoffs must be audited without impersonating a person';
  assert not exists(select 1 from public.activity_logs log join public.projects project on project.id=log.entity_id
    join fixture.before_projects before on before.id=project.id where log.action='outdoor_measurement_rotation' and (
      log.metadata->>'previous_assignee_id' is distinct from before.value->>'assigned_outdoor_sales_id'
      or log.metadata->>'previous_assignment_id' is distinct from before.value->>'measurement_assignment_id'
      or log.metadata->>'assigned_outdoor_sales_id' is distinct from project.assigned_outdoor_sales_id::text
      or log.metadata->>'measurement_assignment_id' is distinct from project.measurement_assignment_id::text)),
    'The audit must preserve both sides of the assignment handoff';
  select count(*) into audit_count from public.activity_logs;
  select count(*) into notification_count from public.notifications;
  assert public.rotate_outdoor_measurement_tasks()=0,'Repeated handoffs must be idempotent';
  assert (select count(*)=audit_count from public.activity_logs),'Retry created duplicate history';
  assert (select count(*)=notification_count from public.notifications),'Retry created duplicate alerts';
end;
$after_boundary$;

-- At month reset the same pending work returns; a completed job remains fixed.
update public.projects set sales_status='ready_for_quotation' where id=md5('rotation-project-karkh')::uuid;
create table fixture.completed_before_reset as select to_jsonb(project) as value from public.projects project
  where id=md5('rotation-project-karkh')::uuid;
update fixture.rotation_clock set at_time='2026-11-30T20:59:59.999Z';
do $$begin assert public.rotate_outdoor_measurement_tasks()=0; end$$;
update fixture.rotation_clock set at_time='2026-11-30T21:00:00Z';
do $month_reset$
declare moved integer;
begin
  assert public.outdoor_sales_branch_for_date('Karkh',now())='Karkh','Month reset must follow Baghdad local date';
  moved:=public.rotate_outdoor_measurement_tasks();
  assert moved=3,format('Month reset expected three remaining tasks, got %s',moved);
  assert (select to_jsonb(project)=(select value from fixture.completed_before_reset) from public.projects project
    where id=md5('rotation-project-karkh')::uuid),'Completed work rotated after month reset';
  assert not exists(select 1 from public.projects project join public.profiles employee on employee.id=project.assigned_outdoor_sales_id
    where project.project_number in ('ROTATION-rasafa','ROTATION-delayed','ROTATION-additional')
      and public.outdoor_sales_branch_for_date(employee.outdoor_rotation_start_branch,now())<>project.branch),
    'Month reset did not restore branch ownership';
end;
$month_reset$;

-- Missing active coverage retains the pending record; it never invents an assignee.
update fixture.rotation_clock set at_time='2026-12-15T21:00:00Z';
update public.profiles set is_active=false,status='Inactive' where id in
  (md5('rotation-employee-sajjad')::uuid,md5('rotation-employee-ehab')::uuid);
create table fixture.no_target_before as select to_jsonb(project) as value from public.projects project
  where id=md5('rotation-project-delayed')::uuid;
do $no_target$
begin
  perform public.rotate_outdoor_measurement_tasks();
  assert (select to_jsonb(project)=(select value from fixture.no_target_before) from public.projects project
    where id=md5('rotation-project-delayed')::uuid),'Missing branch coverage changed the pending assignment';
end;
$no_target$;

rollback;
