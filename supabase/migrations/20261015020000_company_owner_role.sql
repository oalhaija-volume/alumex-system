-- Commit this enum addition before applying Company Owner permissions.
alter type public.app_role add value if not exists 'Company Owner';
