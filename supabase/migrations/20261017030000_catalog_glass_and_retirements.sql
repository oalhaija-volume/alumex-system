begin;
-- Retire only the generic photocell entry and fiber cement; preserve named
-- photocell products, stored prices and historical quotation snapshots.
update public.product_price_settings set is_active=false,updated_at=now()
where lower(trim(product_name)) in ('photocell doors','fiber cement','fibre cement');
update public.product_price_settings set category='glass_option',unit='sqm',updated_at=now()
where regexp_replace(translate(lower(trim(product_name)),'&-','  '),'\s+',' ','g')='saint gobain glass';

-- Only the authenticated Admin API may invoke this with the service-role client.
-- A single statement updates the entire batch; any invalid item rolls it back.
create or replace function public.save_catalog_prices(p_changes jsonb)
returns table(id uuid,price numeric)
language plpgsql set search_path='' as $$
declare expected integer; matched integer;
begin
 if jsonb_typeof(p_changes) is distinct from 'array' then
  raise exception 'Invalid catalog changes' using errcode='22023';
 end if;
 expected=jsonb_array_length(p_changes);
 if expected<1 or expected>1000 or exists(
  select 1 from jsonb_array_elements(p_changes) c
  where jsonb_typeof(c) is distinct from 'object'
   or jsonb_typeof(c->'id') is distinct from 'string'
   or coalesce(c->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(c->'price') is distinct from 'number'
   or (c->>'price')::numeric<0.01 or (c->>'price')::numeric>10000000000
 ) then raise exception 'Invalid catalog changes' using errcode='22023'; end if;
 if (select count(distinct (c->>'id')::uuid) from jsonb_array_elements(p_changes) c)<>expected then
  raise exception 'Duplicate catalog item' using errcode='22023';
 end if;
 -- Lock in a consistent order and recheck eligibility before changing any price.
 perform p.id from public.product_price_settings p
 join jsonb_to_recordset(p_changes) as c(id uuid,price numeric) on p.id=c.id
 where regexp_replace(translate(lower(trim(p.product_name)),'&-','  '),'\s+',' ','g') not in ('windows doors','windows and doors','reynaers system','aluman system','skylight','photocell doors','fiber cement','fibre cement')
 order by p.id for update of p;
 get diagnostics matched=row_count;
 if matched<>expected then raise exception 'Unavailable catalog item' using errcode='22023'; end if;
 return query
 update public.product_price_settings p set unit_price=c.price,updated_at=now()
 from jsonb_to_recordset(p_changes) as c(id uuid,price numeric)
 where p.id=c.id returning p.id,p.unit_price;
end $$;
revoke all on function public.save_catalog_prices(jsonb) from public,anon,authenticated;
grant execute on function public.save_catalog_prices(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
