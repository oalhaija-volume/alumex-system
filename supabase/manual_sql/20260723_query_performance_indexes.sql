-- Index the filters and sort orders used by the main operational workspaces.
-- PostgreSQL does not automatically index foreign-key columns.

create index if not exists projects_created_at_idx
on public.projects (created_at desc);

create index if not exists projects_status_created_at_idx
on public.projects (status, created_at desc);

create index if not exists projects_workflow_status_created_at_idx
on public.projects (workflow_status, created_at desc);

create index if not exists projects_branch_created_at_idx
on public.projects (branch, created_at desc);

create index if not exists quotations_created_at_idx
on public.quotations (created_at desc);

create index if not exists quotations_status_created_at_idx
on public.quotations (status, created_at desc);

create index if not exists contracts_created_at_idx
on public.contracts (created_at desc);

create index if not exists project_workflow_events_project_created_at_idx
on public.project_workflow_events (project_id, created_at desc);

create index if not exists delivery_assignments_project_id_idx
on public.delivery_assignments (project_id);

create index if not exists installation_assignments_project_id_idx
on public.installation_assignments (project_id);
