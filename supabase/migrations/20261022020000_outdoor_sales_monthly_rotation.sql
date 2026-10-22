begin;

-- The first-half assignment is separate from the permanent Indoor branch.
-- Outdoor profiles retain branch = null and existing project origins stay put.
alter table public.profiles add column outdoor_rotation_start_branch text
  constraint profiles_outdoor_rotation_start_branch_check
  check (outdoor_rotation_start_branch in ('Karkh', 'Rasafa'));

create function public.protect_outdoor_sales_rotation()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.outdoor_rotation_start_branch is not null)
    or (tg_op = 'UPDATE' and new.outdoor_rotation_start_branch is distinct from old.outdoor_rotation_start_branch) then
    if coalesce(auth.role(), '') in ('anon', 'authenticated')
      and not coalesce(public.is_active_user() and public.current_user_role()::text = 'Admin', false) then
      raise exception using errcode = '42501', message = 'Only Admin can assign Outdoor Sales rotations.';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_outdoor_rotation
before insert or update of outdoor_rotation_start_branch on public.profiles
for each row execute function public.protect_outdoor_sales_rotation();

-- Match only the verified unique employee usernames. Authorization below uses
-- the stored assignment, so later display-name/username edits cannot change it.
update public.profiles set outdoor_rotation_start_branch = case
  when username in ('mohd', 'aliammar') then 'Karkh'
  else 'Rasafa'
end
where role::text = 'Outdoor Sales' and username in ('mohd', 'aliammar', 'ehab', 'sajjad');

-- A pure calendar helper permits deterministic month-boundary verification.
-- Creation guards supply the server time; clients cannot choose an effective date.
create function public.outdoor_sales_branch_for_date(start_branch text, at_time timestamptz)
returns text language sql immutable strict set search_path = public as $$
  select case
    when start_branch not in ('Karkh', 'Rasafa') or not isfinite(at_time) then null
    when extract(day from at_time at time zone 'Asia/Baghdad') <= 15 then start_branch
    when start_branch = 'Karkh' then 'Rasafa'
    else 'Karkh'
  end;
$$;
revoke all on function public.outdoor_sales_branch_for_date(text,timestamptz) from public, anon, authenticated;
grant execute on function public.outdoor_sales_branch_for_date(text,timestamptz) to service_role;

create function public.require_outdoor_project_creation_branch(actor_user_id uuid, selected_branch text)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  allowed_branch text;
begin
  -- Some legacy installations still have a permissive project-insert policy.
  -- Check attribution before trusting the supplied creator's role.
  if auth.role() = 'authenticated' and actor_user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'The actor does not match the authenticated user.';
  end if;
  select * into actor from public.profiles where id = actor_user_id for share;
  if actor.role::text is distinct from 'Outdoor Sales' then return; end if;
  if actor.is_active is not true or actor.status is distinct from 'Active' then
    raise exception using errcode = '42501', message = 'Sales access required';
  end if;
  if selected_branch is null or selected_branch not in ('Karkh', 'Rasafa', 'Governorates') then
    raise exception using errcode = '22023', message = 'Choose the project branch: Karkh, Rasafa or Governorates.';
  end if;
  if selected_branch = 'Governorates' then return; end if;
  allowed_branch := public.outdoor_sales_branch_for_date(actor.outdoor_rotation_start_branch, statement_timestamp());
  if allowed_branch is null then
    raise exception using errcode = '22023', message = 'Ask Admin to assign your monthly Outdoor Sales rotation before creating a Karkh or Rasafa project.';
  end if;
  if selected_branch <> allowed_branch then
    raise exception using errcode = '22023', message = 'You can only create projects for your assigned branch or Governorates during this half of the month.';
  end if;
end;
$$;
revoke all on function public.require_outdoor_project_creation_branch(uuid,text) from public, anon, authenticated;
grant execute on function public.require_outdoor_project_creation_branch(uuid,text) to service_role;

-- Guard direct inserts as well as RPC intake. Preserve the installed Manager
-- mapping, governorate rules, and immutable existing Indoor branch handling.
do $project_trigger$
declare
  definition text;
  creator_marker text := 'select * into creator from profiles where id = new.created_by for share;';
  origin_marker text := 'old.original_creator_role::public.app_role) = ''Indoor Sales''';
begin
  select pg_get_functiondef('public.assign_indoor_project_branch()'::regprocedure) into definition;
  if position(creator_marker in definition) = 0 or position(origin_marker in definition) = 0
    or position('new.governorate := null;' in definition) = 0 then
    raise exception 'Unexpected project branch trigger; Outdoor monthly rotation migration was not applied.';
  end if;
  definition := replace(definition, creator_marker, creator_marker || E'\n  perform public.require_outdoor_project_creation_branch(new.created_by, new.branch);');
  definition := replace(definition, origin_marker,
    'old.original_creator_role::public.app_role) in (''Indoor Sales'', ''Outdoor Sales'')');
  execute definition;
end;
$project_trigger$;

-- This point follows the saved-receipt return and all payload validation, but
-- precedes client/project writes. Queued work uses the current server date,
-- never its editable device recording time. A failed sync retains no partial rows.
do $registration$
declare
  definition text;
  insert_marker text := 'if exists(select 1 from projects where id=p_project) then raise exception ''Project identifier already exists''; end if;';
begin
  select pg_get_functiondef('public.sync_field_change(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure) into definition;
  if position(insert_marker in definition) = 0
    or position('return saved.result;' in definition) = 0
    or position('''Governorates''' in definition) = 0 then
    raise exception 'Unexpected sync registration definition; Outdoor monthly rotation migration was not applied.';
  end if;
  definition := replace(definition, insert_marker,
    'perform public.require_outdoor_project_creation_branch(p_actor, p_payload#>>''{project,branch}'');' || E'\n  ' || insert_marker);
  execute definition;
end;
$registration$;

notify pgrst, 'reload schema';
commit;
