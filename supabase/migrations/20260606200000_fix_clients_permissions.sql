grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant all on table public.clients to service_role;
