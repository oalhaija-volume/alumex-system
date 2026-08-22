-- The function returns a contract_id column, which also creates a PL/pgSQL
-- output variable named contract_id. Use the named constraint so the handoff
-- upsert does not fail with PostgreSQL error 42702.

do $migration$
declare
  current_definition text;
  fixed_definition text;
begin
  select pg_get_functiondef(
    'public.sign_contract_and_create_handoff(uuid,text,text,timestamptz,text,text,timestamptz,uuid)'::regprocedure
  )
  into current_definition;

  fixed_definition := replace(
    current_definition,
    'on conflict (contract_id) do update',
    'on conflict on constraint operations_handoffs_contract_unique do update'
  );

  if fixed_definition <> current_definition then
    execute fixed_definition;
  end if;
end;
$migration$;
