begin;
do $$
declare
 indoor uuid:=gen_random_uuid(); outdoor uuid:=gen_random_uuid(); site uuid; client uuid;
 stamp timestamptz; phase text; result jsonb; workflow_stage text; quote jsonb:='{"total":100,"saved":"preserved"}';
begin
 insert into auth.users(id,email) values(indoor,indoor::text||'@example.invalid'),(outdoor,outdoor::text||'@example.invalid');
 update profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id=indoor;
 update profiles set role='Outdoor Sales',is_active=true,status='Active' where id=outdoor;
 insert into clients(client_name,mobile,client_type,created_by) values('Reactivation test','00000000000','individual',indoor) returning id into client;
 foreach phase in array array['new_lead','ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'] loop
  site:=gen_random_uuid();
  insert into projects(id,client_id,project_name,project_number,created_by,assigned_outdoor_sales_id,structure_readiness,sales_status,status)
  values(site,client,'Reactivation test','TEST-'||site,indoor,outdoor,'ready',phase,
   (case when phase='new_lead' then 'Draft' when phase='contract_generated' then 'Contract' else 'Quotation' end)::public.project_status);
  insert into openings(project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,created_by)
  values(site,'TEST-'||site,'Ground','Kitchen',120,150,1,'Window','Sliding',outdoor);
  workflow_stage:=case phase when 'quotation_in_progress' then 'quotation' when 'quotation_approved' then 'approved' when 'contract_generated' then 'contract' end;
  if workflow_stage is not null then insert into sales_workflows(project_id,stage,quotation,contract) values(site,workflow_stage,quote,case when workflow_stage='contract' then '{"saved":"contract"}'::jsonb end); end if;
  select updated_at into stamp from projects where id=site;
  perform sync_field_change(gen_random_uuid(),indoor,site,'cancel-project','{"note":"Client declined","confirmed":true}',now(),stamp);
  select updated_at into stamp from projects where id=site;
  begin
   perform reactivate_client_project(site,outdoor,'Forged request',stamp);
   raise exception using errcode='ZX001',message='Outdoor reactivation accepted';
  exception when sqlstate '42501' then null; end;
  begin
   perform reactivate_client_project(site,indoor,'Client changed mind','2000-01-01');
   raise exception using errcode='ZX001',message='Stale reactivation accepted';
  exception when sqlstate 'P0001' then null; end;
  begin
   update projects set sales_status=phase,client_cancelled_at=null where id=site;
   raise exception using errcode='ZX001',message='Direct reactivation accepted';
  exception when sqlstate 'P0001' then null; end;
  result:=reactivate_client_project(site,indoor,'  Client changed mind  ',stamp);
  assert result->>'sales_status'=phase,'Incorrect restored sales stage';
  assert (select client_cancelled_at is null and client_cancellation_note is null and client_cancelled_by is null from projects where id=site);
  assert (select count(*)=1 from openings where project_id=site),'Measurements lost';
  assert (select count(*)=1 from field_sync_receipts where project_id=site and action='cancel-project'),'Cancellation history lost';
  assert (select count(*)=1 from field_sync_receipts r where project_id=site and action='reactivate-project' and actor_id=indoor and r.result->>'reactivation_note'='Client changed mind'),'Reactivation history missing';
  if workflow_stage is not null then assert (select quotation=quote and revision=1 from sales_workflows where project_id=site),'Quotation changed'; end if;
  begin
   perform reactivate_client_project(site,indoor,'Repeat',stamp);
   raise exception using errcode='ZX001',message='Active project reactivated';
  exception when sqlstate 'P0001' then null; end;
 end loop;
 assert not has_function_privilege('authenticated','public.reactivate_client_project(uuid,uuid,text,timestamptz)','EXECUTE');
 assert not has_function_privilege('anon','public.reactivate_client_project(uuid,uuid,text,timestamptz)','EXECUTE');
 raise notice 'PASS: reactivation permissions, concurrency, all sales stages, preserved records and history';
end $$;
rollback;
