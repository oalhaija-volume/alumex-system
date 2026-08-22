-- Prevent the Outdoor Sales team from registering the same active site twice,
-- even if a duplicate client record is selected or created.

create index if not exists projects_active_outdoor_location_idx
on public.projects (location_latitude, location_longitude)
where archived_at is null
  and original_creator_role = 'Outdoor Sales'
  and location_latitude is not null
  and location_longitude is not null;

create or replace function public.prevent_outdoor_sales_site_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflicting_project_id uuid;
begin
  if new.original_creator_role is distinct from 'Outdoor Sales'
    or new.location_latitude is null
    or new.location_longitude is null
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.location_latitude is not distinct from old.location_latitude
    and new.location_longitude is not distinct from old.location_longitude
    and new.original_creator_role is not distinct from old.original_creator_role
  then
    return new;
  end if;

  -- A shared transaction lock prevents two team members from concurrently
  -- registering nearby coordinates before either insert becomes visible.
  perform pg_advisory_xact_lock(
    hashtextextended('projects:outdoor-site-duplicate', 0)
  );

  select project.id
  into conflicting_project_id
  from public.projects as project
  where project.id <> new.id
    and project.archived_at is null
    and project.original_creator_role = 'Outdoor Sales'
    and project.location_latitude is not null
    and project.location_longitude is not null
    and public.project_site_distance_meters(
      new.location_latitude,
      new.location_longitude,
      project.location_latitude,
      project.location_longitude
    ) <= 200
  order by project.created_at
  limit 1;

  if conflicting_project_id is not null then
    raise exception 'projects_outdoor_site_200m_duplicate'
      using
        errcode = '23505',
        detail = format(
          'Outdoor Sales already registered an active project within 200 metres of this site (%s).',
          conflicting_project_id
        );
  end if;

  return new;
end;
$$;
