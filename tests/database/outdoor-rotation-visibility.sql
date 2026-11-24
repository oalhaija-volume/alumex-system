-- Disposable PostgreSQL fixture only. Never run these fixture clocks on live data.
begin;

do $real_calendar$
begin
  assert public.outdoor_sales_branch_for_date('Rasafa','2026-11-15 20:59:59.999+00')='Rasafa';
  assert public.outdoor_sales_branch_for_date('Rasafa','2026-11-15 21:00:00+00')='Karkh';
  assert public.outdoor_sales_branch_for_date('Karkh','2026-11-15 20:59:59.999+00')='Karkh';
  assert public.outdoor_sales_branch_for_date('Karkh','2026-11-15 21:00:00+00')='Rasafa';
  assert public.outdoor_sales_branch_for_date('Rasafa','2026-11-30 21:00:00+00')='Rasafa';
  assert public.outdoor_sales_branch_for_date('Karkh','2026-11-30 21:00:00+00')='Karkh';
end;
$real_calendar$;

create table fixture.visibility_clock(at_time timestamptz not null);
insert into fixture.visibility_clock values('2026-11-24T06:00:00Z');
create or replace function public.outdoor_sales_branch_for_date(start_branch text,at_time timestamptz)
returns text language sql stable strict set search_path=public as $$
  select fixture.real_outdoor_sales_branch_for_date(start_branch,(select at_time from fixture.visibility_clock));
$$;

do $fixtures$
declare label text; job public.app_role; office text; team text;
begin
  foreach label in array array['ehab','mohd','ali','najaf','inactive','indoorK','indoorR','indoorN','admin','director','owner','ceo'] loop
    job:=case when label like 'indoor%' then 'Indoor Sales' when label='admin' then 'Admin'
      when label='director' then 'Sales Director' when label='owner' then 'Company Owner'
      when label='ceo' then 'CEO' else 'Outdoor Sales' end;
    office:=case when label in ('ehab','indoorR') then 'Rasafa' when label in ('najaf','indoorN') then 'Najaf' else 'Karkh' end;
    team:=case when label in ('mohd','ali') then 'ahmad_mohammad' when label='ehab' then 'sajjad_ehab' end;
    insert into public.profiles(id,role,branch,outdoor_rotation_start_branch,outdoor_team_key,is_active,status)
      values(md5('visibility-'||label)::uuid,job,office,case when office in ('Karkh','Rasafa') then office end,
        team,label<>'inactive',case when label='inactive' then 'Inactive' else 'Active' end);
  end loop;
  foreach label in array array['Karkh','Rasafa','Governorates','Najaf','legacyNajaf','karkhNajaf'] loop
    insert into public.projects(id,branch,governorate,governorate_office,created_by,owner_id,assigned_outdoor_sales_id)
      values(md5('visibility-project-'||label)::uuid,
        case when label in ('legacyNajaf','karkhNajaf') then 'Governorates' else label end,
        case when label in ('legacyNajaf','karkhNajaf') then 'النجف' when label='Governorates' then 'البصرة' end,
        case when label='karkhNajaf' then 'Karkh' end,
        md5('visibility-ehab')::uuid,md5('visibility-ehab')::uuid,md5('visibility-ali')::uuid);
  end loop;
end;
$fixtures$;

create table fixture.visibility_projects_before as select to_jsonb(project) as value from public.projects project;
create table fixture.visibility_profiles_before as select to_jsonb(employee) as value from public.profiles employee;

do $both_seed_directions$
declare actor uuid; office text; seed text; instant timestamptz; current_area text; opposite_area text; source uuid; assigned uuid;
begin
  foreach office in array array['Karkh','Rasafa'] loop
    actor:=md5('visibility-ehab')::uuid;
    foreach seed in array array['Karkh','Rasafa',null::text] loop
      update public.profiles set branch=office,outdoor_rotation_start_branch=seed where id=actor;
      foreach instant in array array['2026-11-15T20:59:59.999Z'::timestamptz,'2026-11-15T21:00:00Z'::timestamptz,
        '2026-11-30T20:59:59.999Z'::timestamptz,'2026-11-30T21:00:00Z'::timestamptz] loop
        update fixture.visibility_clock set at_time=instant;
        current_area:=fixture.real_outdoor_sales_branch_for_date(coalesce(seed,'Karkh'),instant);
        opposite_area:=case when current_area='Karkh' then 'Rasafa' else 'Karkh' end;
        -- Static eligibility still permits retaining ownership/credit in either area.
        assert public.employee_can_access_project_branch(actor,'Karkh');
        assert public.employee_can_access_project_branch(actor,'Rasafa');
        foreach source in array array[actor,md5('visibility-mohd')::uuid,null::uuid] loop
          foreach assigned in array array[actor,md5('visibility-ali')::uuid,null::uuid] loop
            assert public.employee_can_access_project_row(actor,current_area,source,assigned,null),
              'The current area must remain visible regardless of creator or old assignee';
            assert not public.employee_can_access_project_row(actor,opposite_area,source,assigned,null),
              'Creator, ownership or assignment bypassed the current area';
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  update public.profiles set branch='Rasafa',outdoor_rotation_start_branch='Rasafa' where id=actor;
  update fixture.visibility_clock set at_time='2026-11-24T06:00:00Z';
end;
$both_seed_directions$;

do $governorates_and_najaf$
declare ehab uuid:=md5('visibility-ehab')::uuid; mohd uuid:=md5('visibility-mohd')::uuid;
  ali uuid:=md5('visibility-ali')::uuid; najaf uuid:=md5('visibility-najaf')::uuid; employee uuid; label text;
begin
  assert public.employee_can_access_project_row(mohd,'Governorates',null,null,'البصرة');
  assert public.employee_can_access_project_row(ehab,'Governorates',ehab,null,'البصرة');
  assert not public.employee_can_access_project_row(ehab,'Governorates',mohd,ali,'البصرة');
  update public.profiles set outdoor_team_key='ahmad_mohammad' where id=ehab;
  update public.profiles set branch='Rasafa' where id=ali;
  assert public.is_outdoor_assignment_member(ehab,ali);
  assert public.employee_can_access_project_row(ehab,'Governorates',mohd,ali,'البصرة'),'Existing province team access changed';
  assert not public.employee_can_access_project_row(ehab,'Rasafa',ehab,ali,null),'A real active teammate bypassed current-area visibility';
  update public.profiles set outdoor_team_key='sajjad_ehab' where id=ehab;
  update public.profiles set branch='Karkh' where id=ali;
  foreach employee in array array[ehab,mohd] loop
    assert not public.employee_can_access_project_row(employee,'Najaf',employee,employee,null);
    assert not public.employee_can_access_project_row(employee,'Governorates',employee,employee,'النجف');
    assert not public.employee_can_access_project_branch(employee,'Najaf');
  end loop;
  assert public.employee_can_access_project_row(najaf,'Najaf',null,null,null);
  assert public.employee_can_access_project_row(najaf,'Governorates',null,null,'النجف');
  assert not public.employee_can_access_project_row(najaf,'Karkh',najaf,najaf,null);
  assert not public.employee_can_access_project_row(najaf,'Rasafa',najaf,najaf,null);
  assert public.effective_project_branch('Governorates','النجف','Karkh')='Governorates';
  assert public.effective_project_branch('Governorates','النجف',null)='Najaf';
  foreach label in array array['admin','director','owner'] loop
    employee:=md5('visibility-'||label)::uuid;
    assert public.employee_can_access_project_row(employee,'Karkh',null,null,null);
    assert public.employee_can_access_project_row(employee,'Rasafa',null,null,null);
    assert public.employee_can_access_project_row(employee,'Najaf',null,null,null);
  end loop;
  assert not public.employee_can_access_project_row(md5('visibility-inactive')::uuid,'Karkh',null,null,null);
  assert public.employee_can_access_project_row(md5('visibility-indoorK')::uuid,'Karkh',null,null,null);
  assert not public.employee_can_access_project_row(md5('visibility-indoorK')::uuid,'Rasafa',null,null,null);
  assert public.employee_can_access_project_row(md5('visibility-indoorR')::uuid,'Rasafa',null,null,null);
  assert not public.employee_can_access_project_row(md5('visibility-indoorR')::uuid,'Karkh',null,null,null);
  assert not public.employee_can_access_project_row(md5('visibility-ceo')::uuid,'Rasafa',null,null,null),'CEO office boundary changed';
end;
$governorates_and_najaf$;

-- Existing notification entity policies automatically cover current-area rows
-- and exact unread counts; there is no new recipient rule or policy to install.
insert into public.notifications(recipient_id,entity_type,entity_id)
  select md5('visibility-ehab')::uuid,'project',id from public.projects;
insert into public.notifications(recipient_id,entity_type,entity_id)
  values(md5('visibility-ehab')::uuid,'profile',md5('visibility-ehab')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',md5('visibility-ehab')::uuid::text,true);
do $rls_and_rpc$
begin
  assert exists(select 1 from public.projects where branch='Karkh');
  assert not exists(select 1 from public.projects where branch='Rasafa'),'Project RLS leaked the opposite area';
  assert not exists(select 1 from public.projects where id=md5('visibility-project-legacyNajaf')::uuid);
  assert not exists(select 1 from public.notifications where entity_id=md5('visibility-project-Rasafa')::uuid),
    'A recipient-only notification exposed the opposite area';
  assert (select count(*)=4 from public.notifications where read_at is null),
    'Unread badge must include current-area + existing own provinces + nonproject notices only';
  assert public.can_access_indoor_project_branch(md5('visibility-project-Karkh')::uuid);
  assert not public.can_access_indoor_project_branch(md5('visibility-project-Rasafa')::uuid);
  begin
    perform public.acknowledge_hidden_field_receipt(gen_random_uuid(),auth.uid(),gen_random_uuid(),'opening','{}');
    raise exception 'Authenticated client executed receipt acknowledgement';
  exception when insufficient_privilege then null; end;
end;
$rls_and_rpc$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
do $mutation_guard$
begin
  perform public.require_indoor_project_branch(md5('visibility-project-Karkh')::uuid,md5('visibility-ehab')::uuid);
  begin
    perform public.require_indoor_project_branch(md5('visibility-project-Rasafa')::uuid,md5('visibility-ehab')::uuid);
    raise exception 'The service mutation guard bypassed rotation';
  exception when insufficient_privilege then null; end;
end;
$mutation_guard$;

do $exact_old_acknowledgement$
declare operation uuid:=md5('visibility-old-operation')::uuid; actor uuid:=md5('visibility-ehab')::uuid;
  site uuid:=md5('visibility-project-Rasafa')::uuid; request jsonb:='{"note":"Already committed"}'; before_hash text;
begin
  insert into public.field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(operation,actor,site,'finish',md5(request::text||'finish'||site::text),now(),
      jsonb_build_object('privateSnapshot','Never return this','id',site));
  select md5(to_jsonb(saved)::text) into before_hash from public.field_sync_receipts saved where operation_id=operation;
  assert public.acknowledge_hidden_field_receipt(operation,actor,site,'finish',request);
  assert public.acknowledge_hidden_field_receipt(operation,actor,site,'finish',request),'Exact retry acknowledgement lost idempotence';
  assert not public.acknowledge_hidden_field_receipt(gen_random_uuid(),actor,site,'finish',request),'A fresh operation was acknowledged';
  assert not public.acknowledge_hidden_field_receipt(operation,md5('visibility-mohd')::uuid,site,'finish',request);
  assert not public.acknowledge_hidden_field_receipt(operation,actor,md5('visibility-project-Karkh')::uuid,'finish',request);
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'opening',request);
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'finish','{"note":"Changed"}');
  update public.profiles set is_active=false where id=actor;
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'finish',request);
  update public.profiles set is_active=true,role='Indoor Sales' where id=actor;
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'finish',request);
  update public.profiles set role='Outdoor Sales',branch='Najaf' where id=actor;
  assert not public.acknowledge_hidden_field_receipt(operation,actor,site,'finish',request),'Ack crossed the Najaf employee boundary';
  update public.profiles set branch='Rasafa' where id=actor;
  update public.field_sync_receipts set project_id=md5('visibility-project-legacyNajaf')::uuid,
    payload_hash=md5(request::text||'finish'||md5('visibility-project-legacyNajaf')::uuid::text) where operation_id=operation;
  assert not public.acknowledge_hidden_field_receipt(operation,actor,md5('visibility-project-legacyNajaf')::uuid,'finish',request),
    'Ack crossed historical Najaf geography';
  update public.field_sync_receipts set project_id=site,payload_hash=md5(request::text||'finish'||site::text) where operation_id=operation;
  assert (select md5(to_jsonb(saved)::text)=before_hash from public.field_sync_receipts saved where operation_id=operation),
    'Acknowledgement changed a saved receipt';
  assert not exists(select 1 from public.projects project full join fixture.visibility_projects_before prior
    on prior.value->>'id'=project.id::text where prior.value is distinct from to_jsonb(project)),
    'Visibility or acknowledgement rewrote project ownership/assignments';
  assert not exists(select 1 from public.profiles employee full join fixture.visibility_profiles_before prior
    on prior.value->>'id'=employee.id::text where prior.value is distinct from to_jsonb(employee)),
    'Visibility or acknowledgement rewrote employee configuration';
end;
$exact_old_acknowledgement$;

rollback;
