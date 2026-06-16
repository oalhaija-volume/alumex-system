-- Create installation_assignments table
create table public.installation_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  installation_team_id uuid not null references public.installation_teams(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending', -- pending, in_progress, completed
  completion_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add RLS policies for installation_assignments
alter table public.installation_assignments enable row level security;

create policy "Authenticated users can view installation assignments"
  on public.installation_assignments
  for select
  to authenticated
  using (true);

create policy "Admin and Project Manager can manage installation assignments"
  on public.installation_assignments
  for all
  to authenticated
  using (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Project Manager'
    )
  )
  with check (
    is_admin() or 
    exists (
      select 1 from profiles 
      where id = auth.uid() 
      and role = 'Project Manager'
    )
  );

-- Update activity_entity_type enum
alter type public.activity_entity_type add value 'installation_assignment' if not exists;
