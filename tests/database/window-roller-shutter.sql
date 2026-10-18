begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 opening_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid(); added_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid();
 payload jsonb; bad jsonb; quote jsonb; measured jsonb; changed jsonb; flow sales_workflows;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Roller shutter test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:=jsonb_build_object('id',opening_id,'floor','GF','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding','quantity',2,'hasRollerShutter',true);
 foreach bad in array array['0'::jsonb,'1'::jsonb,'null'::jsonb,'"true"'::jsonb] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_set(payload,'{hasRollerShutter}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid shutter accepted';
  exception when sqlstate 'P0001' then null; end;
 end loop;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||'{"structuralType":"Skylight","openingType":null}',now(),null);
  raise exception using errcode='ZX001',message='Skylight shutter accepted';
 exception when sqlstate 'P0001' then null; end;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||'{"structuralType":"Door"}',now(),null);
  raise exception using errcode='ZX001',message='Door request accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='Roller shutters can only be requested for a window.'; end;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 and bool_and(has_roller_shutter) from openings where project_id=site), 'Roller shutter must sync once';
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'hasRollerShutter')||jsonb_build_object('id',legacy_id,'structuralType','Window'),now(),null);
 assert (select not has_roller_shutter from openings where id=legacy_id), 'Older devices default to no shutter';
 changed:=payload||'{"hasRollerShutter":false}'::jsonb;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',payload),now(),null);
 assert (select not has_roller_shutter from openings where id=opening_id);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed||'{"width":180}', 'previous',payload),now(),null);
  raise exception using errcode='ZX001',message='Stale shutter overwritten';
 exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',payload,'previous',changed),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 select jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction,'has_roller_shutter',has_roller_shutter)) order by has_roller_shutter desc) into measured from openings where project_id=site;
 quote:=jsonb_build_object('lines',measured,'total',100000,'currency','IQD');
 begin
  perform advance_sales_flow(site,'save',0,jsonb_set(quote,'{lines,0,opening,has_roller_shutter}','false'),indoor);
  raise exception using errcode='ZX001',message='Snapshot changed measured shutter';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;
 begin
  perform advance_sales_flow(site,'save',0,quote#-'{lines,0,opening,has_roller_shutter}',indoor);
  raise exception using errcode='ZX001',message='Older client silently lost shutter';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;
 flow:=advance_sales_flow(site,'save',0,quote,indoor);
 assert flow.quotation#>>'{lines,0,opening,has_roller_shutter}'='true';
 begin
  update openings set has_roller_shutter=false where id=opening_id;
  raise exception using errcode='ZX001',message='Quoted shutter changed';
 exception when sqlstate 'P0001' then null; end;
 measured:=measured||jsonb_build_array(jsonb_build_object('opening',jsonb_build_object('id',added_id,'floor','F1','room','Office','width',100,'height',200,'quantity',1,'opening_type','Window','opening_direction','Hinged','has_roller_shutter',true)));
 quote:=jsonb_build_object('lines',measured,'total',200000,'currency','IQD');
 flow:=advance_sales_flow(site,'save',1,quote,indoor);
 assert (select has_roller_shutter from openings where id=added_id);
 assert (select quotation#>>'{lines,0,opening,has_roller_shutter}'='true' from quotation_revisions where project_id=site and version=1);
 flow:=advance_sales_flow(site,'approve',2,'{}',indoor);
 flow:=advance_sales_flow(site,'contract',3,'{"number":"TEST-SHUTTER"}',indoor);
 assert flow.contract#>>'{quotation,lines,0,opening,has_roller_shutter}'='true';
 assert flow.contract#>>'{quotation,lines,2,opening,has_roller_shutter}'='true';
 raise notice 'PASS: shutter choices validate, sync once, edit safely, support old clients and survive quotation revisions and contracts';
end $$;
rollback;
