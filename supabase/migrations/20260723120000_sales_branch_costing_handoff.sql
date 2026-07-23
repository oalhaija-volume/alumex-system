alter table public.projects
add column if not exists branch text;

alter table public.projects
drop constraint if exists projects_branch_check;

alter table public.projects
add constraint projects_branch_check
check (branch is null or branch in ('Rasafa', 'Karkh'));

alter table public.project_costings
add column if not exists handoff_status text not null default 'draft',
add column if not exists sent_to_sales_at timestamptz,
add column if not exists sent_to_sales_by uuid references public.profiles(id) on delete set null;

alter table public.project_costings
drop constraint if exists project_costings_handoff_status_check;

alter table public.project_costings
add constraint project_costings_handoff_status_check
check (handoff_status in ('draft', 'sent_to_sales'));

create index if not exists project_costings_handoff_status_idx
on public.project_costings (handoff_status);

alter table public.quotations
add column if not exists pricing_source text not null default 'catalog';

alter table public.quotations
drop constraint if exists quotations_pricing_source_check;

alter table public.quotations
add constraint quotations_pricing_source_check
check (pricing_source in ('catalog', 'project_costing'));

alter table public.contracts
add column if not exists pricing_source text not null default 'catalog';

alter table public.contracts
drop constraint if exists contracts_pricing_source_check;

alter table public.contracts
add constraint contracts_pricing_source_check
check (pricing_source in ('catalog', 'project_costing'));

update public.product_price_settings
set unit = 'project',
    unit_price = 0,
    updated_at = now()
where lower(trim(category)) = 'aluminum_system'
  and lower(trim(product_name)) like '%the address%';
