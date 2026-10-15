-- Apply after the Company Owner enum migration has committed.
begin;

create or replace function public.can_view_sales_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.archived_at is null
      and public.is_active_user()
      and (
        public.current_user_role()::text in (
          'Admin',
          'Sales Director',
          'CEO', 'Company Owner',
          'Sales Manager',
          'Branch Manager',
          'Indoor Sales'
        )
        or project.created_by = auth.uid()
        or project.original_creator_id = auth.uid()
        or project.owner_id = auth.uid()
        or project.responsible_user_id = auth.uid()
        or exists (
          select 1
          from public.project_assignments assignment
          where assignment.project_id = project.id
            and assignment.assignee_id = auth.uid()
            and assignment.ended_at is null
        )
      )
  )
$$;

create or replace function public.can_manage_sales_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.archived_at is null
      and public.is_active_user()
      and (
        public.current_user_role()::text in ('Admin', 'Sales Director', 'CEO', 'Company Owner', 'Sales Manager')
        or project.owner_id = auth.uid()
        or project.responsible_user_id = auth.uid()
        or (
          public.current_user_role() = 'Outdoor Sales'
          and (
            project.original_creator_id = auth.uid()
            or exists (
              select 1
              from public.project_assignments assignment
              where assignment.project_id = project.id
                and assignment.assignee_id = auth.uid()
                and assignment.ended_at is null
            )
          )
        )
      )
  )
$$;

create or replace function public.advance_sales_flow(p_project uuid,p_action text,p_revision integer,p_payload jsonb,p_actor uuid)
returns public.sales_workflows language plpgsql security definer set search_path=public as $$
declare f public.sales_workflows; project public.projects; actor_role text; line jsonb; opening jsonb; existing public.openings; quote_version integer;
begin
 select role::text into actor_role from profiles where id=p_actor and is_active=true and status='Active';
 if actor_role is null then raise exception 'Inactive employee'; end if;
 select * into project from projects where id=p_project for update;
 if not found then raise exception 'Project not found'; end if;
 if p_action='accept' then
  if actor_role not in ('Admin','CEO','Company Owner','Operations Manager') then raise exception 'Not allowed'; end if;
 else
  if actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales','Outdoor Sales') or (actor_role not in ('Admin','Sales Director','CEO','Company Owner','Indoor Sales') and project.created_by is distinct from p_actor and not (actor_role='Outdoor Sales' and project.assigned_outdoor_sales_id is not distinct from p_actor) and not (actor_role='Indoor Sales' and project.follow_up_owner_id is not distinct from p_actor)) then raise exception 'Not allowed'; end if;
 end if;
 select * into f from sales_workflows where project_id=p_project for update;
 if coalesce(f.revision,0) <> p_revision then raise exception 'This project changed. Reload before continuing.'; end if;
 if p_action='save' then
  if f.signed_at is not null or (f.stage is not null and f.stage not in ('quotation','approved','contract')) then raise exception 'Signed contracts cannot be changed.'; end if;
  if project.sales_status::text not in ('ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated') then raise exception 'Complete measurements first.'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or coalesce(jsonb_array_length(p_payload->'lines'),0) < 1 or coalesce((p_payload->>'total')::numeric,0) <= 0 then raise exception 'Incomplete quotation'; end if;
  if (select count(distinct x#>>'{opening,id}') from jsonb_array_elements(p_payload->'lines') x) <> jsonb_array_length(p_payload->'lines') then raise exception 'Duplicate opening'; end if;
  -- Recheck the measured set under the project lock, including changes since API pricing.
  if exists(select 1 from openings o where o.project_id=p_project and not exists(select 1 from jsonb_array_elements(p_payload->'lines') x where x#>>'{opening,id}'=o.id::text)) then raise exception 'Measurements changed. Reload the quotation.'; end if;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   if coalesce(opening->>'floor','')='' or length(opening->>'floor')>100 or coalesce(opening->>'room','')='' or length(opening->>'room')>100
     or coalesce((opening->>'width')::numeric,0) not between 0.01 and 100000 or coalesce((opening->>'height')::numeric,0) not between 0.01 and 100000
     or coalesce(opening->>'opening_type','') not in ('Window','Door','Louver','Curtain Wall','Skylight')
     or (opening->>'opening_type' in ('Window','Door') and coalesce(opening->>'opening_direction','') not in ('Sliding','Hinged'))
     or (opening->>'opening_type'='Louver' and opening->>'opening_direction' is distinct from 'Hinged')
     or (opening->>'opening_type' in ('Curtain Wall','Skylight') and opening->>'opening_direction' is not null)
     then raise exception 'Incomplete opening measurements'; end if;
   select * into existing from openings where id=(opening->>'id')::uuid;
   if found and (existing.project_id is distinct from p_project or
     not opening @> jsonb_build_object('floor',existing.floor,'room',existing.room,'width',existing.width,'height',existing.height,'opening_type',existing.opening_type,'opening_direction',existing.opening_direction))
     then raise exception 'Measurements changed. Reload the quotation.'; end if;
  end loop;
  quote_version=coalesce((f.quotation->>'version')::integer,case when f.project_id is null then 0 else 1 end)+1;
  if f.project_id is not null then
   insert into quotation_revisions(project_id,version,workflow_revision,quotation,contract,previous_stage,approved_by,approved_at,superseded_by)
   values(p_project,quote_version-1,f.revision,f.quotation,f.contract,f.stage,f.approved_by,f.approved_at,p_actor);
  end if;
  p_payload=p_payload || jsonb_build_object('version',quote_version,'preparedBy',p_actor,'createdAt',now());
  insert into sales_workflows(project_id,revision,stage,quotation) values(p_project,p_revision+1,'quotation',p_payload)
  on conflict(project_id) do update set revision=p_revision+1,stage='quotation',quotation=p_payload,approved_by=null,approved_at=null,contract=null,evidence=null,updated_at=now();
  update projects set sales_status='quotation_in_progress',status='Quotation' where id=p_project;
  -- Insert only after the authoritative snapshot exists; the trigger below permits
  -- these exact new measurements and rejects changes to any existing opening.
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   opening=line->'opening';
   if not exists(select 1 from openings where id=(opening->>'id')::uuid) then
    insert into openings(id,project_id,opening_code,floor,room,width,height,quantity,opening_type,opening_direction,site_readiness,created_by)
    values((opening->>'id')::uuid,p_project,'OP-'||(opening->>'id'),opening->>'floor',opening->>'room',(opening->>'width')::numeric,(opening->>'height')::numeric,1,opening->>'opening_type',opening->>'opening_direction','ready',p_actor);
   end if;
  end loop;
 elsif p_action='approve' then
  if f.stage <> 'quotation' or f.stage is null then raise exception 'Save a quotation first'; end if;
  update sales_workflows set stage='approved',revision=revision+1,approved_by=p_actor,approved_at=now(),updated_at=now() where project_id=p_project;
  update projects set sales_status='quotation_approved' where id=p_project;
 elsif p_action='contract' then
  if f.stage <> 'approved' or f.stage is null then raise exception 'Client approval is required'; end if;
  update sales_workflows set stage='contract',revision=revision+1,contract=p_payload || jsonb_build_object('quotation',f.quotation,'approvedAt',f.approved_at),updated_at=now() where project_id=p_project;
  update projects set sales_status='contract_generated',status='Contract' where id=p_project;
 elsif p_action='sign' then
  if f.stage <> 'contract' or f.stage is null then raise exception 'Generate the contract first'; end if;
  if coalesce(p_payload->>'signer','')='' or coalesce(p_payload->>'method','') not in ('digital','upload') then raise exception 'Signed evidence required'; end if;
  if p_payload->>'method'='digital' and coalesce(p_payload->>'signature','')='' then raise exception 'Signature required'; end if;
  if p_payload->>'method'='upload' and coalesce(p_payload->>'path','')='' then raise exception 'Signed document required'; end if;
  update sales_workflows set stage='signed',revision=revision+1,evidence=p_payload || jsonb_build_object('recordedBy',p_actor),signed_at=now(),updated_at=now() where project_id=p_project;
  update projects set sales_status='transferred_to_operations',status='Contract' where id=p_project;
 elsif p_action='accept' then
  if f.stage <> 'signed' or f.signed_at is null then raise exception 'A signed contract is required'; end if;
  update sales_workflows set stage='operations',revision=revision+1,accepted_by=p_actor,accepted_at=now(),updated_at=now() where project_id=p_project;
  update projects set status='Production' where id=p_project;
 else raise exception 'Unknown action'; end if;
 select * into f from sales_workflows where project_id=p_project;
 return f;
end $$;
revoke all on function public.advance_sales_flow(uuid,text,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.advance_sales_flow(uuid,text,integer,jsonb,uuid) to service_role;

create or replace function public.update_employee_profile(
  p_actor uuid,
  p_employee uuid,
  p_expected_updated_at timestamptz,
  p_full_name text,
  p_username text,
  p_role text,
  p_is_active boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  employee public.profiles;
  actor_is_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('alumex-employee-management', 0));
  select * into actor from profiles where id = p_actor for update;
  actor_is_admin := actor.role::text = 'Admin' or lower(actor.email) = 'admin@alumex.com';
  if actor.id is null or actor.is_active is not true or actor.status is distinct from 'Active'
     or not (actor_is_admin or actor.role::text = 'HR') then
    raise exception using errcode = '42501', message = 'Employee management access is required.';
  end if;

  select * into employee from profiles where id = p_employee for update;
  if employee.id is null then
    raise exception using errcode = 'P0002', message = 'Employee not found.';
  end if;
  if not actor_is_admin and (employee.role::text in ('Admin','Company Owner') or lower(employee.email) = 'admin@alumex.com' or p_role in ('Admin','Company Owner')) then
    raise exception using errcode = '42501', message = 'Only Admin can edit Admin or Company Owner accounts or assign these roles.';
  end if;
  if p_expected_updated_at is null or employee.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'This employee was changed by someone else. Reload the employee list and try again.';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 150
     or p_username is null or p_username !~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
     or p_is_active is null or p_role is null then
    raise exception using errcode = '22023', message = 'Enter a valid employee name, username, role and status.';
  end if;
  -- Existing legacy roles may be retained while editing name or username.
  if p_role is distinct from employee.role::text and p_role not in
     ('Admin','HR','Sales Director','CEO','Company Owner','Indoor Sales','Outdoor Sales','Operations Manager','Project Manager') then
    raise exception using errcode = '22023', message = 'Choose a supported employee role.';
  end if;
  if p_actor = p_employee and (p_role is distinct from employee.role::text or p_is_active is not true) then
    raise exception using errcode = '42501', message = 'You cannot change your own role or deactivate your account.';
  end if;
  if lower(employee.email) = 'admin@alumex.com' and (p_role <> 'Admin' or p_is_active is not true) then
    raise exception using errcode = '42501', message = 'The primary Admin account must remain active with the Admin role.';
  end if;
  if employee.role::text = 'Admin' and employee.is_active and
     (p_role <> 'Admin' or not p_is_active) and not exists (
       select 1 from profiles where id <> p_employee and is_active and status = 'Active'
       and (role::text = 'Admin' or lower(email) = 'admin@alumex.com')
     ) then
    raise exception using errcode = '42501', message = 'At least one active Admin account is required.';
  end if;
  if p_role is distinct from employee.role::text and p_role in ('Operations Manager','Project Manager') then
    if public.commercial_privacy_ready() is not true then
      raise exception using errcode = '22023', message = 'The commercial privacy database update is required.';
    end if;
  end if;
  if p_role is distinct from employee.role::text and p_role in ('Sales Director','CEO') then
    if public.sales_leadership_ready() is not true then
      raise exception using errcode = '22023', message = 'The sales leadership database update is required.';
    end if;
  end if;

  update profiles set full_name = trim(p_full_name), username = p_username,
    role = p_role::public.app_role, is_active = p_is_active,
    status = case when p_is_active then 'Active' else 'Inactive' end
  where id = p_employee returning * into employee;
  return jsonb_build_object('id',employee.id,'email',employee.email,
    'full_name',employee.full_name,'username',employee.username,'role',employee.role,
    'is_active',employee.is_active,'status',employee.status,'updated_at',employee.updated_at);
end;
$$;
revoke all on function public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean) to service_role;

-- Owner has the same direct sales visibility as the other company leaders.
create policy company_owner_clients_select on public.clients for select to authenticated
using (public.is_active_user() and public.current_user_role()::text = 'Company Owner');
create policy company_owner_quotations_select on public.quotations for select to authenticated
using (public.current_user_role()::text = 'Company Owner' and public.can_view_sales_project(project_id));
create policy company_owner_quotation_items_select on public.quotation_items for select to authenticated
using (public.current_user_role()::text = 'Company Owner' and exists (
 select 1 from public.quotations q where q.id=quotation_id and public.can_view_sales_project(q.project_id)
));
create policy company_owner_contracts_select on public.contracts for select to authenticated
using (public.current_user_role()::text = 'Company Owner' and public.can_view_sales_project(project_id));
create or replace function public.company_owner_ready() returns boolean
language sql stable security definer set search_path=public as $$ select true $$;
revoke all on function public.company_owner_ready() from public,anon,authenticated;
grant execute on function public.company_owner_ready() to service_role;

notify pgrst, 'reload schema';
commit;
