begin;

-- Preserve the employee who originally won a pre-system project independently
-- of the employee entering it, collecting measurements, or following it up.
-- Existing projects keep null; no historical creator or timestamp is rewritten.
alter table public.projects
  add column if not exists legacy_outdoor_sales_id uuid
  references public.profiles(id) on delete restrict;
create index if not exists projects_legacy_outdoor_sales_idx
  on public.projects(legacy_outdoor_sales_id)
  where legacy_outdoor_sales_id is not null;
comment on column public.projects.legacy_outdoor_sales_id is
  'Immutable original Outdoor Sales owner/credit for a pre-system project registered by Indoor Sales, Sales Manager or Admin. Separate from created_by and measurement assignment.';

-- Browser table writes cannot bypass intake validation. Credit is selected only
-- at creation through the server registration transaction and then never changes,
-- including when the operational owner or measurement employee is reassigned.
create or replace function public.protect_legacy_outdoor_sales_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  creator public.profiles;
begin
  if tg_op = 'UPDATE' then
    if new.legacy_outdoor_sales_id is distinct from old.legacy_outdoor_sales_id then
      raise exception using errcode = '42501', message = 'The original Outdoor Sales credit cannot be changed.';
    end if;
    return new;
  end if;
  if new.legacy_outdoor_sales_id is null then return new; end if;
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception using errcode = '42501', message = 'Use project registration to assign original Outdoor Sales credit.';
  end if;
  select * into creator from public.profiles where id = new.created_by for share;
  if creator.is_active is not true or creator.status is distinct from 'Active'
    or public.sales_permission_role(creator.role) not in ('Indoor Sales', 'Admin') then
    raise exception using errcode = '42501', message = 'Only Indoor Sales, Sales Manager or Admin can register an older Outdoor Sales project.';
  end if;
  perform 1 from public.profiles where id = new.legacy_outdoor_sales_id
    and role = 'Outdoor Sales' and is_active = true and status = 'Active' for share;
  if not found then
    raise exception using errcode = '22023', message = 'Choose an active Outdoor Sales employee as the original project owner.';
  end if;
  new.owner_id := new.legacy_outdoor_sales_id;
  new.sales_engineer_id := new.legacy_outdoor_sales_id;
  new.responsible_user_id := new.created_by;
  return new;
end;
$$;
revoke all on function public.protect_legacy_outdoor_sales_credit() from public, anon, authenticated;
create or replace trigger projects_validate_legacy_outdoor_sales_credit
before insert or update of legacy_outdoor_sales_id on public.projects
for each row execute function public.protect_legacy_outdoor_sales_credit();

-- Storing the original sales owner must not itself create a measurement task or
-- a new write permission. Existing explicit assignments still use their normal
-- permissions, and every existing role/branch/commercial guard remains in force.
create or replace function public.can_write_with_legacy_outdoor_credit(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.projects project
    where project.id = target_project_id
      and project.legacy_outdoor_sales_id = auth.uid()
      and public.current_user_role() = 'Outdoor Sales'
      and project.created_by is distinct from auth.uid()
      and project.original_creator_id is distinct from auth.uid()
      and project.assigned_outdoor_sales_id is distinct from auth.uid()
      and not exists (
        select 1 from public.project_assignments assignment
        where assignment.project_id = project.id and assignment.assignee_id = auth.uid()
          and assignment.ended_at is null
      )
  );
$$;
revoke all on function public.can_write_with_legacy_outdoor_credit(uuid) from public, anon;
grant execute on function public.can_write_with_legacy_outdoor_credit(uuid) to authenticated, service_role;

do $write_permissions$
declare
  routine text;
  definition text;
  marker text := 'select public.can_access_indoor_project_branch(target_project_id) and exists (';
begin
  foreach routine in array array['can_manage_sales_project','can_edit_project','can_write_project_documents'] loop
    definition := pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', routine)));
    -- The legacy document helper is optional on installations without that module.
    if definition is null and routine = 'can_write_project_documents' then continue; end if;
    if position('public.can_write_with_legacy_outdoor_credit(' in definition) > 0 then continue; end if;
    if definition is null or position(marker in definition) = 0 then
      raise exception 'Unexpected legacy credit write permission definition: %', routine;
    end if;
    definition := replace(definition, marker,
      'select public.can_write_with_legacy_outdoor_credit(target_project_id) and public.can_access_indoor_project_branch(target_project_id) and exists (');
    execute definition;
  end loop;
end;
$write_permissions$;

-- Patch the installed transaction rather than replacing newer measurement,
-- branch/rotation, role and offline receipt protections. The original actor and
-- source remain the employee/channel that actually entered the project.
do $registration$
declare
  definition text;
  declaration_marker text := 'declare actor_role text;';
  register_marker text := 'if p_action=''register'' then';
  columns_marker text := 'assigned_outdoor_sales_id,readiness_note,building_type,branch,governorate)';
  values_marker text := 'case when actor_role=''Outdoor Sales'' and p_payload#>>''{project,branch}''=''Governorates'' then p_payload#>>''{project,governorate}'' else null end);';
  owners_marker text := '''Draft'',''new_lead'',p_actor,p_actor,p_actor,p_actor,actor_role::public.app_role';
  result_marker text := '''branch'',branch,';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position('legacy_outdoor_sales_id' in definition) > 0 then
    if position('legacyOutdoorSalesOwner' in definition) = 0
      or position('legacyOutdoorSalesId' in definition) = 0 then
      raise exception 'Unexpected partial legacy Outdoor Sales registration migration.';
    end if;
    return;
  end if;
  if position(declaration_marker in definition) = 0 or position(register_marker in definition) = 0
    or position(columns_marker in definition) = 0 or position(values_marker in definition) = 0
    or position(owners_marker in definition) = 0 or position(result_marker in definition) = 0
    or position('require_indoor_project_branch' in definition) = 0
    or position('require_outdoor_project_creation_branch' in definition) = 0
    or position('return saved.result;' in definition) = 0
    or position('public.sales_permission_role(' in definition) = 0 then
    raise exception 'Unexpected sync registration definition; legacy Outdoor Sales credit migration was not applied.';
  end if;
  definition := replace(definition, declaration_marker,
    declaration_marker || ' legacy_outdoor_sales uuid;');
  definition := replace(definition, register_marker, register_marker || $validation$
  if p_payload#>'{project,legacyOutdoorSalesId}' is not null
    and p_payload#>'{project,legacyOutdoorSalesId}' <> 'null'::jsonb then
    if public.sales_permission_role(actor_role::public.app_role) not in ('Indoor Sales','Admin') then
      raise exception using errcode='42501',message='Only Indoor Sales, Sales Manager or Admin can register an older Outdoor Sales project.';
    end if;
    if jsonb_typeof(p_payload#>'{project,legacyOutdoorSalesId}') is distinct from 'string'
      or p_payload#>>'{project,legacyOutdoorSalesId}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='Choose an active Outdoor Sales employee as the original project owner.';
    end if;
    select id into legacy_outdoor_sales from public.profiles
      where id=(p_payload#>>'{project,legacyOutdoorSalesId}')::uuid
        and role='Outdoor Sales' and is_active=true and status='Active' for share;
    if not found then
      raise exception using errcode='22023',message='Choose an active Outdoor Sales employee as the original project owner.';
    end if;
  end if;$validation$);
  definition := replace(definition, columns_marker,
    'assigned_outdoor_sales_id,readiness_note,building_type,branch,governorate,legacy_outdoor_sales_id)');
  definition := replace(definition, values_marker,
    'case when actor_role=''Outdoor Sales'' and p_payload#>>''{project,branch}''=''Governorates'' then p_payload#>>''{project,governorate}'' else null end,legacy_outdoor_sales);');
  definition := replace(definition, owners_marker,
    '''Draft'',''new_lead'',p_actor,coalesce(legacy_outdoor_sales,p_actor),coalesce(legacy_outdoor_sales,p_actor),p_actor,actor_role::public.app_role');
  definition := replace(definition, result_marker,
    '''legacy_outdoor_sales_id'',legacy_outdoor_sales_id,''legacyOutdoorSalesOwner'',(select coalesce(full_name,username,''Employee'') from profiles where id=projects.legacy_outdoor_sales_id),' || result_marker);
  execute definition;
end;
$registration$;

notify pgrst, 'reload schema';
commit;
