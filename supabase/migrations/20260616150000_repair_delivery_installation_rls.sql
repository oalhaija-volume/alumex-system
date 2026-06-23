create or replace view public.delivery_vehicles_with_capacity as
select
  dv.*,
  (v.cubic_size - dv.cubic_space_used) as cubic_space_available,
  v.cubic_size as vehicle_cubic_size
from public.delivery_vehicles dv
join public.vehicles v on v.id = dv.vehicle_id;

drop policy if exists "Admin and Delivery Head can manage delivery assignments" on public.delivery_assignments;
drop policy if exists "delivery_assignments_admin_insert" on public.delivery_assignments;
drop policy if exists "delivery_assignments_admin_update" on public.delivery_assignments;
drop policy if exists "delivery_assignments_admin_delete" on public.delivery_assignments;

create policy "delivery_assignments_role_insert"
  on public.delivery_assignments
  for insert
  to authenticated
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_assignments_role_update"
  on public.delivery_assignments
  for update
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_assignments_role_delete"
  on public.delivery_assignments
  for delete
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

drop policy if exists "Admin and Delivery Head can manage delivery vehicles" on public.delivery_vehicles;
drop policy if exists "delivery_vehicles_admin_insert" on public.delivery_vehicles;
drop policy if exists "delivery_vehicles_admin_update" on public.delivery_vehicles;
drop policy if exists "delivery_vehicles_admin_delete" on public.delivery_vehicles;

create policy "delivery_vehicles_role_insert"
  on public.delivery_vehicles
  for insert
  to authenticated
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_vehicles_role_update"
  on public.delivery_vehicles
  for update
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  )
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

create policy "delivery_vehicles_role_delete"
  on public.delivery_vehicles
  for delete
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Delivery Head'
    )
  );

drop policy if exists "Admin and Project Manager can manage installation assignments" on public.installation_assignments;
drop policy if exists "installation_assignments_admin_insert" on public.installation_assignments;
drop policy if exists "installation_assignments_admin_update" on public.installation_assignments;
drop policy if exists "installation_assignments_admin_delete" on public.installation_assignments;

create policy "installation_assignments_role_insert"
  on public.installation_assignments
  for insert
  to authenticated
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Project Manager'
    )
  );

create policy "installation_assignments_role_update"
  on public.installation_assignments
  for update
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Project Manager'
    )
  )
  with check (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Project Manager'
    )
  );

create policy "installation_assignments_role_delete"
  on public.installation_assignments
  for delete
  to authenticated
  using (
    is_admin() or
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'Project Manager'
    )
  );
