begin;
do $$
declare
  sajjad uuid := gen_random_uuid(); ehab uuid := gen_random_uuid();
  other_team uuid := gen_random_uuid(); indoor uuid := gen_random_uuid();
  client uuid; shared uuid := gen_random_uuid(); owned uuid := gen_random_uuid();
  first_opening uuid := gen_random_uuid(); second_opening uuid := gen_random_uuid(); legacy_opening uuid := gen_random_uuid();
  operation uuid := gen_random_uuid(); prior_operation uuid := gen_random_uuid();
  stamp timestamptz; initial jsonb; edited jsonb; second jsonb; result jsonb; replay jsonb;
  receipts_before bigint; employee uuid;
begin
  insert into auth.users(id,email) values
    (sajjad,sajjad::text||'@example.invalid'),(ehab,ehab::text||'@example.invalid'),
    (other_team,other_team::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
  update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in (sajjad,ehab,other_team);
  update profiles set outdoor_team_key='sajjad_ehab' where id in (sajjad,ehab);
  update profiles set outdoor_team_key='ahmad_mohammad' where id=other_team;
  update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
  insert into clients(client_name,mobile,client_type,created_by)
    values('Preserved ownership client','00000000000','individual',indoor) returning id into client;
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,structure_readiness,branch,governorate)
    values(shared,client,'Shared Indoor project','OWN-'||shared,indoor,ehab,'ready','Karkh',null),
      (owned,client,'Sajjad registered project','OWN-'||owned,sajjad,ehab,'ready','Governorates','البصرة');
  select updated_at into stamp from projects where id=shared;
  initial:=jsonb_build_object('id',first_opening,'floor','GF','room','Bedroom','width',120,'height',150,'quantity',1,'structuralType','Window','openingType','Sliding');
  second:=initial||jsonb_build_object('id',second_opening,'width',100,'created_by',sajjad);
  perform sync_field_change(gen_random_uuid(),sajjad,shared,'opening',initial||jsonb_build_object('created_by',ehab),now(),stamp);
  perform sync_field_change(gen_random_uuid(),ehab,shared,'opening',second,now(),stamp);
  assert (select created_by=sajjad from openings where id=first_opening),'New opening trusted a forged employee';
  assert (select created_by=ehab from openings where id=second_opening),'Teammates must create their own entries on the shared task';
  insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,created_by)
    values(legacy_opening,shared,'LEGACY','GF','Bedroom',120,150,1,'Window','Sliding',null);

  edited:=initial||'{"width":135}'::jsonb;
  result:=sync_field_change(operation,sajjad,shared,'edit-opening',jsonb_build_object('opening',edited,'previous',initial),now(),stamp);
  assert (select width=135 and created_by=sajjad from openings where id=first_opening),'The opening author could not edit their own entry';
  select count(*) into receipts_before from field_sync_receipts;
  begin
    perform sync_field_change(gen_random_uuid(),ehab,shared,'edit-opening',jsonb_build_object('opening',initial||jsonb_build_object('created_by',ehab),'previous',edited||jsonb_build_object('created_by',ehab)),now(),stamp);
    raise exception using errcode='ZX001',message='Named assignee edited their teammate''s entry';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,shared,'edit-opening',jsonb_build_object('opening',second||'{"width":175}'::jsonb,'previous',second),now(),stamp);
    raise exception using errcode='ZX001',message='Teammate edited the named assignee''s entry';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,shared,'edit-opening',jsonb_build_object('opening',initial||jsonb_build_object('id',legacy_opening),'previous',initial||jsonb_build_object('id',legacy_opening)),now(),stamp);
    raise exception using errcode='ZX001',message='Missing historical authorship was inferred from team membership';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;
  assert (select count(*) from field_sync_receipts)=receipts_before,'Denied ownership writes left receipts';
  assert (select width=135 from openings where id=first_opening),'Denied edit changed the saved opening';

  -- The project's author has no special right to another person's opening.
  perform sync_field_change(gen_random_uuid(),ehab,owned,'opening',second||jsonb_build_object('id',gen_random_uuid()),now(),stamp);
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,owned,'edit-opening',jsonb_build_object(
      'opening',(select second||jsonb_build_object('id',id,'width',175) from openings where project_id=owned),
      'previous',(select second||jsonb_build_object('id',id) from openings where project_id=owned)),now(),stamp);
    raise exception using errcode='ZX001',message='Project creator edited another employee''s opening';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;

  foreach employee in array array[sajjad,ehab] loop
    begin
      perform sync_field_change(gen_random_uuid(),employee,shared,'rename-project','{"projectName":"Forbidden team name"}',now(),stamp);
      raise exception using errcode='ZX001',message='Shared assignment granted project name ownership';
    exception when sqlstate '42501' then assert sqlerrm='Only the employee who registered this project can change its name.';
    end;
  end loop;
  select updated_at into stamp from projects where id=owned;
  perform sync_field_change(gen_random_uuid(),sajjad,owned,'rename-project','{"projectName":"Sajjad renamed own project"}',now(),stamp);
  begin
    perform sync_field_change(gen_random_uuid(),ehab,owned,'rename-project','{"projectName":"Forbidden assignee name"}',now(),stamp);
    raise exception using errcode='ZX001',message='Named assignee renamed someone else''s project';
  exception when sqlstate '42501' then assert sqlerrm='Only the employee who registered this project can change its name.';
  end;
  assert (select project_name='Sajjad renamed own project' and created_by=sajjad from projects where id=owned);
  assert (select client_name='Preserved ownership client' from clients where id=client);

  -- Shared task status changes remain possible, while measurement locks remain.
  perform sync_field_change(gen_random_uuid(),ehab,shared,'finish','{}',now(),stamp);
  perform sync_field_change(gen_random_uuid(),sajjad,shared,'reopen','{}',now(),stamp);
  assert (select sales_status='new_lead' and assigned_outdoor_sales_id=ehab from projects where id=shared);
  update projects set sales_status='quotation_in_progress' where id=shared;
  begin
    perform sync_field_change(gen_random_uuid(),sajjad,shared,'edit-opening',jsonb_build_object('opening',initial,'previous',edited),now(),stamp);
    raise exception using errcode='ZX001',message='Ownership bypassed a saved quotation lock';
  exception when sqlstate 'P0001' then assert sqlerrm='Reopen measurements before editing an opening.';
  end;
  update projects set sales_status='new_lead' where id=shared;

  -- Office staff keep their existing corrections; original author stays stable.
  perform sync_field_change(gen_random_uuid(),indoor,shared,'edit-opening',jsonb_build_object('opening',initial||'{"width":145}'::jsonb,'previous',edited),now(),stamp);
  assert (select width=145 and created_by=sajjad from openings where id=first_opening);
  replay:=sync_field_change(operation,sajjad,shared,'edit-opening',jsonb_build_object('opening',edited,'previous',initial),now(),'2000-01-01');
  assert replay=result,'Committed own edit was not replayed before new checks';
  assert (select width=145 from openings where id=first_opening),'Receipt replay repeated an edit';

  -- An edit committed before the ownership correction may also clear its queue.
  insert into field_sync_receipts(operation_id,actor_id,project_id,action,payload_hash,recorded_at,result)
    values(prior_operation,ehab,shared,'edit-opening',md5(jsonb_build_object('opening',initial,'previous',edited)::text||'edit-opening'||shared::text),now(),'{"committedBeforeOwnership":true}');
  replay:=sync_field_change(prior_operation,ehab,shared,'edit-opening',jsonb_build_object('opening',initial,'previous',edited),now(),stamp);
  assert replay='{"committedBeforeOwnership":true}'::jsonb,'A committed pre-correction operation could not clear its queue';

  perform set_config('alumex.test.owner',sajjad::text,true);
  perform set_config('alumex.test.teammate',ehab::text,true);
  perform set_config('alumex.test.indoor',indoor::text,true);
  perform set_config('alumex.test.project',shared::text,true);
  perform set_config('alumex.test.owned_project',owned::text,true);
  perform set_config('alumex.test.own_opening',first_opening::text,true);
  perform set_config('alumex.test.other_opening',second_opening::text,true);
end;
$$;

-- Model existing permissive project-related writes. The new restrictive
-- ownership policies must narrow every such policy without widening team edits.
create policy fixture_ownership_opening_write on public.openings for all to authenticated
  using (public.current_user_role()='Indoor Sales' or public.can_view_outdoor_team_project(project_id))
  with check (public.current_user_role()='Indoor Sales' or public.can_view_outdoor_team_project(project_id));
create policy fixture_ownership_project_write on public.projects for update to authenticated
  using (public.current_user_role()='Indoor Sales' or public.can_view_outdoor_team_project(id))
  with check (public.current_user_role()='Indoor Sales' or public.can_view_outdoor_team_project(id));
grant select,insert,update,delete on public.openings to authenticated;
create function public.fixture_legacy_opening_write(entry uuid, employee uuid, new_width numeric)
returns void language sql security definer set search_path=public as $$
  update public.openings set created_by=employee,width=new_width where id=entry;
$$;
grant execute on function public.fixture_legacy_opening_write(uuid,uuid,numeric) to authenticated;
select set_config('request.jwt.claim.sub',current_setting('alumex.test.owner'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare changed bigint;
begin
  assert (select count(*)=3 from openings where project_id=current_setting('alumex.test.project')::uuid),'Shared read access was narrowed';
  update openings set width=155 where id=current_setting('alumex.test.own_opening')::uuid;
  get diagnostics changed=row_count;
  assert changed=1,'Author cannot update their own entry through existing RLS writes';
  update openings set width=999 where id=current_setting('alumex.test.other_opening')::uuid;
  get diagnostics changed=row_count;
  assert changed=0,'An existing permissive RLS policy bypassed entry ownership';
  delete from openings where id=current_setting('alumex.test.other_opening')::uuid;
  get diagnostics changed=row_count;
  assert changed=0,'An employee could delete another employee''s entry';
  begin
    perform public.fixture_legacy_opening_write(current_setting('alumex.test.other_opening')::uuid,auth.uid(),999);
    raise exception using errcode='ZX001',message='A security-definer RPC bypassed entry ownership';
  exception when sqlstate '42501' then assert sqlerrm='You can edit only openings you recorded.';
  end;
  begin
    update openings set created_by=current_setting('alumex.test.teammate')::uuid where id=current_setting('alumex.test.own_opening')::uuid;
    raise exception using errcode='ZX001',message='An employee transferred opening attribution';
  exception when sqlstate '42501' then assert sqlerrm='Opening entries must retain their original employee.';
  end;
  begin
    insert into openings(project_id,created_by,floor,room,width,height,quantity,opening_type,opening_direction)
      values(current_setting('alumex.test.project')::uuid,current_setting('alumex.test.teammate')::uuid,'GF','Bedroom',10,10,1,'Window','Sliding');
    raise exception using errcode='ZX001',message='A browser insert spoofed another employee';
  exception when sqlstate '42501' then assert sqlerrm='Opening entries must retain their original employee.';
  end;
  begin
    update projects set project_name='Forbidden browser rename' where id=current_setting('alumex.test.project')::uuid;
    raise exception using errcode='ZX001',message='A direct browser update renamed another employee''s project';
  exception when sqlstate '42501' then assert sqlerrm='Only the employee who registered this project can change its name.';
  end;
  begin
    update projects set created_by=auth.uid() where id=current_setting('alumex.test.project')::uuid;
    raise exception using errcode='ZX001',message='An employee claimed another project''s attribution';
  exception when sqlstate 'P0001' then assert sqlerrm='Original project attribution cannot be changed.';
  end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('alumex.test.indoor'),true);
set local role authenticated;
do $$
begin
  perform public.fixture_legacy_opening_write(current_setting('alumex.test.other_opening')::uuid,current_setting('alumex.test.teammate')::uuid,175);
  assert (select width=175 from openings where id=current_setting('alumex.test.other_opening')::uuid),'Office correction authority changed';
  raise notice 'PASS: Outdoor own-entry edits, shared measurement tasks, immutable attribution, office access, locks and committed replay';
end;
$$;
reset role;
rollback;
