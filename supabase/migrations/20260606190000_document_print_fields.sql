alter table public.quotations
add column if not exists prepared_by_text text;

alter table public.contracts
add column if not exists contract_date date,
add column if not exists payment_terms text,
add column if not exists warranty_terms text,
add column if not exists execution_terms text,
add column if not exists prepared_by_text text,
add column if not exists language text not null default 'ar' check (language in ('en', 'ar'));

