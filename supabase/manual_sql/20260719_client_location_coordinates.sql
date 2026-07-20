alter table public.clients
  add column if not exists location_latitude numeric(10, 7),
  add column if not exists location_longitude numeric(10, 7);

alter table public.clients
  drop constraint if exists clients_location_latitude_check,
  drop constraint if exists clients_location_longitude_check;

alter table public.clients
  add constraint clients_location_latitude_check
    check (location_latitude is null or location_latitude between -90 and 90),
  add constraint clients_location_longitude_check
    check (location_longitude is null or location_longitude between -180 and 180);
