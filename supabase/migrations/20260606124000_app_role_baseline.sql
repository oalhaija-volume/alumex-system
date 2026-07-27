-- Reproducible role baseline for blank-database migration replay.
-- The initial schema predates the expanded organization role catalog, while
-- several later migrations cast these values before defining them.

alter type public.app_role add value if not exists 'Sales Rep';
alter type public.app_role add value if not exists 'Finance / Accountant';
alter type public.app_role add value if not exists 'Operations Manager';
alter type public.app_role add value if not exists 'Project Manager';
alter type public.app_role add value if not exists 'Project Engineer';
alter type public.app_role add value if not exists 'Site Engineer';
alter type public.app_role add value if not exists 'Auditor';
alter type public.app_role add value if not exists 'Branch Manager';
alter type public.app_role add value if not exists 'Delivery Head';
alter type public.app_role add value if not exists 'Installation Head';
