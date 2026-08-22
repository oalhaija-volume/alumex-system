with candidate_versions as (
  select distinct on (contract_row.id)
    contract_row.id as contract_id,
    version_row.id as version_id
  from public.contracts contract_row
  join public.quotation_versions version_row
    on version_row.quotation_id = contract_row.quotation_id
   and version_row.status = 'approved'
  where contract_row.quotation_version_id is null
  order by
    contract_row.id,
    version_row.version_number desc,
    version_row.created_at desc
),
available_versions as (
  select
    candidate.contract_id,
    candidate.version_id,
    row_number() over (
      partition by candidate.version_id
      order by candidate.contract_id
    ) as claim_order
  from candidate_versions candidate
  where not exists (
    select 1
    from public.contracts linked_contract
    where linked_contract.quotation_version_id = candidate.version_id
  )
)
update public.contracts contract_row
set quotation_version_id = available.version_id,
    updated_at = now()
from available_versions available
where contract_row.id = available.contract_id
  and available.claim_order = 1;
