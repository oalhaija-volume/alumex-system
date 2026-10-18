begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 opening_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid(); added_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid();
 payload jsonb; bad jsonb; quote jsonb; measured jsonb; flow sales_workflows;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Repeated openings test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:=jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding','quantity',8);
 foreach bad in array array['0'::jsonb,'-1'::jsonb,'1.5'::jsonb,'10001'::jsonb,'null'::jsonb,'"8"'::jsonb] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_set(payload,'{quantity}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid quantity accepted';
  exception when sqlstate 'P0001' then null;
  end;
 end loop;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 and max(quantity)=8 from openings where project_id=site), 'Retry duplicated quantities';
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'quantity')||jsonb_build_object('id',legacy_id),now(),null);
 assert (select quantity=1 from openings where id=legacy_id), 'Older devices must default to one';
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 select jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction)) order by quantity desc) into measured from openings where project_id=site;
 quote:=jsonb_build_object('lines',measured,'total',100000,'currency','IQD');
 begin
  perform advance_sales_flow(site,'save',0,jsonb_set(quote,'{lines,0,opening,quantity}','1'),indoor);
  raise exception using errcode='ZX001',message='Snapshot changed measured quantity';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.';
 end;
 flow:=advance_sales_flow(site,'save',0,quote,indoor);
 assert flow.quotation#>>'{lines,0,opening,quantity}'='8';
 begin
  update openings set quantity=9 where id=opening_id;
  raise exception using errcode='ZX001',message='Quoted quantity changed';
 exception when sqlstate 'P0001' then null;
 end;
 -- Revisions can add a new measured group atomically with its exact quantity.
 measured:=measured||jsonb_build_array(jsonb_build_object('opening',jsonb_build_object('id',added_id,'floor','Second','room','Office','width',100,'height',200,'quantity',3.0,'opening_type','Window','opening_direction','Sliding')));
 quote:=jsonb_build_object('lines',measured,'total',200000,'currency','IQD');
 flow:=advance_sales_flow(site,'save',1,quote,indoor);
 assert (select quantity=3 from openings where id=added_id);
 assert (select sum(quantity)=12 from openings where project_id=site);
 assert (select quotation#>>'{lines,0,opening,quantity}'='8' from quotation_revisions where project_id=site and version=1);
 flow:=advance_sales_flow(site,'approve',2,'{}',indoor);
 flow:=advance_sales_flow(site,'contract',3,'{"number":"TEST-REPEATED"}',indoor);
 assert flow.contract#>>'{quotation,lines,0,opening,quantity}'='8';
 assert (flow.contract#>>'{quotation,lines,2,opening,quantity}')::numeric=3;
 raise notice 'PASS: repeated quantities validate, sync once, support old devices, complete measurements, remain locked in quotations, survive revisions and contracts';
end $$;
rollback;
