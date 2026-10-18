begin;
do $$
declare outdoor uuid:=gen_random_uuid(); indoor uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 opening_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid(); added_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid();
 payload jsonb; bad jsonb; quote jsonb; measured jsonb; changed jsonb; flow sales_workflows;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(indoor,indoor::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Arch test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:=jsonb_build_object('id',opening_id,'floor','GF','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding','quantity',2,'hasArch',true);
 foreach bad in array array['0'::jsonb,'1'::jsonb,'null'::jsonb,'"true"'::jsonb] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_set(payload,'{hasArch}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid arch accepted';
  exception when sqlstate 'P0001' then null; end;
 end loop;
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||'{"structuralType":"Skylight","openingType":null}',now(),null);
  raise exception using errcode='ZX001',message='Skylight arch accepted';
 exception when sqlstate 'P0001' then null; end;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 and bool_and(has_arch) from openings where project_id=site), 'Arch must sync once';
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'hasArch')||jsonb_build_object('id',legacy_id,'structuralType','Door'),now(),null);
 assert (select not has_arch from openings where id=legacy_id), 'Older devices default to no arch';
 changed:=payload||'{"hasArch":false}'::jsonb;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed,'previous',payload),now(),null);
 assert (select not has_arch from openings where id=opening_id);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed||'{"width":180}', 'previous',payload),now(),null);
  raise exception using errcode='ZX001',message='Stale arch overwritten';
 exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',payload,'previous',changed),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 select jsonb_agg(jsonb_build_object('opening',jsonb_build_object('id',id,'floor',floor,'room',room,'width',width,'height',height,'quantity',quantity,'opening_type',opening_type,'opening_direction',opening_direction,'has_arch',has_arch)) order by has_arch desc) into measured from openings where project_id=site;
 quote:=jsonb_build_object('lines',measured,'total',100000,'currency','IQD');
 begin
  perform advance_sales_flow(site,'save',0,jsonb_set(quote,'{lines,0,opening,has_arch}','false'),indoor);
  raise exception using errcode='ZX001',message='Snapshot changed measured arch';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;
 begin
  perform advance_sales_flow(site,'save',0,quote#-'{lines,0,opening,has_arch}',indoor);
  raise exception using errcode='ZX001',message='Older client silently lost arch';
 exception when sqlstate 'P0001' then assert sqlerrm='Measurements changed. Reload the quotation.'; end;
 flow:=advance_sales_flow(site,'save',0,quote,indoor);
 assert flow.quotation#>>'{lines,0,opening,has_arch}'='true';
 begin
  update openings set has_arch=false where id=opening_id;
  raise exception using errcode='ZX001',message='Quoted arch changed';
 exception when sqlstate 'P0001' then null; end;
 measured:=measured||jsonb_build_array(jsonb_build_object('opening',jsonb_build_object('id',added_id,'floor','F1','room','Office','width',100,'height',200,'quantity',1,'opening_type','Door','opening_direction','Hinged','has_arch',true)));
 quote:=jsonb_build_object('lines',measured,'total',200000,'currency','IQD');
 flow:=advance_sales_flow(site,'save',1,quote,indoor);
 assert (select has_arch from openings where id=added_id);
 assert (select quotation#>>'{lines,0,opening,has_arch}'='true' from quotation_revisions where project_id=site and version=1);
 flow:=advance_sales_flow(site,'approve',2,'{}',indoor);
 flow:=advance_sales_flow(site,'contract',3,'{"number":"TEST-ARCH"}',indoor);
 assert flow.contract#>>'{quotation,lines,0,opening,has_arch}'='true';
 assert flow.contract#>>'{quotation,lines,2,opening,has_arch}'='true';
 raise notice 'PASS: arch choices validate, sync once, edit safely, support old clients and survive quotation revisions and contracts';
end $$;
rollback;
