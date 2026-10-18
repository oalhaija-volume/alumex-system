begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); other_employee uuid:=gen_random_uuid();
 site uuid:=gen_random_uuid(); another_site uuid:=gen_random_uuid(); opening_id uuid:=gen_random_uuid(); sky_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid();
 previous jsonb; changed jsonb; edit jsonb; result jsonb; stamp timestamptz; patch jsonb; target_status text;
begin
 insert into auth.users(id,email) values(indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid'),(other_employee,other_employee::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,other_employee);
 perform sync_field_change(gen_random_uuid(),indoor,site,'register',jsonb_build_object('client',jsonb_build_object('clientName','Opening edit test','mobile','00000000000','clientType','individual'),'project',jsonb_build_object('address','Baghdad','structureReadiness','ready','assignedOutdoorSalesId',outdoor)),now(),null);
 previous=jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'quantity',2,'structuralType','Window','openingType','Sliding');
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',previous,now(),null);
 changed=previous||'{"width":180,"height":220,"quantity":4,"floor":"First","room":"Other","otherRoom":"Reception","openingType":"Hinged"}'::jsonb;
 edit=jsonb_build_object('opening',changed,'previous',previous);
 begin
  perform sync_field_change(gen_random_uuid(),other_employee,site,'edit-opening',edit,now(),null);
  raise exception using errcode='ZX001',message='Unrelated employee edited measurements';
 exception when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee'; end;
 foreach patch in array array['{"width":0}'::jsonb,'{"height":100001}'::jsonb,'{"quantity":1.5}'::jsonb,'{"floor":""}'::jsonb,'{"room":"Invalid"}'::jsonb,'{"openingType":null}'::jsonb] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed||patch,'previous',previous),now(),null);
   raise exception using errcode='ZX001',message='Invalid measurements accepted';
  exception when sqlstate 'P0001' then null; end;
 end loop;
 result=sync_field_change(operation,outdoor,site,'edit-opening',edit,now(),null);
 assert (select width=180 and height=220 and quantity=4 and floor='First' and room='Reception' and opening_direction='Hinged' and created_by=outdoor from openings where id=opening_id);
 assert (select count(*)=1 from openings where project_id=site);
 assert sync_field_change(operation,outdoor,site,'edit-opening',edit,now(),null)=result,'Retry must return the saved receipt';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',edit,now(),null);
  raise exception using errcode='ZX001',message='Stale edit overwrote measurements';
 exception when sqlstate 'P0001' then assert sqlerrm='This opening changed on another device. Reload measurements before editing it again.'; end;
 -- The next edit uses the latest saved baseline, matching consecutive offline edits.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',changed||'{"width":190}'::jsonb,'previous',changed),now(),null);
 changed=changed||'{"width":190}'::jsonb;
 edit=jsonb_build_object('opening',changed||'{"width":200}'::jsonb,'previous',changed);
 perform sync_field_change(gen_random_uuid(),outdoor,another_site,'register','{"client":{"clientName":"Another site","mobile":"00000000000","clientType":"individual"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,another_site,'edit-opening',edit,now(),null);
  raise exception using errcode='ZX001',message='Opening moved between projects';
 exception when sqlstate 'P0001' then assert sqlerrm='Opening not found in this project.'; end;
 select updated_at into stamp from projects where id=site;
 perform sync_field_change(gen_random_uuid(),outdoor,site,'delay-measurements','{"note":"Client asked to return later"}',now(),stamp);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',edit,now(),null);
  raise exception using errcode='ZX001',message='Delayed measurements edited';
 exception when sqlstate 'P0001' then assert sqlerrm='Resume measurements before recording or completing them.'; end;
 select updated_at into stamp from projects where id=site;
 perform sync_field_change(gen_random_uuid(),indoor,site,'assign-measurements',jsonb_build_object('assignedOutdoorSalesId',outdoor),now(),stamp);
 foreach target_status in array array['ready_for_quotation','quotation_in_progress','cancelled'] loop
  update projects set sales_status=target_status where id=site;
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',edit,now(),null);
   raise exception using errcode='ZX001',message='Locked measurements edited';
  exception when sqlstate 'P0001' then assert sqlerrm='Reopen measurements before editing an opening.'; end;
  update projects set sales_status='new_lead' where id=site;
 end loop;
 -- A dimension correction preserves the skylight shape and original creator.
 previous=jsonb_build_object('id',sky_id,'floor','Roof','room','Other','otherRoom','Atrium','width',200,'height',300,'quantity',1,'structuralType','Skylight','openingType',null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',previous||'{"skylight":{"drawing":"data:image/png;base64,iVBORw0KGgoAAAA=","sections":[{"label":"A","width":200,"length":300}]}}'::jsonb,now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',previous||'{"width":250}'::jsonb,'previous',previous),now(),null);
 assert (select width=250 and skylight_capture#>>'{sections,0,label}'='A' and skylight_capture->>'drawing'='data:image/png;base64,iVBORw0KGgoAAAA=' and created_by=outdoor from openings where id=sky_id);
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('opening',previous||'{"structuralType":"Window","openingType":"Sliding"}'::jsonb,'previous',previous||'{"width":250}'::jsonb),now(),null);
  raise exception using errcode='ZX001',message='Saved skylight capture detached';
 exception when sqlstate 'P0001' then assert sqlerrm='A saved skylight shape must remain attached to a skylight.'; end;
 raise notice 'PASS: opening edit validation, ownership, project boundaries, stale drafts, retries, sequential edits, workflow locks, quantity and skylight preservation';
end $$;
rollback;
