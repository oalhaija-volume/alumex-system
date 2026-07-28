-- The function returns an `id` column, which also creates a PL/pgSQL output
-- variable named `id`. Qualify table columns so quotation saves do not fail
-- with PostgreSQL error 42702 ("column reference id is ambiguous").

do $migration$
declare
  current_definition text;
  fixed_definition text;
begin
  select pg_get_functiondef(
    'public.save_quotation_version_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,text,text,uuid,jsonb)'::regprocedure
  )
  into current_definition;

  fixed_definition := replace(
    current_definition,
    'where id = p_created_by',
    'where public.profiles.id = p_created_by'
  );
  fixed_definition := replace(
    fixed_definition,
    'and is_active = true',
    'and public.profiles.is_active = true'
  );
  fixed_definition := replace(
    fixed_definition,
    'coalesce(status, ''Active'')',
    'coalesce(public.profiles.status, ''Active'')'
  );
  fixed_definition := replace(
    fixed_definition,
    'where id = p_project_id and client_id = p_client_id and archived_at is null',
    'where public.projects.id = p_project_id
    and public.projects.client_id = p_client_id
    and public.projects.archived_at is null'
  );

  if fixed_definition <> current_definition then
    execute fixed_definition;
  end if;
end;
$migration$;
