begin;

-- Branch Manager already exists in app_role. Permit assigning it through the
-- existing employee update without replacing newer branch/security guards.
do $branch_manager_role$
declare
 definition text;
 supported_roles text := '(''Admin'',''HR'',''Sales Director'',''CEO'',''Company Owner'',''Sales Manager'',''Indoor Sales'',''Outdoor Sales'',''Operations Manager'',''Project Manager'')';
 expanded_roles text := '(''Admin'',''HR'',''Sales Director'',''CEO'',''Company Owner'',''Sales Manager'',''Indoor Sales'',''Outdoor Sales'',''Operations Manager'',''Project Manager'',''Branch Manager'')';
begin
 select pg_get_functiondef('public.update_employee_profile(uuid,uuid,timestamptz,text,text,text,boolean)'::regprocedure)
  into definition;
 if position(expanded_roles in definition)>0 then return; end if;
 if cardinality(string_to_array(definition,supported_roles))<>2
  or position('if p_role is distinct from employee.role::text and p_role not in' in definition)=0
  or position('Choose a supported employee role.' in definition)=0
  or position('This employee was changed by someone else.' in definition)=0
  or position('You cannot change your own role or deactivate your account.' in definition)=0
  or position('The primary Admin account must remain active with the Admin role.' in definition)=0 then
  raise exception 'Unexpected employee update definition; Branch Manager role support was not applied.';
 end if;
 execute replace(definition,supported_roles,expanded_roles);
end;
$branch_manager_role$;

notify pgrst,'reload schema';
commit;
