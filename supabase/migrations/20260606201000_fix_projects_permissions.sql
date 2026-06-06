grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.openings to authenticated;
grant all on table public.projects to service_role;
grant all on table public.openings to service_role;
