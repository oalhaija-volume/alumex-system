alter table public.openings
  add column if not exists solid_panel_height numeric(12, 3) not null default 0 check (
    solid_panel_height >= 0
  );

alter table public.quotation_items
  add column if not exists solid_panel_height numeric(12, 3) not null default 0 check (
    solid_panel_height >= 0
  );

update public.openings
set solid_panel_height = 0
where solid_panel_height is null;

update public.quotation_items
set solid_panel_height = 0
where solid_panel_height is null;
