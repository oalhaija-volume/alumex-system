-- Disposable PostgreSQL/PGlite fixture with deliberately broad old policies.
-- Run after creating storage.buckets/objects and the scoped migration.
begin;
insert into storage.buckets(id,name,public) values
  ('desktop-releases-private','desktop-releases-private',false),('ordinary-fixture','ordinary-fixture',false);
insert into storage.objects(bucket_id,name) values
  ('desktop-releases-private','windows/1.0.0/fixture/Setup.exe'),('ordinary-fixture','ordinary-file');
do $$
declare browser_role text; changed integer;
begin
  foreach browser_role in array array['anon','authenticated'] loop
    execute format('set local role %I',browser_role);
    assert (select count(*)=0 from storage.objects where bucket_id='desktop-releases-private'),'Browser read installer objects';
    assert (select count(*)=0 from storage.buckets where id='desktop-releases-private'),'Browser read installer bucket metadata';
    assert (select count(*)=1 from storage.objects where bucket_id='ordinary-fixture'),'Existing object read access changed';
    assert (select count(*)=1 from storage.buckets where id='ordinary-fixture'),'Existing bucket read access changed';
    begin
      insert into storage.objects(bucket_id,name) values('desktop-releases-private','replacement.exe');
      raise exception using errcode='ZX001',message='Browser uploaded installer';
    exception when insufficient_privilege then null; end;
    begin
      update storage.objects set bucket_id='desktop-releases-private' where bucket_id='ordinary-fixture';
      raise exception using errcode='ZX001',message='Browser moved a file into protected installer bucket';
    exception when insufficient_privilege then null; end;
    update storage.objects set name='changed.exe' where bucket_id='desktop-releases-private';
    get diagnostics changed=row_count;
    assert changed=0,'Browser replaced installer';
    delete from storage.objects where bucket_id='desktop-releases-private';
    get diagnostics changed=row_count;
    assert changed=0,'Browser deleted installer';
    update storage.buckets set public=true where id='desktop-releases-private';
    get diagnostics changed=row_count;
    assert changed=0,'Browser made installer bucket public';
    delete from storage.buckets where id='desktop-releases-private';
    get diagnostics changed=row_count;
    assert changed=0,'Browser deleted installer bucket';
    update storage.objects set name='ordinary-file' where bucket_id='ordinary-fixture';
    get diagnostics changed=row_count;
    assert changed=1,'Existing object update permission changed';
    reset role;
  end loop;
  set local role service_role;
  assert (select count(*)=1 from storage.objects where bucket_id='desktop-releases-private'),'Service installer read was blocked';
  insert into storage.objects(bucket_id,name) values('desktop-releases-private','service-only-upload.exe');
  assert (select count(*)=2 from storage.objects where bucket_id='desktop-releases-private'),'Service installer upload was blocked';
  reset role;
  assert (select public=false from storage.buckets where id='desktop-releases-private'),'Installer bucket privacy changed';
  raise notice 'PASS: anonymous/authenticated installer reads/writes/deletes/metadata denied; existing buckets preserved; service access retained';
end;
$$;
rollback;
