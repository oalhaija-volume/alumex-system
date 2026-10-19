begin;

-- Keep the stored job title and audit attribution distinct. Only permission
-- comparisons resolve Sales Manager to Indoor Sales.
create or replace function public.sales_permission_role(p_role public.app_role)
returns public.app_role language sql immutable strict set search_path = public as $$
  select case when p_role = 'Sales Manager' then 'Indoor Sales'::public.app_role else p_role end;
$$;
revoke all on function public.sales_permission_role(public.app_role) from public, anon;
grant execute on function public.sales_permission_role(public.app_role) to authenticated, service_role;

-- Patch permission predicates in installed functions instead of replacing entire
-- workflows. This preserves later measurement fixes, qualified-column repairs,
-- function grants, and real role values recorded in attribution/audit columns.
-- The list includes legacy RPCs because they remain callable directly.
do $migration$
declare
  routine record;
  definition text;
  original_definition text;
begin
  for routine in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(array[
      'is_sales_manager_or_admin', 'is_document_management_role', 'is_workflow_role',
      'can_view_sales_prices', 'can_view_finance_values',
      'can_view_sales_project', 'can_manage_sales_project',
      'reassign_sales_project_owner', 'transition_project_sales_status',
      'create_measurement_request', 'assign_measurement_request', 'advance_measurement_workflow',
      'create_sales_follow_up_task', 'record_sales_follow_up_activity',
      'save_quotation_version_with_items', 'transition_quotation_version',
      'sign_contract_and_create_handoff', 'update_sales_appointment_status',
      'ensure_unquoted_project_follow_up', 'claim_sales_follow_up_task',
      'advance_sales_flow', 'sync_field_change', 'reactivate_client_project',
      'validate_project_registration_owner', 'validate_follow_up_owner',
      'assign_indoor_project_branch', 'update_employee_profile_with_branch',
      'initialize_project_sales_attribution'
    ])
  loop
    original_definition := pg_get_functiondef(routine.oid);
    if position('public.sales_permission_role(' in original_definition) > 0 then continue; end if;
    definition := regexp_replace(original_definition,
      $pattern$(public\.)?current_user_role\(\)$pattern$,
      'public.sales_permission_role(public.current_user_role())', 'g');
    definition := regexp_replace(definition,
      $pattern$\m(actor_profile\.role|actor_role|owner_role|creator_role|creator\.role|old\.original_creator_role|p_role|role)(::text)?([[:space:]]+(not[[:space:]]+)?in[[:space:]]*\(|[[:space:]]*=[[:space:]]*any[[:space:]]*\(|[[:space:]]*(=|<>)[[:space:]]*'(Admin|Sales Manager|Indoor Sales|Outdoor Sales|HR)')$pattern$,
      'public.sales_permission_role(\1::public.app_role)\3', 'g');

    if routine.proname = 'assign_indoor_project_branch' then
      definition := replace(definition, 'new.original_creator_role := ''Indoor Sales'';',
        'new.original_creator_role := creator.role;');
    end if;
    if routine.proname = 'initialize_project_sales_attribution' then
      definition := replace(definition, 'case creator_role',
        'case public.sales_permission_role(creator_role)');
    end if;
    if routine.proname = 'reassign_sales_project_owner' then
      definition := replace(definition, 'case owner_profile.role',
        'case public.sales_permission_role(owner_profile.role)');
    end if;
    if definition <> original_definition then execute definition; end if;
  end loop;
end;
$migration$;

-- Direct table access must also lose the old manager-only audit/contract grants.
-- ALTER POLICY preserves the existing command, roles and permissive/restrictive mode.
do $policies$
declare
  policy record;
  expression text;
begin
  for policy in select * from pg_policies where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'Sales Manager|Indoor Sales'
    and (coalesce(qual, '') || coalesce(with_check, '')) not like '%sales_permission_role%'
  loop
    if policy.qual is not null then
      expression := regexp_replace(policy.qual, $pattern$(public\.)?current_user_role\(\)$pattern$,
        'public.sales_permission_role(public.current_user_role())', 'g');
      if expression <> policy.qual then
        execute format('alter policy %I on %I.%I using (%s)',
          policy.policyname, policy.schemaname, policy.tablename, expression);
      end if;
    end if;
    if policy.with_check is not null then
      expression := regexp_replace(policy.with_check, $pattern$(public\.)?current_user_role\(\)$pattern$,
        'public.sales_permission_role(public.current_user_role())', 'g');
      if expression <> policy.with_check then
        execute format('alter policy %I on %I.%I with check (%s)',
          policy.policyname, policy.schemaname, policy.tablename, expression);
      end if;
    end if;
  end loop;
end;
$policies$;

-- Reflect the same access in configurable workflow rules and discount defaults.
update public.sales_status_transitions
set allowed_roles = case when 'Indoor Sales'::public.app_role = any(allowed_roles)
  then array_append(array_remove(allowed_roles, 'Sales Manager'::public.app_role), 'Sales Manager'::public.app_role)
  else array_remove(allowed_roles, 'Sales Manager'::public.app_role) end
where 'Indoor Sales'::public.app_role = any(allowed_roles) or 'Sales Manager'::public.app_role = any(allowed_roles);

insert into public.discount_policy_settings(role, max_discount_percent)
values ('Sales Manager', coalesce((select max_discount_percent from public.discount_policy_settings where role = 'Indoor Sales'), 2))
on conflict (role) do update set max_discount_percent = excluded.max_discount_percent;

notify pgrst, 'reload schema';
commit;
