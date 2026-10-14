-- Apply and commit before the following permissions migration.
-- PostgreSQL requires new enum values to commit before they can be used.
alter type public.app_role add value if not exists 'Sales Director';
alter type public.app_role add value if not exists 'CEO';
