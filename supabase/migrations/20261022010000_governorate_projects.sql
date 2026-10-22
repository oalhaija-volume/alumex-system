begin;

-- Governorates is a project routing choice shared by both Indoor teams. It is
-- never an employee branch; existing profile constraints remain unchanged.
alter table public.projects add column governorate text;
alter table public.projects drop constraint projects_branch_check;
alter table public.projects add constraint projects_branch_check
  check (branch is null or branch in ('Karkh', 'Rasafa', 'Governorates'));
alter table public.projects add constraint projects_governorate_check check (
  (branch is not distinct from 'Governorates' and governorate is not null and governorate in (
    'البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء',
    'النجف','الديوانية','الكوت','العمارة','الناصرية','السماوة'
  ))
  or (branch is distinct from 'Governorates' and governorate is null)
);

-- Preserve the installed Sales Manager mapping and immutable Indoor origin.
-- A registration location cannot later be changed into/out of shared access.
do $project_trigger$
declare
  definition text;
  update_marker text := 'if tg_op = ''UPDATE'' then';
  branch_marker text := 'new.branch := creator.branch;';
begin
  select pg_get_functiondef('public.assign_indoor_project_branch()'::regprocedure) into definition;
  if position(update_marker in definition) = 0 or position(branch_marker in definition) = 0 then
    raise exception 'Unexpected project branch trigger; governorate migration was not applied.';
  end if;
  definition := replace(definition, update_marker, update_marker || $guard$
    if (old.branch = 'Governorates' or new.branch = 'Governorates')
      and row(new.branch,new.governorate) is distinct from row(old.branch,old.governorate) then
      raise exception using errcode = '42501', message = 'The registered governorate cannot be changed.';
    end if;$guard$);
  definition := replace(definition, branch_marker, branch_marker || E'\n    new.governorate := null;');
  execute definition;
end;
$project_trigger$;
create or replace trigger projects_assign_indoor_branch
before insert or update of branch, governorate on public.projects
for each row execute function public.assign_indoor_project_branch();

-- Online intake delegates to this same transaction. Patch the installed body
-- so branch guards, idempotency, visit outcomes and measurement rules survive.
do $registration$
declare
  definition text;
  branch_check text := 'p_payload#>>''{project,branch}'' not in (''Karkh'',''Rasafa'')';
  validation_marker text := ') then raise exception using errcode=''22023'',message=''Choose the project branch: Karkh or Rasafa.''; end if;';
  columns_marker text := 'assigned_outdoor_sales_id,readiness_note,building_type,branch)';
  values_marker text := 'case when actor_role=''Outdoor Sales'' then p_payload#>>''{project,branch}'' else null end);';
  result_marker text := '''branch'',branch,';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position(branch_check in definition) = 0 or position(validation_marker in definition) = 0
    or position(columns_marker in definition) = 0 or position(values_marker in definition) = 0
    or position(result_marker in definition) = 0
    or position('require_indoor_project_branch' in definition) = 0
    or position('measurement_delay_reason' in definition) = 0 then
    raise exception 'Unexpected sync registration definition; governorate migration was not applied.';
  end if;
  definition := replace(definition, branch_check,
    'p_payload#>>''{project,branch}'' not in (''Karkh'',''Rasafa'',''Governorates'')');
  definition := replace(definition, validation_marker, $validation$
  ) then raise exception using errcode='22023',message='Choose the project branch: Karkh, Rasafa or Governorates.'; end if;
  if actor_role='Outdoor Sales' then
   if p_payload#>>'{project,branch}'='Governorates' then
    if jsonb_typeof(p_payload#>'{project,governorate}') is distinct from 'string'
      or p_payload#>>'{project,governorate}' not in (
       'البصرة','الرمادي','صلاح الدين','ديالى','الحلة','كربلاء',
       'النجف','الديوانية','الكوت','العمارة','الناصرية','السماوة'
      ) then raise exception using errcode='22023',message='Choose the project governorate.'; end if;
   elsif p_payload#>'{project,governorate}' is not null
     and p_payload#>'{project,governorate}' <> 'null'::jsonb then
    raise exception using errcode='22023',message='Choose Governorates before selecting a governorate.';
   end if;
  end if;$validation$);
  definition := replace(definition, columns_marker,
    'assigned_outdoor_sales_id,readiness_note,building_type,branch,governorate)');
  definition := replace(definition, values_marker,
    'case when actor_role=''Outdoor Sales'' then p_payload#>>''{project,branch}'' else null end,case when actor_role=''Outdoor Sales'' and p_payload#>>''{project,branch}''=''Governorates'' then p_payload#>>''{project,governorate}'' else null end);');
  definition := replace(definition, result_marker, '''branch'',branch,''governorate'',governorate,');
  execute definition;
end;
$registration$;

-- Existing project/child/document policies and RPC guards call these helpers.
-- Missing employee branches and legacy unmarked projects still fail closed.
create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or (
      public.current_indoor_sales_branch() is not null and exists (
        select 1 from public.projects p where p.id = target_project_id
          and p.branch in (public.current_indoor_sales_branch(), 'Governorates')
      )
    );
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or (
      public.current_indoor_sales_branch() is not null and (
        exists (
          select 1 from public.projects p where p.client_id = target_client_id
            and p.branch in (public.current_indoor_sales_branch(), 'Governorates')
        )
        or exists (
          select 1 from public.clients c where c.id = target_client_id
            and c.created_by = auth.uid()
            and not exists (select 1 from public.projects p where p.client_id = c.id)
        )
      )
    );
$$;

create or replace function public.require_indoor_project_branch(target_project_id uuid, actor_user_id uuid)
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
      or (project_branch is distinct from actor.branch and project_branch is distinct from 'Governorates') then
      raise exception using errcode = '42501', message = 'Project is not available to this employee';
    end if;
  end if;
end;
$$;

alter policy indoor_branch_boundary on public.projects
using (
  not public.is_indoor_sales_user()
  or (
    (select public.current_indoor_sales_branch()) is not null
    and branch in ((select public.current_indoor_sales_branch()), 'Governorates')
  )
)
with check (
  not public.is_indoor_sales_user()
  or (
    (select public.current_indoor_sales_branch()) is not null
    and branch in ((select public.current_indoor_sales_branch()), 'Governorates')
  )
);

-- Some installed databases retain an older opening-read policy based on
-- creator/manager access. Add only shared-project reads for assigned Indoor
-- employees; private-project reads and every write policy stay unchanged.
create policy governorate_openings_indoor_read on public.openings
for select to authenticated
using (
  public.is_indoor_sales_user()
  and (select public.current_indoor_sales_branch()) is not null
  and public.can_view_sales_project(project_id)
  and exists (
    select 1 from public.projects p
    where p.id = openings.project_id and p.branch = 'Governorates'
  )
);

-- Shared unclaimed intake reaches both branch teams. Once claimed, existing
-- ownership rules still notify only the eligible selected owner.
create or replace function public.sales_notification_recipients(target_project uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with project as (select * from public.projects where id = target_project),
  eligible as (
    select u.id from public.profiles u cross join project p
    where u.is_active and u.status = 'Active'
      and (u.role::text = 'Sales Manager'
        or (u.role::text = 'Indoor Sales' and u.branch in ('Karkh', 'Rasafa')
          and p.branch in (u.branch, 'Governorates')))
  )
  select e.id from eligible e cross join project p
  where e.id = p.follow_up_owner_id
    or not exists (select 1 from eligible owner where owner.id = p.follow_up_owner_id);
$$;

do $due_notifications$
declare
  definition text;
  branch_marker text := 'employee.branch in (''Karkh'',''Rasafa'') and employee.branch = p.branch';
begin
  select pg_get_functiondef('public.deliver_due_follow_up_notifications()'::regprocedure) into definition;
  if (length(definition) - length(replace(definition, branch_marker, ''))) / length(branch_marker) <> 2 then
    raise exception 'Unexpected due notification branch guards; governorate migration was not applied.';
  end if;
  definition := replace(definition, branch_marker,
    'employee.branch in (''Karkh'',''Rasafa'') and p.branch in (employee.branch, ''Governorates'')');
  execute definition;
end;
$due_notifications$;

-- CREATE OR REPLACE preserves installed grants; restate the security boundary.
revoke all on function public.can_access_indoor_project_branch(uuid) from public, anon;
grant execute on function public.can_access_indoor_project_branch(uuid) to authenticated, service_role;
revoke all on function public.can_access_indoor_client_branch(uuid) from public, anon;
grant execute on function public.can_access_indoor_client_branch(uuid) to authenticated, service_role;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;
revoke all on function public.sales_notification_recipients(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
