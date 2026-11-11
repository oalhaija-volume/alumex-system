begin;

-- Governorates keeps its registered geography. Only its Indoor routing changes:
-- Karkh handles Governorates; actual Sales Manager and other roles retain access.
create or replace function public.can_access_indoor_project_branch(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or (
      public.current_indoor_sales_branch() is not null and exists (
        select 1 from public.projects p where p.id=target_project_id
          and (p.branch=public.current_indoor_sales_branch()
            or (p.branch='Governorates' and public.current_indoor_sales_branch()='Karkh'))
      )
    );
$$;

create or replace function public.can_access_indoor_client_branch(target_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_indoor_sales_user()
    or (
      public.current_indoor_sales_branch() is not null and (
        exists (
          select 1 from public.projects p where p.client_id=target_client_id
            and (p.branch=public.current_indoor_sales_branch()
              or (p.branch='Governorates' and public.current_indoor_sales_branch()='Karkh'))
        )
        or exists (
          select 1 from public.clients c where c.id=target_client_id
            and c.created_by=auth.uid()
            and not exists (select 1 from public.projects p where p.client_id=c.id)
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
  if auth.role()='authenticated' and actor_user_id is distinct from auth.uid() then
    raise exception using errcode='42501',message='The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id=actor_user_id for share;
  if actor.role::text='Indoor Sales' then
    select branch into project_branch from public.projects where id=target_project_id for update;
    if actor.is_active is not true or actor.status is distinct from 'Active'
      or actor.branch is null or actor.branch not in ('Karkh','Rasafa')
      or (project_branch is distinct from actor.branch
        and (actor.branch is distinct from 'Karkh' or project_branch is distinct from 'Governorates')) then
      raise exception using errcode='42501',message='Project is not available to this employee';
    end if;
  end if;
end;
$$;

alter policy indoor_branch_boundary on public.projects
using (
  not public.is_indoor_sales_user()
  or (
    (select public.current_indoor_sales_branch()) is not null
    and (branch=(select public.current_indoor_sales_branch())
      or (branch='Governorates' and (select public.current_indoor_sales_branch())='Karkh'))
  )
)
with check (
  not public.is_indoor_sales_user()
  or (
    (select public.current_indoor_sales_branch()) is not null
    and (branch=(select public.current_indoor_sales_branch())
      or (branch='Governorates' and (select public.current_indoor_sales_branch())='Karkh'))
  )
);

-- Child/document/entity policies already resolve through the helpers above.
-- Existing Rasafa notifications, unread counts and audit/activity payloads are
-- hidden immediately by their restrictive SELECT policies, without deletion.
create or replace function public.sales_notification_recipients(target_project uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with project as (select * from public.projects where id=target_project),
  eligible as (
    select u.id from public.profiles u cross join project p
    where u.is_active and u.status='Active'
      and (u.role::text='Sales Manager'
        or (u.role::text='Indoor Sales' and u.branch in ('Karkh','Rasafa')
          and (p.branch=u.branch or (p.branch='Governorates' and u.branch='Karkh'))))
  )
  select e.id from eligible e cross join project p
  where e.id=p.follow_up_owner_id
    or not exists (select 1 from eligible owner where owner.id=p.follow_up_owner_id);
$$;

-- Preserve normal ownership, deduplication and retirement logic. Governorates
-- with a now-ineligible stored owner falls back to its eligible branch team;
-- neither ownership nor historical follow-up information is overwritten.
do $due_notifications$
declare
  definition text;
  previous_guard text := 'employee.branch in (''Karkh'',''Rasafa'') and p.branch in (employee.branch, ''Governorates'')';
  replacement_guard text := 'employee.branch in (''Karkh'',''Rasafa'') and (p.branch=employee.branch or (p.branch=''Governorates'' and employee.branch=''Karkh''))';
  previous_owner text := '(p.follow_up_owner_id = employee.id or (p.follow_up_owner_id is null and p.created_by = employee.id))';
  replacement_owner text := $owner$(p.follow_up_owner_id = employee.id
      or (p.follow_up_owner_id is null and p.created_by = employee.id)
      or (p.branch='Governorates' and p.follow_up_owner_id is not null
        and employee.id in (select public.sales_notification_recipients(p.id))))$owner$;
begin
  select pg_get_functiondef('public.deliver_due_follow_up_notifications()'::regprocedure) into definition;
  if cardinality(string_to_array(definition,replacement_guard))=3
    and position(previous_guard in definition)=0
    and cardinality(string_to_array(definition,replacement_owner))=3
    and position(previous_owner in definition)=0 then return; end if;
  if cardinality(string_to_array(definition,previous_guard))<>3
    or cardinality(string_to_array(definition,previous_owner))<>3
    or position('employee.role::text <> ''Indoor Sales''' in definition)=0
    or position('on conflict (recipient_id, deduplication_key)' in definition)=0 then
    raise exception 'Unexpected due notification definition; Karkh-only Governorates routing was not applied.';
  end if;
  execute replace(replace(definition,previous_guard,replacement_guard),previous_owner,replacement_owner);
end;
$due_notifications$;

-- Prevent a new hidden/inoperable owner through any write path. Existing stale
-- ownership is left intact for an explicit, audited reassignment; profile moves
-- still revoke access immediately through the helpers, not project relabeling.
create or replace function public.require_governorate_follow_up_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner public.profiles;
begin
  if new.branch is distinct from 'Governorates' or new.follow_up_owner_id is null then return new; end if;
  if tg_op='UPDATE' and new.follow_up_owner_id is not distinct from old.follow_up_owner_id
    and new.branch is not distinct from old.branch then return new; end if;
  select * into owner from public.profiles where id=new.follow_up_owner_id for share;
  if owner.role::text='Indoor Sales' and owner.branch is distinct from 'Karkh' then
    raise exception using errcode='42501',message='Governorates follow-up must be assigned to Karkh Indoor Sales or a Sales Manager.';
  end if;
  return new;
end;
$$;
revoke all on function public.require_governorate_follow_up_owner() from public,anon,authenticated;
create or replace trigger projects_governorate_follow_up_owner
before insert or update of follow_up_owner_id,branch on public.projects
for each row execute function public.require_governorate_follow_up_owner();

revoke all on function public.can_access_indoor_project_branch(uuid) from public,anon;
grant execute on function public.can_access_indoor_project_branch(uuid) to authenticated,service_role;
revoke all on function public.can_access_indoor_client_branch(uuid) from public,anon;
grant execute on function public.can_access_indoor_client_branch(uuid) to authenticated,service_role;
revoke all on function public.require_indoor_project_branch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_indoor_project_branch(uuid,uuid) to service_role;
revoke all on function public.sales_notification_recipients(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
