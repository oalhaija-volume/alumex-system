alter table public.contracts
  add column if not exists sales_signature_data_url text,
  add column if not exists sales_signed_name text,
  add column if not exists sales_signed_at timestamptz;

create index if not exists contracts_sales_signed_at_idx
on public.contracts (sales_signed_at desc)
where sales_signed_at is not null;
