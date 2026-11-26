begin;

-- Keep deployed callers that wrap this result as {client: result} compatible
-- while newer callers consume the structured client/project update directly.
do $client_name_return_compatibility$
declare definition text; previous_return text; compatible_return text;
begin
 select pg_get_functiondef('public.rename_project_client(uuid,uuid,text,text)'::regprocedure) into definition;
 previous_return:=$return$ return jsonb_build_object('client',jsonb_build_object('id',customer.id,'client_name',renamed_client),'projects',updated_projects,'documentRevisionsCreated',created_count);$return$;
 compatible_return:=$return$ return jsonb_build_object('id',customer.id,'client_name',renamed_client,'client',jsonb_build_object('id',customer.id,'client_name',renamed_client),'projects',updated_projects,'documentRevisionsCreated',created_count);$return$;
 if cardinality(string_to_array(definition,previous_return))<>2 then
  raise exception 'Unexpected client-name update return shape.';
 end if;
 execute replace(definition,previous_return,compatible_return);
end;
$client_name_return_compatibility$;

notify pgrst,'reload schema';
commit;
