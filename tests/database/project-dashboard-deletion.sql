-- Synthetic fixtures only; this entire test is rolled back.
begin;
do $$
declare
 admin_id uuid := gen_random_uuid();
 indoor_id uuid := gen_random_uuid();
 target_project_id uuid := gen_random_uuid();
 opening_id uuid := gen_random_uuid();
 client_id uuid;
 payload jsonb;
begin
 insert into auth.users(id,email) values(admin_id,admin_id::text||'@example.invalid'),(indoor_id,indoor_id::text||'@example.invalid');
 update public.profiles set role='Admin',is_active=true,status='Active' where id=admin_id;
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor_id;
 payload := jsonb_build_object('client',jsonb_build_object('clientName','Deletion test fixture','mobile','00000000000','clientType','individual'),
   'project',jsonb_build_object('structureReadiness','ready','locationLatitude',33.3,'locationLongitude',44.4,'address','Baghdad'));
 perform public.sync_field_change(gen_random_uuid(),admin_id,target_project_id,'register',payload,now(),null);
 select p.client_id into client_id from public.projects p where id=target_project_id;
 perform public.sync_field_change(gen_random_uuid(),admin_id,target_project_id,'opening',
   jsonb_build_object('id',opening_id,'floor','Ground','room','Kitchen','width',120,'height',150,'structuralType','Window','openingType','Sliding'),now(),null);
 insert into public.sales_workflows(project_id,stage,quotation,contract,evidence)
 values(target_project_id,'contract','{}','{}',jsonb_build_object('method','upload','path',target_project_id::text||'/fixture.pdf'));
 insert into public.quotation_revisions(project_id,version,workflow_revision,quotation,contract,previous_stage)
 values(target_project_id,1,1,'{}','{}','contract');
 begin
   perform public.delete_projects_as_admin(array[target_project_id],indoor_id);
   raise exception using errcode='ZX001',message='Indoor Sales was allowed to delete a project';
 exception when sqlstate 'P0001' then assert sqlerrm='Only an active Admin can delete projects.';
 end;
 assert exists(select 1 from public.projects where id=target_project_id);
 perform public.delete_projects_as_admin(array[target_project_id],admin_id);
 assert not exists(select 1 from public.projects where id=target_project_id);
 assert exists(select 1 from public.clients where id=client_id), 'Client must be retained';
 assert not exists(select 1 from public.openings where id=opening_id);
 assert not exists(select 1 from public.sales_workflows f where f.project_id=target_project_id);
 assert not exists(select 1 from public.quotation_revisions r where r.project_id=target_project_id);
 assert not exists(select 1 from public.field_sync_receipts r where r.project_id=target_project_id);
 assert exists(select 1 from public.deleted_project_ids d where d.project_id=target_project_id);
 assert exists(select 1 from public.project_file_cleanup c where c.project_id=target_project_id), 'Signed file cleanup must be queued';
 assert exists(select 1 from public.audit_events where entity_id=target_project_id and action='project_deleted' and actor_id=admin_id);
 begin
   perform public.sync_field_change(gen_random_uuid(),admin_id,target_project_id,'register',payload,now(),null);
   raise exception using errcode='ZX001',message='Deleted project was recreated by offline replay';
 exception when sqlstate 'P0001' then assert sqlerrm='This project was deleted. Its saved offline work cannot be synced.';
 end;
 raise notice 'PASS: Admin deletion removes project dependencies, retains client and audit, queues file cleanup, blocks unauthorized deletion and offline replay';
end;
$$;
rollback;
