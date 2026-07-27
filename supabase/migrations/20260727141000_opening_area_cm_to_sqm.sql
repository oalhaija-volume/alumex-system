-- Opening dimensions are captured in centimeters. Store the exact geometric
-- area in square meters; pricing minimums belong to the quotation layer.

alter table public.openings
  alter column area_sqm drop expression if exists;

update public.openings
set area_sqm = round(
  (
    greatest(width, 0)
    * greatest(height, 0)
    * greatest(quantity, 0)
  ) / 10000,
  3
);

alter table public.openings
  alter column area_sqm set not null;

create or replace function public.set_opening_area_sqm()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.area_sqm := round(
    (
      greatest(new.width, 0)
      * greatest(new.height, 0)
      * greatest(new.quantity, 0)
    ) / 10000,
    3
  );
  return new;
end;
$$;

drop trigger if exists openings_set_area_sqm
on public.openings;
create trigger openings_set_area_sqm
before insert or update of width, height, quantity
on public.openings
for each row execute function public.set_opening_area_sqm();
