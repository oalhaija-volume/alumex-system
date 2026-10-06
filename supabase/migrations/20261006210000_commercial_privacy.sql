-- Apply in Supabase SQL Editor. Required before enabling Operations/Project Manager accounts.
begin;
do $$
declare table_name text; proc record;
begin
  foreach table_name in array array['product_price_settings','project_price_settings','quotations','quotation_items','quotation_versions','quotation_version_items','contracts','documents','operations_handoffs','projects','contract_templates','project_costings','project_finance','project_workflow_events','activity_logs','audit_events','notifications'] loop
    if to_regclass(format('public.%I',table_name)) is null then continue; end if;
    execute format('drop policy if exists rebuilt_commercial_privacy on public.%I',table_name);
    execute format('create policy rebuilt_commercial_privacy on public.%I as restrictive for all to authenticated using (public.current_user_role()::text not in (''Operations Manager'',''Project Manager'')) with check (public.current_user_role()::text not in (''Operations Manager'',''Project Manager''))',table_name);
  end loop;
  for proc in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname ~ '(quotation|contract|costing|handoff)' loop
    execute format('revoke execute on function %s from public, anon, authenticated',proc.signature);
    execute format('grant execute on function %s to service_role',proc.signature);
  end loop;
end $$;
drop policy if exists rebuilt_signed_files_private on storage.objects;
create policy rebuilt_signed_files_private on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'signed-contracts-private' and public.current_user_role()::text not in ('Operations Manager','Project Manager'))
with check (bucket_id <> 'signed-contracts-private' and public.current_user_role()::text not in ('Operations Manager','Project Manager'));
create or replace function public.commercial_privacy_ready() returns boolean language sql stable security definer set search_path=public as $$ select true $$;
revoke all on function public.commercial_privacy_ready() from public, anon, authenticated;
grant execute on function public.commercial_privacy_ready() to service_role;
commit;
