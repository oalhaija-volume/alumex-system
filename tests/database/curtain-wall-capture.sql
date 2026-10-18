begin;
do $$
declare outdoor uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); opening_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); payload jsonb; bad jsonb;
begin
 insert into auth.users(id,email) values(outdoor,outdoor::text||'@example.invalid'),(stranger,stranger::text||'@example.invalid');
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id in(outdoor,stranger);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'register','{"client":{"clientName":"Curtain Wall test","clientType":"individual","mobile":"00000000000"},"project":{"address":"Baghdad","structureReadiness":"ready"}}',now(),null);
 payload:=jsonb_build_object('id',opening_id,'floor','Roof','room','Other','otherRoom','Roof','width',500,'height',600,'structuralType','Curtain Wall','openingType',null,'quantity',1,'curtainWall','{"photo":"data:image/jpeg;base64,/9j/AAAA","note":"Check fixing points"}'::jsonb);
 begin
  perform sync_field_change(gen_random_uuid(),stranger,site,'opening',payload,now(),null);
  raise exception using errcode='ZX001',message='Unauthorized employee wrote curtainWall';
 exception when sqlstate 'P0001' then assert sqlerrm='Project is not available to this employee'; end;
 foreach bad in array array['"invalid"'::jsonb,'{"note":null}'::jsonb,'{"note":"","photo":"data:image/svg+xml;base64,AA=="}'::jsonb,jsonb_build_object('note',repeat('A',2001)),jsonb_build_object('note','','photo','data:image/jpeg;base64,/9j/'||repeat('A',700000))] loop
  begin
   perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',jsonb_set(payload,'{curtainWall}',bad),now(),null);
   raise exception using errcode='ZX001',message='Invalid capture accepted';
  exception when check_violation then null; end;
 end loop;
 assert not exists(select 1 from openings where project_id=site), 'Invalid capture left opening behind';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||'{"structuralType":"Window","openingType":"Sliding"}'::jsonb,now(),null);
  raise exception using errcode='ZX001',message='Capture accepted for window';
 exception when check_violation then null; end;
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 perform sync_field_change(operation,outdoor,site,'opening',payload,now(),null);
 assert (select count(*)=1 from openings where project_id=site),'Retry duplicated capture';
 assert (select has_curtain_wall_capture and curtain_wall_capture=payload->'curtainWall' from openings where id=opening_id),'Capture did not round trip';
 begin
  update openings set curtain_wall_capture=null where id=opening_id;
  raise exception using errcode='ZX001',message='Saved capture changed';
 exception when sqlstate 'P0001' then assert sqlerrm='Saved Curtain Wall captures cannot be changed.'; end;
 -- Dimension edits preserve the photo and note; a captured opening cannot change type.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload,'opening',payload||'{"width":550}'::jsonb),now(),null);
 assert (select width=550 and curtain_wall_capture=payload->'curtainWall' from openings where id=opening_id),'Edit lost capture';
 begin
  perform sync_field_change(gen_random_uuid(),outdoor,site,'edit-opening',jsonb_build_object('previous',payload||'{"width":550}'::jsonb,'opening',payload||'{"width":550,"structuralType":"Window","openingType":"Sliding"}'::jsonb),now(),null);
  raise exception using errcode='ZX001',message='Type change detached capture';
 exception when sqlstate 'P0001' then assert sqlerrm='A saved Curtain Wall photo and note must remain attached to a Curtain Wall.'; end;
 -- A note alone, photo alone and a plain opening all remain valid.
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',gen_random_uuid(),'curtainWall',jsonb_build_object('note','Note only')),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',payload||jsonb_build_object('id',gen_random_uuid(),'curtainWall',jsonb_build_object('note','','photo',payload#>>'{curtainWall,photo}')),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'opening',(payload-'curtainWall')||jsonb_build_object('id',gen_random_uuid()),now(),null);
 perform sync_field_change(gen_random_uuid(),outdoor,site,'finish','{}',now(),null);
 assert (select sales_status='ready_for_quotation' from projects where id=site);
 raise notice 'PASS: Curtain Wall capture persists atomically, validates photo and note, protects ownership, retries once and completes measurements';
end $$;
rollback;
