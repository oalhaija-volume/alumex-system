begin;
do $$
declare
  ali uuid := gen_random_uuid(); mohammad uuid := gen_random_uuid();
  sajjad uuid := gen_random_uuid(); ehab uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); indoor uuid := gen_random_uuid();
  client uuid; site uuid := gen_random_uuid(); unrelated uuid := gen_random_uuid();
  opening_id uuid := gen_random_uuid(); assignment uuid := gen_random_uuid();
  stamp timestamptz; saved jsonb; previous jsonb; edit jsonb; member uuid;
  receipt_count bigint; team_size bigint;
begin
  insert into auth.users(id,email) values
    (ali,ali::text||'@example.invalid'),(mohammad,mohammad::text||'@example.invalid'),
    (sajjad,sajjad::text||'@example.invalid'),(ehab,ehab::text||'@example.invalid'),
    (outsider,outsider::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
  update profiles set role='Outdoor Sales',is_active=true,status='Active'
    where id in (ali,mohammad,sajjad,ehab,outsider);
  update profiles set outdoor_team_key='ahmad_mohammad' where id in (ali,mohammad);
  update profiles set outdoor_team_key='sajjad_ehab' where id in (sajjad,ehab);
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;

  select count(*) into team_size from outdoor_sales_team_member_ids(ehab);
  assert (select count(*)=2 from outdoor_sales_team_member_ids(ehab) member_id where member_id in (ehab,sajjad));
  assert is_outdoor_assignment_member(ehab,sajjad) and is_outdoor_assignment_member(sajjad,ehab);
  assert is_outdoor_assignment_member(ali,mohammad) and is_outdoor_assignment_member(mohammad,ali);
  assert not is_outdoor_assignment_member(ehab,ali) and not is_outdoor_assignment_member(ali,sajjad);
  assert is_outdoor_assignment_member(outsider,outsider);
  assert not is_outdoor_assignment_member(outsider,ehab);
  assert not is_outdoor_assignment_member(indoor,indoor);
  assert not is_outdoor_assignment_member(ehab,null);

  insert into clients(client_name,mobile,client_type,created_by)
    values('Preserved team client','00000000000','individual',indoor) returning id into client;
  insert into projects(id,client_id,project_name,project_number,created_by,structure_readiness,branch)
    values(site,client,'Shared site','TEAM-'||site,indoor,'ready','Karkh'),
      (unrelated,client,'Other team site','TEAM-'||unrelated,indoor,'ready','Karkh');
  update projects set assigned_outdoor_sales_id=ali where id=unrelated;
  select updated_at into stamp from projects where id=site;
  saved:=sync_field_change(assignment,indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',ehab),now(),stamp);
  assert saved->>'assigned_outdoor_sales_id'=ehab::text,'Shared task must retain the named assignee';
  assert (select count(*)=team_size from notifications where entity_id=site and event_type='measurement_assigned');
  assert (select count(*)=2 from notifications where entity_id=site and event_type='measurement_assigned' and recipient_id in (ehab,sajjad));
  perform sync_field_change(assignment,indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',ehab),now(),stamp);
  assert (select count(*)=team_size from notifications where entity_id=site and event_type='measurement_assigned'),'Assignment retry duplicated teammate alerts';

  previous:=jsonb_build_object('id',opening_id,'floor','Ground floor','room','Bedroom','width',1200,'height',1500,'quantity',1,'structuralType','Window','openingType','Sliding');
  select updated_at into stamp from projects where id=site;
  perform sync_field_change(gen_random_uuid(),sajjad,site,'opening',previous,now(),stamp);
  assert (select created_by=sajjad from openings where id=opening_id),'Capture must preserve the actual teammate author';
  edit:=previous||'{"width":1400,"quantity":2}'::jsonb;
  begin
    perform sync_field_change(gen_random_uuid(),ehab,site,'edit-opening',jsonb_build_object('opening',edit,'previous',previous),now(),stamp);
    raise exception using errcode='ZX001',message='Teammate edited another employee''s opening';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;
  perform sync_field_change(gen_random_uuid(),sajjad,site,'edit-opening',jsonb_build_object('opening',edit,'previous',previous),now(),stamp);
  assert (select width=1400 and quantity=2 from openings where id=opening_id),'Opening author must be able to edit their entry';
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,site,'edit-opening',jsonb_build_object('opening',previous,'previous',previous),now(),stamp);
    raise exception using errcode='ZX001',message='Stale teammate opening overwritten';
  exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.';
  end;
  perform sync_field_change(gen_random_uuid(),sajjad,site,'finish','{"note":"Shared visit completed"}',now(),stamp);
  assert (select sales_status='ready_for_quotation' and assigned_outdoor_sales_id=ehab from projects where id=site);
  assert (select recorded_by=sajjad from measurement_completion_reports where project_id=site);
  select updated_at into stamp from projects where id=site;
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,site,'rename-project','{"projectName":"Team renamed site"}',now(),stamp);
    raise exception using errcode='ZX001',message='Teammate renamed another employee''s project';
  exception when sqlstate '42501' then assert sqlerrm='Only the employee who registered this project can change its name.';
  end;
  assert (select project_name='Shared site' and assigned_outdoor_sales_id=ehab from projects where id=site);
  assert (select client_name='Preserved team client' from clients where id=client);
  perform sync_field_change(gen_random_uuid(),sajjad,site,'reopen','{}',now(),stamp);
  assert (select sales_status='new_lead' from projects where id=site),'Teammate must be able to reopen submitted measurements before quoting';

  select count(*) into receipt_count from field_sync_receipts;
  foreach member in array array[ali,mohammad,outsider] loop
    begin
      perform sync_field_change(gen_random_uuid(),member,site,'reopen','{}',now(),stamp);
      raise exception using errcode='ZX001',message='An employee outside the assigned team accessed the project';
    exception when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee';
    end;
  end loop;
  assert (select count(*) from field_sync_receipts)=receipt_count,'Denied team writes must not leave receipts';
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,site,'cancel-project','{"note":"Forbidden team cancellation","confirmed":true}',now(),stamp);
    raise exception using errcode='ZX001',message='Teammate gained client cancellation authority';
  exception when sqlstate '42501' then assert sqlerrm='This project cannot be cancelled by this employee at its current stage.';
  end;
  perform sync_field_change(gen_random_uuid(),sajjad,site,'delay-measurements','{"reason":"client_no_answer","note":"Client did not answer either teammate"}',now(),stamp);
  assert (select measurement_delayed and measurement_delayed_by=sajjad from projects where id=site),'A teammate must be able to report a visit outcome';
  select updated_at into stamp from projects where id=site;
  perform sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',ehab),now(),stamp);
  assert (select not measurement_delayed from projects where id=site);

  -- Teammates do not bypass saved quotation locks or original-opening snapshots.
  update projects set sales_status='quotation_in_progress' where id=site;
  insert into sales_workflows(project_id,stage,quotation) values(site,'quotation','{"unchanged":true}');
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,site,'reopen','{}',now(),stamp);
    raise exception using errcode='ZX001',message='Team edit bypassed the saved quotation lock';
  exception when sqlstate 'P0001' then assert sqlerrm='Measurements are locked or the site is not ready';
  end;
  select updated_at into stamp from projects where id=site;
  perform sync_field_change(gen_random_uuid(),indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',ehab),now(),stamp);
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,site,'edit-opening',jsonb_build_object('opening',previous,'previous',edit),now(),stamp);
    raise exception using errcode='ZX001',message='Teammate overwrote original commercial measurements';
  exception when sqlstate 'P0001' then assert sqlerrm='Existing measurements are preserved. Add the new openings separately.';
  end;
  previous:=previous||jsonb_build_object('id',gen_random_uuid());
  perform sync_field_change(gen_random_uuid(),sajjad,site,'opening',previous,now(),stamp);
  perform sync_field_change(gen_random_uuid(),sajjad,site,'finish','{}',now(),stamp);
  assert (select additional_openings_state='submitted' from projects where id=site);
  assert (select quotation='{"unchanged":true}'::jsonb from sales_workflows where sales_workflows.project_id=site);

  update profiles set is_active=false where id=sajjad;
  assert not is_outdoor_assignment_member(sajjad,ehab),'Inactive teammate retained shared access';
  update profiles set is_active=true,outdoor_team_key=null where id=sajjad;
  assert not is_outdoor_assignment_member(sajjad,ehab),'Removed teammate retained shared access';
  update profiles set outdoor_team_key='sajjad_ehab' where id=sajjad;
  perform set_config('alumex.test.sajjad',sajjad::text,true);
  perform set_config('alumex.test.ehab',ehab::text,true);
  perform set_config('alumex.test.project',site::text,true);
  perform set_config('alumex.test.unrelated',unrelated::text,true);
  perform set_config('request.jwt.claim.sub',sajjad::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

set local role authenticated;
do $$
declare count_changed bigint;
begin
  assert (select count(*)=1 from projects where id=current_setting('alumex.test.project')::uuid),'Assigned teammate project missing from RLS reads';
  assert (select count(*)=0 from projects where id=current_setting('alumex.test.unrelated')::uuid),'Other team leaked through project RLS';
  assert (select count(*)=2 from openings where project_id=current_setting('alumex.test.project')::uuid),'Team openings unavailable through RLS';
  assert (select count(*)=1 from measurement_completion_reports where project_id=current_setting('alumex.test.project')::uuid),'Team completion report unavailable through RLS';
  update projects set project_name='Direct bypass' where id=current_setting('alumex.test.project')::uuid;
  get diagnostics count_changed=row_count;
  assert count_changed=0,'A SELECT team policy granted direct project writes';
  begin
    update profiles set outdoor_team_key='ahmad_mohammad' where id=auth.uid();
    raise exception using errcode='ZX001',message='Employee changed their own trusted team';
  exception when sqlstate '42501' then assert sqlerrm='Outdoor Sales team membership must be configured by the server.';
  end;
  assert not has_function_privilege('authenticated','public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)','execute');
  assert not has_function_privilege('anon','public.is_outdoor_assignment_member(uuid,uuid)','execute');
  raise notice 'PASS: Outdoor team assignments, reciprocal writes, isolation, notifications, locks and profile protection';
end;
$$;
reset role;
rollback;
