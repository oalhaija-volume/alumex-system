begin;

-- Reuse the measured arch flag throughout online capture, offline sync, edits
-- and quotation snapshots. Existing flags and saved commercial data stay intact.
alter table public.openings
  drop constraint if exists openings_arch_window_or_door,
  drop constraint if exists openings_arch_compatible_type,
  add constraint openings_arch_compatible_type
    check (not has_arch or coalesce(opening_type in ('Window', 'Door', 'Curtain Wall'), false));

-- Keep older clients compatible when they omit the flag. Explicit values must
-- remain booleans, and other structural types cannot request an arch.
create or replace function public.normalize_opening_arch(value jsonb, structural_type text)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  if value is null then return false; end if;
  if jsonb_typeof(value) is distinct from 'boolean'
    or (value = 'true'::jsonb and coalesce(structural_type not in ('Window', 'Door', 'Curtain Wall'), true)) then
    raise exception 'Choose Arch or No arch for a window, door or curtain wall.';
  end if;
  return value = 'true'::jsonb;
end;
$$;

notify pgrst, 'reload schema';
commit;
