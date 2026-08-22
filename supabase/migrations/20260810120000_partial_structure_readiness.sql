alter table public.projects
  drop constraint if exists projects_structure_readiness_check,
  add constraint projects_structure_readiness_check check (
    structure_readiness in ('unknown', 'ready', 'partially_ready', 'not_ready')
  );
