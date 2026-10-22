begin;

-- Exact product-name conflicts preserve existing IDs and saved references.
-- Only these two canonical products receive the requested catalog prices.
insert into public.product_price_settings as catalog
  (product_name, category, unit, unit_price, is_active)
values
  ('Alumex Hinged Window', 'aluminum_system', 'sqm', 260000, true),
  ('Alumex Hinged Door', 'aluminum_system', 'sqm', 305000, true)
on conflict (product_name) do update
set category = excluded.category,
    unit = excluded.unit,
    unit_price = excluded.unit_price,
    is_active = excluded.is_active,
    updated_at = now()
where catalog.category is distinct from excluded.category
   or catalog.unit is distinct from excluded.unit
   or catalog.unit_price is distinct from excluded.unit_price
   or catalog.is_active is distinct from excluded.is_active;

commit;
