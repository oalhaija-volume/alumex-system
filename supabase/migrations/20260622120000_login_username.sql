alter table public.profiles
add column if not exists username text;

with profile_username_sources as (
  select
    id,
    lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9._-]', '', 'g')) as raw_username
  from public.profiles
  where username is null
),
normalized_profiles as (
  select
    id,
    case
      when raw_username ~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
        then raw_username
      else 'user' || left(replace(id::text, '-', ''), 12)
    end as base_username
  from profile_username_sources
),
numbered_profiles as (
  select
    id,
    case
      when row_number() over (partition by base_username order by id) = 1
        then left(base_username, 64)
      else
        left(base_username, 55)
        || '-'
        || row_number() over (partition by base_username order by id)::text
    end as next_username
  from normalized_profiles
)
update public.profiles as profiles
set username = numbered_profiles.next_username
from numbered_profiles
where profiles.id = numbered_profiles.id
  and profiles.username is null;

create unique index if not exists profiles_username_unique_idx
on public.profiles (username)
where username is not null;

alter table public.profiles
drop constraint if exists profiles_username_format_check;

alter table public.profiles
add constraint profiles_username_format_check
check (
  username is null
  or username ~ '^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$'
);
