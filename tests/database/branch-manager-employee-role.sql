-- Isolated employee fixtures only. Run inside a rollback transaction together
-- with the reviewed role migration; no real employee is created or changed.
begin;
set local plpgsql.check_asserts=on;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare
 administrator uuid:=gen_random_uuid(); local_hr uuid:=gen_random_uuid(); foreign_hr uuid:=gen_random_uuid();
 first_employee uuid:=gen_random_uuid(); second_employee uuid:=gen_random_uuid();
 first_row public.profiles; second_row public.profiles; hr_row public.profiles;
 before_second jsonb; saved jsonb;
begin
 if current_setting('plpgsql.check_asserts') is distinct from 'on' then raise exception 'Fixture assertions must be enabled.'; end if;
 insert into auth.users(id,email) values
  (administrator,administrator||'@example.invalid'),(local_hr,local_hr||'@example.invalid'),(foreign_hr,foreign_hr||'@example.invalid'),
  (first_employee,first_employee||'@example.invalid'),(second_employee,second_employee||'@example.invalid');
 update public.profiles set role='Admin',is_active=true,status='Active' where id=administrator;
 update public.profiles set role='HR',branch='Karkh',is_active=true,status='Active' where id=local_hr;
 update public.profiles set role='HR',branch='Rasafa',is_active=true,status='Active' where id=foreign_hr;
 update public.profiles set role='Indoor Sales',branch='Karkh',is_active=true,status='Active' where id in(first_employee,second_employee);
 select * into first_row from public.profiles where id=first_employee;
 saved:=public.update_employee_profile_with_branch(administrator,first_employee,first_row.updated_at,'Admin assigned Branch Manager','bm.admin.'||left(first_employee::text,8),'Branch Manager',true,'Najaf');
 assert saved->>'role'='Branch Manager' and saved->>'branch'='Najaf';
 assert (select role::text='Branch Manager' and branch='Najaf' and is_active and status='Active' from public.profiles where id=first_employee);
 select * into second_row from public.profiles where id=second_employee;
 saved:=public.update_employee_profile_with_branch(local_hr,second_employee,second_row.updated_at,'HR assigned Branch Manager','bm.hr.'||left(second_employee::text,8),'Branch Manager',true,'Karkh');
 assert saved->>'role'='Branch Manager' and saved->>'branch'='Karkh';
 select * into second_row from public.profiles where id=second_employee;
 select to_jsonb(p) into before_second from public.profiles p where id=second_employee;
 begin
  perform public.update_employee_profile_with_branch(foreign_hr,second_employee,second_row.updated_at,'Forbidden HR edit','bm.foreign.'||left(second_employee::text,8),'Branch Manager',true,'Karkh');
  raise exception using errcode='ZX001',message='Foreign-branch HR edited a Branch Manager';
 exception when insufficient_privilege then null; end;
 begin
  perform public.update_employee_profile_with_branch(local_hr,second_employee,second_row.updated_at,'Forbidden branch move','bm.move.'||left(second_employee::text,8),'Branch Manager',true,'Rasafa');
  raise exception using errcode='ZX001',message='HR reassigned an employee branch';
 exception when insufficient_privilege then null; end;
 begin
  perform public.update_employee_profile_with_branch(administrator,second_employee,second_row.updated_at,'Missing branch','bm.missing.'||left(second_employee::text,8),'Branch Manager',true,null);
  raise exception using errcode='ZX001',message='Branch Manager accepted missing branch';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.update_employee_profile_with_branch(administrator,second_employee,second_row.updated_at,'Invalid role','bm.invalid.'||left(second_employee::text,8),'Unsupported Role',true,'Karkh');
  raise exception using errcode='ZX001',message='Unsupported role accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.update_employee_profile_with_branch(administrator,second_employee,second_row.updated_at-interval '1 second','Stale role edit','bm.stale.'||left(second_employee::text,8),'Branch Manager',true,'Karkh');
  raise exception using errcode='ZX001',message='Stale employee version accepted';
 exception when serialization_failure or sqlstate 'PT409' then null; end;
 select * into hr_row from public.profiles where id=local_hr;
 begin
  perform public.update_employee_profile_with_branch(local_hr,local_hr,hr_row.updated_at,'Self role change','bm.self.'||left(local_hr::text,8),'Branch Manager',true,'Karkh');
  raise exception using errcode='ZX001',message='HR changed its own role';
 exception when insufficient_privilege then null; end;
 begin
  perform public.update_employee_profile_with_branch(local_hr,second_employee,second_row.updated_at,'Global role escalation','bm.global.'||left(second_employee::text,8),'Sales Director',true,null);
  raise exception using errcode='ZX001',message='HR assigned global access';
 exception when insufficient_privilege then null; end;
 assert (select to_jsonb(p)=before_second from public.profiles p where id=second_employee),'Rejected edits changed the employee';
 assert (select role::text='HR' and branch='Karkh' and is_active from public.profiles where id=local_hr),'Self-protection changed';
end;
$$;
rollback;
