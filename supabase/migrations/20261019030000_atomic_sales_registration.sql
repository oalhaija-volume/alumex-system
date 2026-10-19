begin;

-- Reuse the validated registration transaction and number lock used by mobile sync.
-- Only the server may provide the authenticated actor; browser roles cannot call it.
create or replace function public.register_sales_project(p_actor uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  project_id uuid := gen_random_uuid();
  result jsonb;
begin
  perform public.sync_field_change(gen_random_uuid(), p_actor, project_id, 'register', p_payload, now(), null);
  select jsonb_build_object('projectId', id, 'clientId', client_id, 'projectNumber', project_number)
    into result from public.projects where id=project_id;
  return result;
end;
$$;
revoke all on function public.register_sales_project(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.register_sales_project(uuid,jsonb) to service_role;

commit;
