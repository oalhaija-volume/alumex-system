begin;

-- New residential agreements use 50% at signing and 50% before installation
-- for every approved total. Commercial agreements restore the old five-stage
-- schedule, retaining its below-15-million upfront-payment exception.
-- Replace only the payment-percentage validation in the installed correction
-- function; all access, signed-document, quotation and audit guards remain.
do $payment_policy$
declare
 definition text;
 old_rule text := $old$percentages:=case when total<15000000 then array[100] when p_template='residential' then array[50,50] else array[30,20,10,20,15,5] end;$old$;
 new_rule text := $new$-- Contract payment schedules agreed on 2026-11-16.
 percentages:=case when p_template='residential' then array[50,50] when total<15000000 then array[100] else array[25,25,25,15,10] end;
 -- Supplementary details must not rewrite an existing agreement's payments.
 -- Historical exceptions are allowed only for the identical saved schedule
 -- and unchanged template. The normal loop below still validates each saved
 -- percentage and amount, including rounding and the final remainder.
 if p_template is not distinct from flow.contract->>'template'
  and p_agreement->'paymentSchedule' is not distinct from flow.contract#>'{agreement2027,paymentSchedule}' then
  if p_template='residential' and total<15000000 and jsonb_array_length(p_agreement->'paymentSchedule')=1 then
   percentages:=array[100];
  elsif p_template='commercial' and total>=15000000 and jsonb_array_length(p_agreement->'paymentSchedule')=6 then
   percentages:=array[30,20,10,20,15,5];
  end if;
 end if;$new$;
begin
 select pg_get_functiondef('public.update_agreement_contract(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure) into definition;
 if position(new_rule in definition)>0 and position(old_rule in definition)=0 then return; end if;
 if position(old_rule in definition)=0
  or (length(definition)-length(replace(definition,old_rule,'')))/length(old_rule)<>1
  or position('Contract payment schedule is invalid.' in definition)=0
  or position('insert into public.contract_template_corrections' in definition)=0 then
  raise exception 'Unexpected agreement correction function; contract payment schedules were not applied.';
 end if;
 execute replace(definition,old_rule,new_rule);
end;
$payment_policy$;

notify pgrst,'reload schema';
commit;
