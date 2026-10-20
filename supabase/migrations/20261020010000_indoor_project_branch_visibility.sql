begin;

-- Branch isolation applies to the actual Indoor Sales job title. Sales Manager
-- keeps its existing permissions even though sales_permission_role maps it to Indoor.
create function public.is_indoor_sales_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text = 'Indoor Sales');
$$;
revoke all on function public.is_indoor_sales_user() from public, anon;
grant execute on function public.is_indoor_sales_user() to authenticated, service_role;

create function public.current_indoor_sales_branch()
returns text language sql stable security definer set search_path = public as $$
  select branch from public.profiles
  where id = auth.uid() and role::text = 'Indoor Sales'
    and is_active and status = 'Active' and branch in ('Karkh', 'Rasafa');
$$;
revoke all on function public.current_indoor_sales_branch() from public, anon;
grant execute on function public.current_indoor_sales_branch() to authenticated, service_role;

create function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or exists (
      select 1 from public.projects p
      where p.id = target_project_id and p.branch in ('Karkh', 'Rasafa')
        and p.branch = public.current_indoor_sales_branch()
    );
$$;
revoke all on function public.can_access_indoor_project_branch(uuid) from public, anon;
grant execute on function public.can_access_indoor_project_branch(uuid) to authenticated, service_role;

-- Client creation precedes project creation. An employee may still read their
-- own new client while it has no projects; existing clients need a matching project.
create function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or (
      public.current_indoor_sales_branch() is not null and (
        exists (
          select 1 from public.projects p where p.client_id = target_client_id
            and p.branch = public.current_indoor_sales_branch()
        )
        or exists (
          select 1 from public.clients c where c.id = target_client_id
            and c.created_by = auth.uid()
            and not exists (select 1 from public.projects p where p.client_id = c.id)
        )
      )
    );
$$;
revoke all on function public.can_access_indoor_client_branch(uuid) from public, anon;
grant execute on function public.can_access_indoor_client_branch(uuid) to authenticated, service_role;

-- Current and legacy RPCs run as their owner, so RLS alone cannot protect them.
-- Lock the employee assignment while the transaction changes/returns project data.
create function public.require_indoor_project_branch(target_project_id uuid, actor_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  project_branch text;
begin
  if auth.role() = 'authenticated' and actor_user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id = actor_user_id for share;
  if actor.role::text = 'Indoor Sales' then
    select branch into project_branch from public.projects where id = target_project_id for update;
    if actor.is_active is not true or actor.status is distinct from 'Active'
      or actor.branch is null or actor.branch not in ('Karkh', 'Rasafa')
      or project_branch is distinct from actor.branch then
      raise exception using errcode = '42501', message = 'Project is not available to this employee';
    end if;
  end if;
end;
$$;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;

-- Add to existing predicates instead of replacing the role/assignment rules.
-- This also covers legacy document and project RPCs that call these helpers.
do $predicates$
declare routine text; definition text; patched text;
begin
  foreach routine in array array[
    'can_view_sales_project', 'can_manage_sales_project',
    'can_select_project', 'can_edit_project',
    'can_read_project_documents', 'can_write_project_documents'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', routine)));
    -- These document helpers were not installed on every legacy database.
    -- Existing helpers must still be patched; the current project predicates
    -- are required, and document rows receive restrictive policies below.
    if definition is null and routine in ('can_read_project_documents', 'can_write_project_documents') then
      continue;
    end if;
    patched := regexp_replace(definition, '\mselect[[:space:]]+exists[[:space:]]*\(',
      'select public.can_access_indoor_project_branch(target_project_id) and exists (', 'i');
    if definition is null or patched = definition then
      raise exception 'Unexpected definition for branch predicate: %', routine;
    end if;
    execute patched;
  end loop;
end;
$predicates$;

-- Restrictive policies are ANDed with every older permissive policy. Creator,
-- owner, assignee, uploader and stale task ownership can never bypass the branch.
create policy indoor_branch_boundary on public.projects as restrictive for all to authenticated
using (
  not public.is_indoor_sales_user()
  or (branch in ('Karkh', 'Rasafa') and branch = (select public.current_indoor_sales_branch()))
)
with check (
  not public.is_indoor_sales_user()
  or (branch in ('Karkh', 'Rasafa') and branch = (select public.current_indoor_sales_branch()))
);

-- Include every existing table carrying project_id, including finance, workflow
-- history, appointments and old assignments. Optional document/contact ownership
-- is resolved separately below.
do $project_tables$
declare relation record;
begin
  for relation in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attname = 'project_id' and not a.attisdropped
      and c.relname not in ('documents', 'client_contacts')
  loop
    execute format(
      'create policy indoor_branch_boundary on public.%I as restrictive for all to authenticated
       using (public.can_access_indoor_project_branch(project_id))
       with check (public.can_access_indoor_project_branch(project_id))', relation.relname);
  end loop;
end;
$project_tables$;

create policy indoor_branch_boundary on public.clients as restrictive for select to authenticated
using (public.can_access_indoor_client_branch(id));
create policy indoor_branch_boundary on public.client_contacts as restrictive for all to authenticated
using (
  public.can_access_indoor_client_branch(client_id)
  and (project_id is null or public.can_access_indoor_project_branch(project_id))
)
with check (
  public.can_access_indoor_client_branch(client_id)
  and (project_id is null or public.can_access_indoor_project_branch(project_id))
);
create policy indoor_branch_boundary on public.documents as restrictive for all to authenticated
using (
  not public.is_indoor_sales_user()
  or (
    (project_id is null or public.can_access_indoor_project_branch(project_id))
    and (quotation_id is null or exists (select 1 from public.quotations q where q.id = documents.quotation_id))
    and (contract_id is null or exists (select 1 from public.contracts c where c.id = documents.contract_id))
    and (
      project_id is not null or quotation_id is not null or contract_id is not null
      or (client_id is not null and public.can_access_indoor_client_branch(client_id))
    )
  )
);

-- Indirect children must not inherit older unconditional role/owner access.
do $children$
declare child record; predicate text;
begin
  for child in select * from (values
    ('quotation_items', 'quotation_id', 'quotations'),
    ('quotation_versions', 'quotation_id', 'quotations'),
    ('quotation_version_items', 'quotation_version_id', 'quotation_versions'),
    ('measurement_visits', 'measurement_request_id', 'measurement_requests'),
    ('measurement_submissions', 'measurement_request_id', 'measurement_requests'),
    ('delivery_vehicles', 'delivery_assignment_id', 'delivery_assignments')
  ) as children(table_name, parent_column, parent_table)
  loop
    predicate := format(
      'not public.is_indoor_sales_user()
       or exists (select 1 from public.%I parent where parent.id = %I.%I)',
      child.parent_table, child.table_name, child.parent_column);
    execute format(
      'create policy indoor_branch_boundary on public.%I as restrictive for all to authenticated
       using (%s) with check (%s)', child.table_name, predicate, predicate);
  end loop;
end;
$children$;

-- This existing view otherwise executes its underlying reads as the view owner.
alter view public.delivery_vehicles_with_capacity set (security_invoker = true);
do $optional_view$
begin
  if to_regclass('public.project_stage_history_metrics') is not null then
    alter view public.project_stage_history_metrics set (security_invoker = true);
  end if;
end;
$optional_view$;

-- Notifications and audit rows can contain a complete project snapshot. Resolve
-- the supported entity references without depending on the caller's table grants.
create function public.can_access_indoor_entity_branch(entity_kind text, target_entity_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare target_project uuid; document_row public.documents;
begin
  if not public.is_indoor_sales_user() then return true; end if;
  case entity_kind
    when 'profile' then return true;
    when 'client' then return public.can_access_indoor_client_branch(target_entity_id);
    when 'project' then target_project := target_entity_id;
    when 'opening' then select project_id into target_project from public.openings where id = target_entity_id;
    when 'quotation' then select project_id into target_project from public.quotations where id = target_entity_id;
    when 'quotation_item' then
      select q.project_id into target_project from public.quotation_items i
        join public.quotations q on q.id = i.quotation_id where i.id = target_entity_id;
    when 'quotation_version' then
      select q.project_id into target_project from public.quotation_versions v
        join public.quotations q on q.id = v.quotation_id where v.id = target_entity_id;
    when 'contract' then select project_id into target_project from public.contracts where id = target_entity_id;
    when 'measurement_request' then select project_id into target_project from public.measurement_requests where id = target_entity_id;
    when 'follow_up_task' then select project_id into target_project from public.follow_up_tasks where id = target_entity_id;
    when 'appointment' then select project_id into target_project from public.appointments where id = target_entity_id;
    when 'document' then
      select * into document_row from public.documents where id = target_entity_id;
      if document_row.project_id is not null or document_row.quotation_id is not null or document_row.contract_id is not null then
        return
          (document_row.project_id is null or public.can_access_indoor_project_branch(document_row.project_id))
          and (document_row.quotation_id is null or public.can_access_indoor_project_branch(
            (select project_id from public.quotations where id = document_row.quotation_id)))
          and (document_row.contract_id is null or public.can_access_indoor_project_branch(
            (select project_id from public.contracts where id = document_row.contract_id)));
      end if;
      return public.can_access_indoor_client_branch(document_row.client_id);
    else return false;
  end case;
  return public.can_access_indoor_project_branch(target_project);
end;
$$;
revoke all on function public.can_access_indoor_entity_branch(text,uuid) from public, anon;
grant execute on function public.can_access_indoor_entity_branch(text,uuid) to authenticated, service_role;

do $events$
declare relation text;
begin
  foreach relation in array array['activity_logs', 'audit_events', 'notifications'] loop
    execute format(
      'create policy indoor_branch_boundary on public.%I as restrictive for select to authenticated
       using (public.can_access_indoor_entity_branch(entity_type::text, entity_id))', relation);
  end loop;
end;
$events$;

-- Prepend the guard to the installed function body, preserving all measurement,
-- quotation, role-mapping, validation and grant fixes from previous migrations.
do $rpcs$
declare routine record; definition text; patched text; guard text;
begin
  for routine in select * from (values
    ('advance_sales_flow', 'p_project', 'p_actor'),
    ('reactivate_client_project', 'p_project', 'p_actor'),
    ('reassign_sales_project_owner', 'target_project_id', 'actor_user_id'),
    ('transition_project_sales_status', 'target_project_id', 'actor_user_id'),
    ('create_measurement_request', 'target_project_id', 'actor_user_id'),
    ('create_sales_follow_up_task', 'target_project_id', 'actor_user_id'),
    ('assign_measurement_request', '(select project_id from public.measurement_requests where id = target_request_id)', 'actor_user_id'),
    ('advance_measurement_workflow', '(select project_id from public.measurement_requests where id = target_request_id)', 'actor_user_id'),
    ('claim_sales_follow_up_task', '(select project_id from public.follow_up_tasks where id = target_task_id)', 'actor_user_id'),
    ('record_sales_follow_up_activity', '(select project_id from public.follow_up_tasks where id = target_task_id)', 'actor_user_id'),
    ('update_sales_appointment_status', '(select project_id from public.appointments where id = target_appointment_id)', 'actor_user_id'),
    ('transition_quotation_version', '(select q.project_id from public.quotation_versions v join public.quotations q on q.id = v.quotation_id where v.id = target_version_id)', 'actor_user_id'),
    ('sign_contract_and_create_handoff', '(select project_id from public.contracts where id = target_contract_id)', 'actor_user_id'),
    ('save_quotation_version_with_items', 'p_project_id', 'p_created_by'),
    ('save_quotation_with_items', 'p_project_id', 'p_created_by'),
    ('sync_field_change', 'p_project', 'p_actor')
  ) as routines(name, project_expression, actor_expression)
  loop
    -- The old appointment-status RPC is absent on some deployed databases.
    -- Skip only its absence, never an existing or overloaded function.
    if routine.name = 'update_sales_appointment_status' and not exists (
      select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = routine.name
    ) then
      continue;
    end if;
    select pg_get_functiondef(p.oid) into strict definition
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = routine.name;
    guard := format('perform public.require_indoor_project_branch(%s, %s);',
      routine.project_expression, routine.actor_expression);
    if routine.name = 'sync_field_change' then
      -- A register retry may already have created a project in the old branch.
      -- Check before reading cached receipts as well as before normal mutations.
      guard := 'if p_action <> ''register'' or exists (select 1 from public.projects where id = p_project)
        or exists (select 1 from public.field_sync_receipts where operation_id = p_operation) then '
        || guard || ' end if;';
    elsif routine.name in ('save_quotation_with_items', 'save_quotation_version_with_items') then
      guard := guard || ' if p_quotation_id is not null then
        perform public.require_indoor_project_branch(
          (select q.project_id from public.quotations q where q.id = p_quotation_id), p_created_by);
        end if;';
    end if;
    patched := regexp_replace(definition, '(^|\n)[ \t]*begin[ \t]*(\r?\n|$)',
      E'\\1begin\n  ' || guard || E'\n', 'i');
    if patched = definition then raise exception 'Unexpected RPC definition: %', routine.name; end if;
    execute patched;
  end loop;
end;
$rpcs$;

notify pgrst, 'reload schema';
commit;
