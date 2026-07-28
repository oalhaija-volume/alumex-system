-- Prevent Outdoor Sales from registering the same client's site twice.
-- The advisory transaction lock closes the concurrent-insert race for one client.

alter table public.projects
  alter column geofence_radius_meters set default 200;

create index if not exists projects_active_client_location_idx
on public.projects (client_id, location_latitude, location_longitude)
where archived_at is null
  and location_latitude is not null
  and location_longitude is not null;

create or replace function public.project_site_distance_meters(
  first_latitude numeric,
  first_longitude numeric,
  second_latitude numeric,
  second_longitude numeric
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 6371000::double precision * 2 * asin(
    sqrt(
      power(
        sin(radians((second_latitude - first_latitude)::double precision) / 2),
        2
      )
      + cos(radians(first_latitude::double precision))
      * cos(radians(second_latitude::double precision))
      * power(
        sin(radians((second_longitude - first_longitude)::double precision) / 2),
        2
      )
    )
  );
$$;

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
    and new.client_id is not distinct from old.client_id
    and new.location_latitude is not distinct from old.location_latitude
    and new.location_longitude is not distinct from old.location_longitude
    and new.original_creator_role is not distinct from old.original_creator_role
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.client_id::text, 0)
  );

  select project.id
  into conflicting_project_id
  from public.projects as project
  where project.client_id = new.client_id
    and project.id <> new.id
    and project.archived_at is null
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
          'An active project for this client already exists within 200 metres (%s).',
          conflicting_project_id
        );
  end if;

  return new;
end;
$$;

drop trigger if exists projects_prevent_outdoor_site_duplicate
on public.projects;
create trigger projects_prevent_outdoor_site_duplicate
before insert or update on public.projects
for each row execute function public.prevent_outdoor_sales_site_duplicate();

revoke all on function public.project_site_distance_meters(
  numeric,
  numeric,
  numeric,
  numeric
) from public;
