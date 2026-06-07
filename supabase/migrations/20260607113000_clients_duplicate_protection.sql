do $$
begin
  if not exists (
    select 1
    from public.clients
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null
    group by regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
    having count(*) > 1
  ) then
    create unique index if not exists clients_unique_normalized_mobile_idx
    on public.clients ((regexp_replace(coalesce(mobile, ''), '\D', '', 'g')))
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null;
  else
    raise notice 'Skipped clients_unique_normalized_mobile_idx because duplicate mobile numbers already exist.';
  end if;

  if not exists (
    select 1
    from public.clients
    where nullif(lower(trim(coalesce(email, ''))), '') is not null
    group by lower(trim(coalesce(email, '')))
    having count(*) > 1
  ) then
    create unique index if not exists clients_unique_normalized_email_idx
    on public.clients ((lower(trim(coalesce(email, '')))))
    where nullif(lower(trim(coalesce(email, ''))), '') is not null;
  else
    raise notice 'Skipped clients_unique_normalized_email_idx because duplicate emails already exist.';
  end if;

  if not exists (
    select 1
    from public.clients
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null
    group by lower(trim(client_name)), regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
    having count(*) > 1
  ) then
    create unique index if not exists clients_unique_name_mobile_idx
    on public.clients (
      (lower(trim(client_name))),
      (regexp_replace(coalesce(mobile, ''), '\D', '', 'g'))
    )
    where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null;
  else
    raise notice 'Skipped clients_unique_name_mobile_idx because duplicate client name and mobile pairs already exist.';
  end if;
end $$;
