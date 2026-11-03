begin;

-- Reuse existing catalog rows, including older case/whitespace variants. Keep
-- their IDs, agreed prices and active flags while correcting their product role.
update public.product_price_settings
set category = 'addon',
    unit = 'item',
    updated_at = now()
where lower(trim(regexp_replace(product_name, '\s+', ' ', 'g')))
      = 'curtain wall pushout'
  and (category is distinct from 'addon' or unit is distinct from 'item');

-- Arch uses the quotation's fixed 150,000 IQD checkbox; no catalog row is needed.
-- New pushouts need an administrator's catalog price before they can be quoted.
-- Do not create a second product when an equivalent legacy name already exists.
insert into public.product_price_settings
  (product_name, category, unit, unit_price, is_active)
select product_name, 'addon', 'item', 0, true
from (values ('Curtain Wall Pushout')) as additions(product_name)
where not exists (
  select 1 from public.product_price_settings as catalog
  where lower(trim(regexp_replace(catalog.product_name, '\s+', ' ', 'g')))
        = lower(additions.product_name)
)
on conflict (product_name) do nothing;

commit;
