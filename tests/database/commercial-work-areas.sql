begin;
do $$
declare indoor uuid:=gen_random_uuid(); quote jsonb; flow sales_workflows; outdoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); home uuid:=gen_random_uuid(); opening_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); payload jsonb; changed jsonb; bad jsonb;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Commercial area test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready","buildingType":"commercial_building"}}',now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,home,'register','{"client":{"clientName":"Villa test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready","buildingType":"villa_house"}}',now(),null);
 payload=jsonb_build_object('id',opening_id,'floor','GF','room','Other','otherRoom','Facade 1','width',500,'height',600,'structuralType','Curtain Wall','openingType',null,'workArea','facade','facadeNumber',1,'curtainWall','{"note":"Review anchors","photo":"data:image/jpeg;base64,/9j/AAAA"}'::jsonb);
 foreach bad in array array['{"workArea":"invalid"}'::jsonb,'{"facadeNumber":0}'::jsonb,'{"facadeNumber":1.5}'::jsonb,'{"facadeNumber":1001}'::jsonb,'{"facadeNumber":"2"}'::jsonb,'{"workArea":"internal"}'::jsonb] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||bad,now(),null);
   raise exception using errcode='ZX001',message='Invalid area accepted';
  exception when sqlstate 'P0001' then null; end;
 end loop;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,home,'opening',payload,now(),null);
  raise exception using errcode='ZX001',message='Villa accepted commercial area';
 exception when sqlstate 'P0001' then assert sqlerrm='Facade and Internal works are only available for commercial buildings.'; end;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 from openings where project_id=site),'Retry duplicated facade';
 assert (select work_area='facade' and facade_number=1 and room='Facade 1' from openings where id=opening_id);
 changed=payload||'{"facadeNumber":2,"otherRoom":"Facade 2"}'::jsonb;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload,'opening',changed),now(),null);
 assert (select facade_number=2 and room='Facade 2' and curtain_wall_capture=payload->'curtainWall' from openings where id=opening_id),'Facade edit lost details';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload,'opening',changed||'{"width":800}'::jsonb),now(),null);
  raise exception using errcode='ZX001',message='Stale facade edit accepted';
 exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
 -- Internal rooms and additional facades coexist on the same commercial project.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'curtainWall')||jsonb_build_object('id',gen_random_uuid(),'facadeNumber',3,'otherRoom','Facade 3'),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'curtainWall'-'facadeNumber')||jsonb_build_object('id',gen_random_uuid(),'workArea','internal','room','Office','structuralType','Window','openingType','Sliding'),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'curtainWall'-'facadeNumber')||jsonb_build_object('id',gen_random_uuid(),'workArea','internal','room','Bathroom','structuralType','Door','openingType','Hinged'),now(),null);
 -- Older queued commercial openings and unchanged villa measurements remain valid.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'workArea'-'facadeNumber'-'curtainWall')||jsonb_build_object('id',gen_random_uuid(),'room','Office'),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,home,'opening',(payload-'workArea'-'facadeNumber'-'curtainWall')||jsonb_build_object('id',gen_random_uuid(),'room','Bedroom'),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 select jsonb_build_object('lines',jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction,'has_arch',has_arch,'work_area',work_area,'facade_number',facade_number)) order by facade_number nulls last),'total',100000,'currency','IQD') into quote from openings where project_id=site;
 flow=advance_sales_flow(site,'save',0,quote,indoor);
 assert flow.quotation#>>'{lines,0,opening,work_area}'='facade';
 assert flow.quotation#>>'{lines,0,opening,facade_number}'='2';
 begin
  update openings set work_area=null,facade_number=null where id=opening_id;
  raise exception using errcode='ZX001',message='Quoted location changed';
 exception when sqlstate 'P0001' then null; end;
 flow=advance_sales_flow(site,'approve',1,'{}',indoor);
 flow=advance_sales_flow(site,'contract',2,'{"number":"TEST-COMMERCIAL-AREA"}',indoor);
 assert flow.contract#>>'{quotation,lines,0,opening,facade_number}'='2';
 raise notice 'PASS: commercial facades and internal rooms validate, retry, edit with stale-write checks, retain captures and contract locations, and keep legacy/villa measurements compatible';
end $$;
rollback;
