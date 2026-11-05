-- Disposable database only. All measurement, employee and receipt fixtures roll back.
begin;
do $$
declare
  indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); teammate uuid:=gen_random_uuid();
  unrelated uuid:=gen_random_uuid(); other_branch uuid:=gen_random_uuid();
  client uuid; site uuid:=gen_random_uuid(); opening_id uuid;
  custom_id uuid:=gen_random_uuid(); teammate_id uuid:=gen_random_uuid(); operation uuid; employee uuid;
  room_name text; previous jsonb; changed jsonb; current_opening jsonb; invalid jsonb;
  stored_before jsonb; result jsonb; receipts_before bigint;
begin
  insert into auth.users(id,email) values
    (indoor,indoor||'@example.invalid'),(outdoor,outdoor||'@example.invalid'),
    (teammate,teammate||'@example.invalid'),(unrelated,unrelated||'@example.invalid'),
    (other_branch,other_branch||'@example.invalid');
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  update profiles set role='Outdoor Sales',outdoor_team_key='ahmad_mohammad',is_active=true,status='Active' where id in(outdoor,teammate);
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=unrelated;
  update profiles set role='Indoor Sales',branch='Rasafa',is_active=true,status='Active' where id=other_branch;
  insert into clients(client_name,mobile,created_by)
    values('Room location fixture','00000000000',indoor) returning id into client;
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,
    branch,building_type,structure_readiness,sales_status,status)
  values(site,client,'Room locations','ROOM-'||site,indoor,outdoor,'Karkh','residential_building','ready','new_lead','Draft');

  -- Each old and new canonical preset survives creation, the edit baseline and
  -- the edited payload. Names stay canonical in storage across language changes.
  foreach room_name in array array[
    'Living room','Bedroom','Kitchen','Bathroom','Dining room','Office','Hallway','Staircase','Balcony','Storage room',
    'Hall','Lightwell','Laundry room','Rooftop','Cold kitchen','Hot kitchen','Facade hall','Facade room','Lightwell kitchen','Lightwell room','Hawli'
  ] loop
    opening_id:=gen_random_uuid();
    previous:=jsonb_build_object('id',opening_id,'floor','Ground','room',room_name,'width',120,'height',150,
      'quantity',2,'structuralType','Window','openingType','Sliding','hasArch',true,'hasRollerShutter',true);
    perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',previous,now(),null);
    assert (select room=room_name and created_by=outdoor from openings where id=opening_id),'Room preset creation failed: '||room_name;
    changed:=previous||'{"width":135,"room":"Kitchen"}'::jsonb;
    perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',previous),now(),null);
    previous:=changed;
    changed:=previous||jsonb_build_object('room',room_name,'width',140);
    operation:=gen_random_uuid();
    result:=sync_field_change(operation,outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',previous),now(),null);
    assert (select room=room_name and width=140 and height=150 and quantity=2 and floor='Ground'
      and opening_type='Window' and opening_direction='Sliding' and has_arch and has_roller_shutter and created_by=outdoor
      from openings where id=opening_id),'Editing a room changed unrelated measurements or authorship: '||room_name;
    assert sync_field_change(operation,outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',previous),now(),null)=result,
      'Room edit retry did not return the saved receipt';
  end loop;
  assert (select count(*)=21 from openings where project_id=site),'Room preset edits duplicated measurements';
  current_opening:=changed;
  select to_jsonb(o) into stored_before from openings o where id=opening_id;
  select count(*) into receipts_before from field_sync_receipts;

  -- Unknown names and malformed values are rejected at the edit transaction.
  for invalid in select value from jsonb_array_elements('[null,"","   ","Unknown room","hall","منور",42,true,{},[]]'::jsonb) loop
    begin
      perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object(
        'opening',current_opening||jsonb_build_object('room',invalid),'previous',current_opening),now(),null);
      raise exception using errcode='ZX001',message='Invalid room accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='Complete the opening details.'; end;
  end loop;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    '{"room":"Other"}'::jsonb,'{"room":"Other","otherRoom":""}'::jsonb,
    '{"room":"Other","otherRoom":"   "}'::jsonb,jsonb_build_object('room','Other','otherRoom',repeat('x',101))
  )) loop
    begin
      perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object(
        'opening',current_opening||invalid,'previous',current_opening),now(),null);
      raise exception using errcode='ZX001',message='Invalid custom room accepted';
    exception when sqlstate 'P0001' then assert sqlerrm='Complete the opening details.'; end;
  end loop;
  assert (select to_jsonb(o)=stored_before from openings o where id=opening_id),'Rejected room edits changed measurements';
  assert (select count(*) from field_sync_receipts)=receipts_before,'Rejected room edits left sync receipts';

  begin
    perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object(
      'opening',current_opening||'{"room":"Hall"}','previous',previous),now(),null);
    raise exception using errcode='ZX001',message='A stale room baseline overwrote the current measurement';
  exception when sqlstate 'P0001' then
    assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
  foreach employee in array array[teammate,unrelated,other_branch] loop
    begin
      perform sync_field_change(gen_random_uuid(),employee,site,'edit-opening',jsonb_build_object(
        'opening',current_opening||'{"room":"Hall"}','previous',current_opening),now(),null);
      raise exception using errcode='ZX001',message='An unauthorized employee edited the room';
    exception when insufficient_privilege then null;
      when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee'; end;
  end loop;

  -- Team assignment still shares the task; each teammate keeps their own entry.
  previous:=jsonb_build_object('id',teammate_id,'floor','First','room','Lightwell','width',100,'height',150,
    'quantity',1,'structuralType','Window','openingType','Sliding');
  perform sync_field_change(gen_random_uuid(),teammate,site,'opening',previous,now(),null);
  changed:=previous||'{"room":"Lightwell room"}'::jsonb;
  perform sync_field_change(gen_random_uuid(),teammate,site,'edit-opening',jsonb_build_object('opening',changed,'previous',previous),now(),null);
  assert (select room='Lightwell room' and created_by=teammate from openings where id=teammate_id);
  -- Existing Indoor Sales access can correct a room without claiming authorship.
  previous:=current_opening;
  current_opening:=current_opening||'{"room":"Laundry room"}'::jsonb;
  perform sync_field_change(gen_random_uuid(),indoor,site,'edit-opening',jsonb_build_object('opening',current_opening,'previous',previous),now(),null);
  assert (select room='Laundry room' and created_by=outdoor from openings where id=opening_id);

  -- Custom Other names keep their existing trim and length behavior.
  previous:=jsonb_build_object('id',custom_id,'floor','Ground','room','Other','otherRoom','Existing custom room',
    'width',100,'height',150,'quantity',1,'structuralType','Window','openingType','Sliding');
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',previous,now(),null);
  changed:=previous||'{"otherRoom":"  Preserved custom room  "}'::jsonb;
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',previous),now(),null);
  assert (select room='Preserved custom room' and created_by=outdoor from openings where id=custom_id);
  assert (select count(*)=23 from openings where project_id=site),'Room edits added or removed measurement rows';
  raise notice 'PASS: all old/new room presets, custom Other, validation, stale edits/retries, original authorship and team/branch actor guards';
end;
$$;
rollback;
