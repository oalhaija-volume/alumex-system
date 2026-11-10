begin;

-- Client identity is shared by its projects; project titles and saved commercial
-- documents remain independent. Only the server may execute this narrow update.
create or replace function public.rename_project_client(
  p_project uuid,
  p_actor uuid,
  p_client_name text,
  p_expected_client_name text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  employee public.profiles;
  project public.projects;
  customer public.clients;
  renamed_client text;
  renamed_company text;
begin
  if auth.role() = 'authenticated' and p_actor is distinct from auth.uid() then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into employee from public.profiles where id=p_actor for share;
  if employee.id is null or employee.is_active is not true
    or employee.status is distinct from 'Active'
    or public.sales_permission_role(employee.role) is distinct from 'Indoor Sales' then
    raise exception using errcode='42501',message='Only Indoor Sales can change client names.';
  end if;
  perform public.require_indoor_project_branch(p_project,p_actor);
  select * into project from public.projects where id=p_project for update;
  if not found then
    raise exception using errcode='42501',message='Project is not available to this employee';
  end if;
  renamed_client:=regexp_replace(p_client_name,'^[[:space:]]+|[[:space:]]+$','','g');
  if renamed_client is null or renamed_client='' or length(renamed_client)>150 then
    raise exception using errcode='22023',message='Enter a client name of 1 to 150 characters.';
  end if;
  select * into customer from public.clients where id=project.client_id for update;
  if not found then
    raise exception using errcode='42501',message='Client is not available to this employee';
  end if;
  if p_expected_client_name is null or customer.client_name is distinct from p_expected_client_name then
    raise exception 'This client changed on another device. Reload the projects before changing its name.';
  end if;
  if customer.client_name=renamed_client then
    return jsonb_build_object('id',customer.id,'client_name',customer.client_name);
  end if;
  -- Registration defaults company_name to client_name when no company detail
  -- was supplied. Keep that alias aligned, preserving an explicit company name.
  renamed_company:=case when customer.client_type='company' and customer.company_name=customer.client_name
    then renamed_client else customer.company_name end;
  update public.clients set client_name=renamed_client,company_name=renamed_company where id=customer.id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value)
  values(p_actor,employee.role,'client_renamed','client',customer.id,
    jsonb_build_object('client_name',customer.client_name,'company_name',customer.company_name),
    jsonb_build_object('client_name',renamed_client,'company_name',renamed_company));
  return jsonb_build_object('id',customer.id,'client_name',renamed_client);
end;
$$;

revoke all on function public.rename_project_client(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.rename_project_client(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
