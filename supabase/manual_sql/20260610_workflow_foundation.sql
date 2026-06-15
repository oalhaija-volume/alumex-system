do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'project_workflow_status'
  ) then
    create type public.project_workflow_status as enum (
      'sales_client_created',
      'sales_quotation_created',
      'sales_contract_created',
      'finance_down_payment_pending',
      'finance_down_payment_confirmed',
      'finance_payment_exception',
      'operations_manager_review',
      'project_manager_assigned',
      'project_engineer_assigned',
      'site_engineer_assigned',
      'measurement_pending',
      'project_description_draft',
      'audit_pending',
      'audit_rejected',
      'audit_approved',
      'finance_final_check',
      'branch_manager_review',
      'approved_for_factory',
      'sent_to_factory',
      'factory_in_progress',
      'factory_completed',
      'final_payment_requested',
      'final_payment_received',
      'delivery_pending',
      'delivered',
      'installation_in_progress',
      'installation_completed'
    );
  end if;
end $$;

alter table public.projects
  add column if not exists workflow_status public.project_workflow_status not null default 'sales_client_created',
  add column if not exists operations_manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists project_manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists project_engineer_id uuid references public.profiles(id) on delete set null,
  add column if not exists site_engineer_id uuid references public.profiles(id) on delete set null;

create index if not exists projects_workflow_status_idx
on public.projects (workflow_status);

create index if not exists projects_operations_manager_id_idx
on public.projects (operations_manager_id);

create index if not exists projects_project_manager_id_idx
on public.projects (project_manager_id);

create index if not exists projects_project_engineer_id_idx
on public.projects (project_engineer_id);

create index if not exists projects_site_engineer_id_idx
on public.projects (site_engineer_id);

grant usage on schema public to authenticated, service_role;
grant usage on type public.project_workflow_status to authenticated, service_role;
grant select on table public.clients to authenticated;
grant select on table public.projects to authenticated;
grant select on table public.openings to authenticated;
grant select on table public.quotations to authenticated;
grant select on table public.quotation_items to authenticated;
grant select on table public.contracts to authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.clients to service_role;
grant all on table public.projects to service_role;
grant all on table public.openings to service_role;
grant all on table public.quotations to service_role;
grant all on table public.quotation_items to service_role;
grant all on table public.contracts to service_role;
grant all on table public.profiles to service_role;

alter table public.projects enable row level security;

drop policy if exists "projects_select_active_workflow" on public.projects;
drop policy if exists "projects_update_admin_workflow" on public.projects;

create policy "projects_select_active_workflow"
on public.projects
for select
to authenticated
using (public.is_active_user());

create policy "projects_update_admin_workflow"
on public.projects
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
