update public.product_price_settings
set unit = 'sqm',
    updated_at = now()
where lower(trim(category)) = 'aluminum_system'
  and lower(trim(unit)) = 'project';
