update public.product_price_settings
set category = 'addon',
    unit = 'meter',
    updated_at = now()
where lower(trim(product_name)) in ('georgian bars', 'georgien bars');

update public.product_price_settings
set unit = 'project',
    unit_price = 0,
    updated_at = now()
where lower(trim(category)) = 'aluminum_system'
  and lower(trim(product_name)) not like '%alumex%'
  and lower(trim(product_name)) not like '%the address%';

update public.product_price_settings
set unit = 'sqm',
    updated_at = now()
where lower(trim(category)) = 'aluminum_system'
  and (
    lower(trim(product_name)) like '%alumex%'
    or lower(trim(product_name)) like '%the address%'
  )
  and lower(trim(unit)) = 'project';
