begin;

-- Keep installer binaries immutable to all browser roles, even if a future
-- permissive storage policy grants wider access. Signed downloads are issued
-- by the server service role after checking the employee's active account.
do $$
begin
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
    or not exists(select 1 from pg_class where oid='storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage row-level security must already be enabled.';
  end if;
end;
$$;

create policy desktop_releases_objects_server_only
on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'desktop-releases-private')
with check(bucket_id<>'desktop-releases-private');

-- Bucket metadata must not be changed to public or assigned a different limit
-- by a browser role. Existing bucket metadata permissions remain unchanged.
create policy desktop_releases_bucket_server_only
on storage.buckets as restrictive for all to anon,authenticated
using(id<>'desktop-releases-private')
with check(id<>'desktop-releases-private');

notify pgrst,'reload schema';
commit;
