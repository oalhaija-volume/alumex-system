-- Run as the database owner against a disposable, fully migrated database.
-- Auth fixtures, workflow receipts, notifications and JWT changes all roll back.
begin;
do $test$
declare
  test_owner_id uuid := gen_random_uuid();
  test_colleague_id uuid := gen_random_uuid();
  test_rasafa_id uuid := gen_random_uuid();
  test_manager_id uuid := gen_random_uuid();
  test_outdoor_id uuid := gen_random_uuid();
  test_project_id uuid := gen_random_uuid();
  test_register_id uuid := gen_random_uuid();
  test_assignment_id uuid := gen_random_uuid();
  test_return_id uuid := gen_random_uuid();
  test_actor_id uuid;
  test_payload jsonb;
  test_saved jsonb;
  test_stamp timestamptz;
  test_first_due timestamptz := now() - interval '1 minute';
  test_second_due timestamptz := now() - interval '2 minutes';
  test_count_before bigint;
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,email) values
    (test_owner_id,test_owner_id::text||'@example.invalid'),
    (test_colleague_id,test_colleague_id::text||'@example.invalid'),
    (test_rasafa_id,test_rasafa_id::text||'@example.invalid'),
    (test_manager_id,test_manager_id::text||'@example.invalid'),
    (test_outdoor_id,test_outdoor_id::text||'@example.invalid');
  update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active'
    where id in (test_owner_id,test_colleague_id);
  update public.profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=test_rasafa_id;
  update public.profiles set role='Sales Manager',branch='Rasafa',is_active=true,status='Active' where id=test_manager_id;
  update public.profiles set role='Outdoor Sales',is_active=true,status='Active' where id=test_outdoor_id;

  test_payload := '{"client":{"clientName":"Notification regression","mobile":"00000000000","clientType":"individual"},"project":{"address":"Baghdad","branch":"Karkh","structureReadiness":"ready","buildingType":"villa_house"}}';
  test_saved := public.sync_field_change(test_register_id,test_outdoor_id,test_project_id,'register',test_payload,now(),null);
  assert (select follow_up_owner_id is null from public.projects where id=test_project_id);
  assert (select count(*)=3 from public.notifications n where n.entity_id=test_project_id
    and n.event_type='project_follow_up_assigned' and n.recipient_id in (test_owner_id,test_colleague_id,test_manager_id)),
    'Unclaimed intake must notify its branch team and Sales Manager';
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.recipient_id in (test_rasafa_id,test_outdoor_id)),
    'Intake must not notify the other Indoor branch or its Outdoor creator';
  assert not exists(select 1 from public.notifications n join public.profiles u on u.id=n.recipient_id
    where n.entity_id=test_project_id and u.role::text='Indoor Sales' and u.branch is distinct from 'Karkh');
  select count(*) into test_count_before from public.notifications n where n.entity_id=test_project_id;
  assert public.sync_field_change(test_register_id,test_outdoor_id,test_project_id,'register',test_payload,now(),null)=test_saved;
  assert (select count(*)=test_count_before from public.notifications n where n.entity_id=test_project_id),
    'A retried registration must not duplicate recipient notifications';

  select updated_at into test_stamp from public.projects where id=test_project_id;
  test_payload := jsonb_build_object('assignedOutdoorSalesId',test_outdoor_id);
  test_saved := public.sync_field_change(test_assignment_id,test_owner_id,test_project_id,'assign-measurements',test_payload,now(),test_stamp);
  assert (select follow_up_owner_id=test_owner_id from public.projects where id=test_project_id);
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='measurement_assigned'
    and n.recipient_id=test_outdoor_id and n.read_at is null and n.title_key='notifications.measurementAssigned'
    and n.link_path='/initial-measurements/'||test_project_id::text),
    'An assignment must create one actionable Outdoor notification for its chime';
  assert public.sync_field_change(test_assignment_id,test_owner_id,test_project_id,'assign-measurements',test_payload,now(),test_stamp)=test_saved;
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='measurement_assigned');

  select updated_at into test_stamp from public.projects where id=test_project_id;
  perform public.sync_field_change(gen_random_uuid(),test_colleague_id,test_project_id,'follow-up',
    jsonb_build_object('note','Confirm the visit','nextFollowUp',test_first_due,'followUpType','call','followUpOwnerId',test_owner_id),now(),test_stamp);
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_assigned'
    and n.recipient_id=test_owner_id and n.read_at is null), 'Claimed work must notify its selected owner';
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_assigned'
    and n.recipient_id<>test_owner_id), 'Claimed work must stop broadcasting to the branch team';

  -- Call through the real authenticated database role; the RPC accepts no actor override.
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=1;
  assert public.deliver_due_follow_up_notifications()=0, 'Repeated polling must not duplicate a due reminder';
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due'
    and n.recipient_id=test_owner_id and n.read_at is null and n.link_path='/mini-crm#project-'||test_project_id::text);
  reset role;
  foreach test_actor_id in array array[test_colleague_id,test_rasafa_id,test_outdoor_id] loop
    perform set_config('request.jwt.claim.sub',test_actor_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',test_actor_id,'role','authenticated')::text,true);
    set local role authenticated;
    assert public.deliver_due_follow_up_notifications()=0, 'A caller cannot deliver another employee due reminder';
    assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due'),
      'Notification RLS must hide the owner reminder from other employees';
    reset role;
  end loop;
  assert not has_function_privilege('anon','public.deliver_due_follow_up_notifications()','execute');
  assert not has_function_privilege('authenticated','public.sales_notification_recipients(uuid)','execute');

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select updated_at into test_stamp from public.projects where id=test_project_id;
  test_payload := '{"reason":"client_no_answer","note":"Site closed; the client did not answer"}';
  test_saved := public.sync_field_change(test_return_id,test_outdoor_id,test_project_id,'delay-measurements',test_payload,now(),test_stamp);
  assert (select measurement_delayed and next_follow_up_at is null from public.projects where id=test_project_id);
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='measurement_visit_returned'
    and n.recipient_id=test_owner_id and n.read_at is null and n.payload->>'visit_outcome'='client_no_answer'
    and n.link_path='/mini-crm#project-'||test_project_id::text), 'Failed visits must notify the CRM owner with their outcome';
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.event_type='measurement_visit_returned'
    and n.recipient_id<>test_owner_id);
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.read_at is null
    and n.event_type in ('measurement_assigned','follow_up_assigned','follow_up_due')),
    'Returned work must retire its old task and follow-up alerts';
  assert public.sync_field_change(test_return_id,test_outdoor_id,test_project_id,'delay-measurements',test_payload,now(),test_stamp)=test_saved;
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='measurement_visit_returned');

  select updated_at into test_stamp from public.projects where id=test_project_id;
  perform public.sync_field_change(gen_random_uuid(),test_owner_id,test_project_id,'follow-up',
    jsonb_build_object('note','Arrange a replacement visit','nextFollowUp',test_second_due,'followUpType','call','followUpOwnerId',test_owner_id),now(),test_stamp);
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=1, 'A rescheduled follow-up has a new due event';
  assert public.deliver_due_follow_up_notifications()=0;
  reset role;
  assert (select count(*)=2 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due');
  assert (select count(*)=1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due' and n.read_at is null);

  -- A branch transfer must neither deliver nor retain an actionable reminder
  -- for a project that the Indoor employee can no longer access.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.profiles set branch='Rasafa' where id=test_owner_id;
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=0;
  reset role;
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due' and n.read_at is null);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.profiles set branch='Karkh' where id=test_owner_id;
  update public.projects set next_follow_up_at=now()-interval '3 minutes' where id=test_project_id;
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=1;
  reset role;

  -- Rescheduling outside field receipts is also reconciled on the next poll.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.projects set next_follow_up_at=now()+interval '1 day' where id=test_project_id;
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=0;
  reset role;
  assert not exists(select 1 from public.notifications n where n.entity_id=test_project_id and n.event_type='follow_up_due' and n.read_at is null);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.projects set next_follow_up_at=now()-interval '4 minutes',sales_status='cancelled' where id=test_project_id;
  perform set_config('request.jwt.claim.sub',test_owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  assert public.deliver_due_follow_up_notifications()=0, 'Cancelled projects cannot create follow-up reminders';
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  assert public.deliver_due_follow_up_notifications()=0, 'No authenticated identity means no reminder writes';
  raise notice 'PASS: branch and owner routing, assignment and failed-visit events, retries, due ownership/RLS, rescheduling and stale reminder cleanup';
end;
$test$;
rollback;
