begin;

-- Add Admin to the existing narrow client-name transaction. Preserve office
-- branch boundaries, locks, stale-name checks, document snapshots and auditing.
do $admin_client_names$
declare
  definition text;
  previous_guard text := $guard$public.sales_permission_role(employee.role) is distinct from 'Indoor Sales'$guard$;
  admin_guard text := $guard$(employee.role is distinct from 'Admin' and public.sales_permission_role(employee.role) is distinct from 'Indoor Sales')$guard$;
  previous_message text := 'Only Indoor Sales can change client names.';
  admin_message text := 'Only Admin, Indoor Sales and Sales Managers can change client names.';
begin
  select pg_get_functiondef('public.rename_project_client(uuid,uuid,text,text)'::regprocedure)
    into definition;
  if position('employee.is_active is not true' in definition)=0
    or position('employee.status is distinct from ''Active''' in definition)=0
    or position('public.require_indoor_project_branch(p_project,p_actor)' in definition)=0
    or position('customer.client_name is distinct from p_expected_client_name' in definition)=0
    or position('length(renamed_client)>150' in definition)=0
    or position('for update;' in definition)=0
    or position('values(p_actor,employee.role,''client_renamed''' in definition)=0 then
    raise exception 'Unexpected client-name transaction; Admin permission was not applied.';
  end if;
  if position(admin_guard in definition)>0 then
    if cardinality(string_to_array(definition,admin_guard))<>2
      or cardinality(string_to_array(definition,admin_message))<>2
      or position(previous_message in definition)>0 then
      raise exception 'Unexpected partial Admin client-name permission migration.';
    end if;
    return;
  end if;
  if cardinality(string_to_array(definition,previous_guard))<>2
    or cardinality(string_to_array(definition,previous_message))<>2 then
    raise exception 'Unexpected client-name permission; Admin permission was not applied.';
  end if;
  execute replace(replace(definition,previous_guard,admin_guard),previous_message,admin_message);
end;
$admin_client_names$;

notify pgrst, 'reload schema';
commit;
