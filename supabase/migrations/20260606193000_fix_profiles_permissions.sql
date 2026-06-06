alter table public.profiles
add column if not exists status text not null default 'Active';

alter table public.profiles
drop constraint if exists profiles_status_check;

alter table public.profiles
add constraint profiles_status_check check (status in ('Active', 'Inactive'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create or replace function public.sync_profile_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Inactive' then
    new.is_active = false;
  elsif new.status = 'Active' then
    new.is_active = true;
  end if;

  if new.is_active = false then
    new.status = 'Inactive';
  else
    new.status = 'Active';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_status on public.profiles;
create trigger profiles_sync_status
before insert or update on public.profiles
for each row execute function public.sync_profile_status();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
    and status = 'Active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'Admin'
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_management" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_same_role" on public.profiles;
drop policy if exists "profiles_admin_manage" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

create policy "profiles_insert_own_or_admin"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.is_admin()
);

create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
)
with check (
  (
    id = auth.uid()
    and role = public.current_user_role()
  )
  or public.is_admin()
);

create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (public.is_admin());
