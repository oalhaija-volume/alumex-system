begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); facade_id uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); payload jsonb; changed jsonb; quote jsonb; flow sales_workflows;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Whole facades test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready","buildingType":"commercial_building"}}',now(),null);
 payload=jsonb_build_object('id',facade_id,'floor','Whole building','room','Other','otherRoom','Facade 1','width',1200,'height',2500,'quantity',1,'structuralType','Facade','openingType',null,'workArea','facade','facadeNumber',1);
 perform sync_field_change(op,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(op,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 from openings where project_id=site);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',gen_random_uuid()),now(),null);
  raise exception using errcode='ZX001',message='Duplicate facade number accepted';
 exception when unique_violation then null; end;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',gen_random_uuid(),'facadeNumber',2,'otherRoom','Facade 2','quantity',2),now(),null);
  raise exception using errcode='ZX001',message='Repeated whole facade accepted';
 exception when check_violation then null; end;
 changed=payload||'{"width":1500}'::jsonb;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload,'opening',changed),now(),null);
 assert (select width=1500 from openings where id=facade_id);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload,'opening',changed),now(),null);
  raise exception using errcode='ZX001',message='Stale facade edit accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
 for i in 2..4 loop
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',gen_random_uuid(),'facadeNumber',i,'otherRoom','Facade '||i),now(),null);
 end loop;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'facadeNumber')||jsonb_build_object('id',gen_random_uuid(),'floor','F1','room','Office','otherRoom','','structuralType','Window','openingType','Sliding','workArea','internal'),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 select jsonb_build_object('lines',jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction))),'total',100000,'currency','IQD') into quote from openings where project_id=site and opening_type<>'Facade';
 begin
  flow=advance_sales_flow(site,'save',0,quote,indoor);
  raise exception using errcode='ZX001',message='Missing facade snapshot accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='Facade dimensions changed. Reload the quotation.'; end;
 quote=quote||jsonb_build_object('facadeMeasurements',(select jsonb_agg(jsonb_build_object('id',id,'width',width,'height',height,'opening_type','Facade','facade_number',facade_number) order by facade_number) from openings where project_id=site and opening_type='Facade'));
 begin
  flow=advance_sales_flow(site,'save',0,jsonb_set(quote,'{facadeMeasurements,0,width}','1'),indoor);
  raise exception using errcode='ZX001',message='Changed facade snapshot accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='Facade dimensions changed. Reload the quotation.'; end;
 flow=advance_sales_flow(site,'save',0,quote,indoor);
 assert jsonb_array_length(flow.quotation->'lines')=1;
 assert jsonb_array_length(flow.quotation->'facadeMeasurements')=4;
 begin
  update openings set width=1 where id=facade_id;
  raise exception using errcode='ZX001',message='Quoted facade changed';
 exception when sqlstate 'P0001' then null; end;
 flow=advance_sales_flow(site,'approve',1,'{}',indoor);
 flow=advance_sales_flow(site,'contract',2,'{"number":"TEST-WHOLE-FACADES"}',indoor);
 assert jsonb_array_length(flow.contract#>'{quotation,facadeMeasurements}')=4;
 raise notice 'PASS: four whole facades, internal opening, retry, edit, duplicates, snapshot validation and contract locks';
end $$;
rollback;
