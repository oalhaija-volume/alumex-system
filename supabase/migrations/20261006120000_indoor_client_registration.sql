-- Keep direct authenticated Supabase inserts consistent with the API.
-- A restrictive policy also applies alongside any existing permissive policies.
create policy "clients_insert_indoor_only"
on public.clients as restrictive for insert to authenticated
with check (
  public.is_active_user()
  and public.current_user_role() in ('Admin', 'Indoor Sales', 'Outdoor Sales')
);
