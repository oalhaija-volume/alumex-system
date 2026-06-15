alter table public.projects
  add column if not exists location_latitude numeric(10, 7),
  add column if not exists location_longitude numeric(10, 7),
  add column if not exists geofence_radius_meters integer not null default 100;

alter table public.projects
  drop constraint if exists projects_location_latitude_check,
  drop constraint if exists projects_location_longitude_check,
  drop constraint if exists projects_geofence_radius_meters_check;

alter table public.projects
  add constraint projects_location_latitude_check
    check (location_latitude is null or location_latitude between -90 and 90),
  add constraint projects_location_longitude_check
    check (location_longitude is null or location_longitude between -180 and 180),
  add constraint projects_geofence_radius_meters_check
    check (geofence_radius_meters between 25 and 1000);
