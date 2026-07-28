-- Client records may intentionally share names, mobile numbers, or email addresses.
-- Keep the non-unique lookup indexes added by the sales intake migration.

drop index if exists public.clients_unique_normalized_mobile_idx;
drop index if exists public.clients_unique_normalized_email_idx;
drop index if exists public.clients_unique_name_mobile_idx;
