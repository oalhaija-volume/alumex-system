alter table public.openings
  add column if not exists site_readiness text not null default 'ready';

update public.openings
set site_readiness = 'not_ready'
where width <= 0 or height <= 0;

alter table public.openings
  drop constraint if exists openings_site_readiness_check,
  add constraint openings_site_readiness_check check (
    site_readiness in ('ready', 'not_ready')
  ),
  drop constraint if exists openings_site_readiness_dimensions_check,
  add constraint openings_site_readiness_dimensions_check check (
    (site_readiness = 'ready' and width > 0 and height > 0)
    or site_readiness = 'not_ready'
  );

create index if not exists openings_project_site_readiness_idx
on public.openings (project_id, site_readiness);
