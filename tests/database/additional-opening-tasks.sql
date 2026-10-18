begin;
do $$
declare indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_employee uuid:=gen_random_uuid(); site uuid; original uuid; added uuid; op uuid;
 payload jsonb; quote jsonb; previous_quote jsonb; result jsonb; stamp timestamptz; flow sales_workflows; quoted boolean; starting_stage text;
begin
 insert into auth.users(id,email) values(indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(other_employee,other_employee::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,other_employee);
 foreach starting_stage in array array['ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'] loop
  quoted=starting_stage<>'ready_for_quotation';
  site=gen_random_uuid(); original=gen_random_uuid(); added=gen_random_uuid(); op=gen_random_uuid();
  perform sync_field_change(gen_random_uuid(),other_employee,site,'register','{"client":{"clientName":"Additional opening test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
  payload=jsonb_build_object('id',original,'floor','GF','room','Kitchen','width',120,'height',150,'quantity',2,'structuralType','Window','openingType','Sliding');
  perform sync_field_change(gen_random_uuid(),other_employee,site,'opening',payload,now(),null);
  perform sync_field_change(gen_random_uuid(),other_employee,site,'finish','{}',now(),null);
  select jsonb_build_object('lines',jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction))),'total',100000) into quote from openings where project_id=site;
  if quoted then flow=advance_sales_flow(site,'save',0,quote,indoor); previous_quote=flow.quotation; end if;
  if starting_stage in ('quotation_approved','contract_generated') then flow=advance_sales_flow(site,'approve',flow.revision,'{}',indoor); end if;
  if starting_stage='contract_generated' then flow=advance_sales_flow(site,'contract',flow.revision,'{"number":"OLD-CONTRACT"}',indoor); end if;
  select updated_at into stamp from projects where id=site;
  begin
   perform sync_field_change(op,outdoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
   raise exception using errcode='ZX001',message='Outdoor employee assigned own task';
  exception when sqlstate 'P0001' then assert sqlerrm='CRM access is limited to Indoor Sales and company leadership.'; end;
  begin
   perform sync_field_change(gen_random_uuid(),indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',indoor),now(),stamp);
   raise exception using errcode='ZX001',message='Indoor assigned as return-visit employee';
  exception when sqlstate 'P0001' then assert sqlerrm='Choose an active Outdoor Sales employee.'; end;
  begin
   perform sync_field_change(gen_random_uuid(),indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp-interval '1 second');
   raise exception using errcode='ZX001',message='Stale request accepted';
  exception when sqlstate 'P0001' then assert sqlerrm='This project changed on another device. Review the online project before retrying your saved notes.'; end;
  result=sync_field_change(op,indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
  assert sync_field_change(op,indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp)=result;
  assert result->>'additional_openings_state'='requested';
  assert (select sales_status='new_lead' and assigned_outdoor_sales_id=outdoor and additional_openings_original_ids=array[original] from projects where id=site);
  if quoted then
   assert (select quotation=previous_quote from sales_workflows where project_id=site),'Quotation overwritten by request';
   select * into flow from sales_workflows where project_id=site;
   begin
    perform advance_sales_flow(site,'approve',flow.revision,'{}',indoor);
    raise exception using errcode='ZX001',message='Stale quotation approved';
   exception when sqlstate 'P0001' then assert sqlerrm='Complete the additional measurements and save a quotation revision before continuing.'; end;
  end if;
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
   raise exception using errcode='ZX001',message='Empty return visit submitted';
  exception when sqlstate 'P0001' then assert sqlerrm='Add at least one new opening before submitting this task.'; end;
  begin
   perform sync_field_change(gen_random_uuid(),other_employee,site,'opening',payload||jsonb_build_object('id',added),now(),null);
   raise exception using errcode='ZX001',message='Unassigned creator modified return visit';
  exception when sqlstate 'P0001' then assert sqlerrm='Only the assigned employee can complete this task.'; end;
  begin
   update openings set width=999 where id=original;
   raise exception using errcode='ZX001',message='Original measurements modified';
  exception when sqlstate 'P0001' then assert sqlerrm='Existing measurements are preserved. Add the new openings separately.'; end;
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',added,'width',200),now(),null);
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload||jsonb_build_object('id',added,'width',200),'opening',payload||jsonb_build_object('id',added,'width',210)),now(),null);
  result=sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
  assert result->>'additional_openings_state'='submitted';
  assert (select count(*)=2 from openings where project_id=site);
  assert (select width=120 and quantity=2 and created_by=other_employee from openings where id=original);
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'reopen','{}',now(),null);
   raise exception using errcode='ZX001',message='Outdoor reopened submitted task';
  exception when sqlstate 'P0001' then assert sqlerrm='Ask Indoor Sales to assign another additional-openings task.'; end;
  select jsonb_build_object('lines',jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction))),'total',200000) into quote from openings where project_id=site;
  select * into flow from sales_workflows where project_id=site;
  flow=advance_sales_flow(site,'save',coalesce(flow.revision,0),quote,indoor);
  assert (select additional_openings_state is null from projects where id=site);
  assert jsonb_array_length(flow.quotation->'lines')=2;
  if quoted then assert (select quotation=previous_quote from quotation_revisions where project_id=site and version=1); end if;
  flow=advance_sales_flow(site,'approve',flow.revision,'{}',indoor);
  flow=advance_sales_flow(site,'contract',flow.revision,'{"number":"TEST-ADDITIONAL"}',indoor);
  flow=advance_sales_flow(site,'sign',flow.revision,'{"signer":"Test","method":"digital","signature":"test"}',indoor);
  select updated_at into stamp from projects where id=site;
  begin
   perform sync_field_change(gen_random_uuid(),indoor,site,'request-openings',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
   raise exception using errcode='ZX001',message='Signed project reopened';
  exception when sqlstate 'P0001' then assert sqlerrm='Additional openings can only be requested after measurements and before signing.'; end;
 end loop;
 raise notice 'PASS: additional tasks before/after quotation, role checks, assigned-only access, baseline preservation, new edits, submission, quotation revisions and signed locks';
end $$;
rollback;
