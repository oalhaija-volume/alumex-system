select
  regexp_replace(coalesce(mobile, ''), '\D', '', 'g') as normalized_mobile,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'client_name', client_name,
      'mobile', mobile,
      'email', email
    )
    order by created_at
  ) as rows
from public.clients
where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') is not null
group by regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
having count(*) > 1;

select
  lower(trim(coalesce(email, ''))) as normalized_email,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'client_name', client_name,
      'mobile', mobile,
      'email', email
    )
    order by created_at
  ) as rows
from public.clients
where nullif(lower(trim(coalesce(email, ''))), '') is not null
group by lower(trim(coalesce(email, '')))
having count(*) > 1;

select
  lower(trim(project_number)) as normalized_project_number,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'project_number', project_number,
      'project_name', project_name,
      'client_id', client_id
    )
    order by created_at
  ) as rows
from public.projects
group by lower(trim(project_number))
having count(*) > 1;

select
  lower(trim(quotation_number)) as normalized_quotation_number,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'quotation_number', quotation_number,
      'project_id', project_id,
      'client_id', client_id
    )
    order by created_at
  ) as rows
from public.quotations
group by lower(trim(quotation_number))
having count(*) > 1;

select
  lower(trim(contract_number)) as normalized_contract_number,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'contract_number', contract_number,
      'project_id', project_id,
      'client_id', client_id
    )
    order by created_at
  ) as rows
from public.contracts
group by lower(trim(contract_number))
having count(*) > 1;
