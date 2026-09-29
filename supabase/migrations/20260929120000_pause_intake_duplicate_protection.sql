-- Temporarily allow repeated client contact details and nearby project sites.
-- Keep primary keys, project numbers, and all existing records intact.
begin;

drop index if exists public.clients_unique_normalized_mobile_idx;
drop index if exists public.clients_unique_normalized_email_idx;
drop index if exists public.clients_unique_name_mobile_idx;

alter table public.projects
  disable trigger projects_prevent_outdoor_site_duplicate;

commit;
