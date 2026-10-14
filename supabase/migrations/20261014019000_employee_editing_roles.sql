-- Some installations predate the HR role migration. Commit this enum change
-- before applying employee_profile_editing or assigning the HR role.
alter type public.app_role add value if not exists 'HR';
