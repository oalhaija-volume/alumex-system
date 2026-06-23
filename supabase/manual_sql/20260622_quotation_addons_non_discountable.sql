alter table public.quotation_items
  add column if not exists line_type text not null default 'base' check (
    line_type in ('base', 'addon', 'accessory')
  ),
  add column if not exists is_discountable boolean not null default true;

update public.quotation_items
set
  line_type = coalesce(line_type, 'base'),
  is_discountable = coalesce(is_discountable, true);

