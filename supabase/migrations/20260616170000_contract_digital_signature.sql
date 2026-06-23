alter table public.contracts
  add column if not exists client_signature_data_url text,
  add column if not exists client_signed_name text,
  add column if not exists client_signed_at timestamptz,
  add column if not exists sales_signature_data_url text,
  add column if not exists sales_signed_name text,
  add column if not exists sales_signed_at timestamptz,
  add column if not exists signed_by_sales_user_id uuid references public.profiles(id) on delete set null;

create index if not exists contracts_client_signed_at_idx
on public.contracts (client_signed_at desc)
where client_signed_at is not null;

create index if not exists contracts_sales_signed_at_idx
on public.contracts (sales_signed_at desc)
where sales_signed_at is not null;
