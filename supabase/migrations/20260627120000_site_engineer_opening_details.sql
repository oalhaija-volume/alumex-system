alter table public.openings
  add column if not exists shape text,
  add column if not exists opening_type text,
  add column if not exists bottom_frame text,
  add column if not exists opening_direction text,
  add column if not exists glass_color text,
  add column if not exists fixed_height numeric(12, 3) not null default 0 check (
    fixed_height >= 0
  );
