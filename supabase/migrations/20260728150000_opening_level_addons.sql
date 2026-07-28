-- Roller shutters, photocell doors, swing doors, and louvers are selected
-- against a specific aluminum opening during quotation, not as project services.
update public.product_price_settings
set category = 'addon',
    updated_at = now()
where lower(trim(product_name)) in (
  'roller shutters',
  'photocell doors',
  'a swing door',
  'louver'
);

insert into public.product_price_settings
  (product_name, category, unit, unit_price, is_active)
values
  ('Louver', 'addon', 'sqm', 0, true)
on conflict (product_name) do update
set category = excluded.category,
    unit = excluded.unit,
    updated_at = now();
