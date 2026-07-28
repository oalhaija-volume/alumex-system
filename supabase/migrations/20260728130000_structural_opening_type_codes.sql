-- Structural measurements use a type-specific opening code. Product systems,
-- glass, colors, and add-on services are selected later during quotation.

with typed_openings as (
  select
    id,
    project_id,
    opening_type,
    opening_code,
    created_at,
    case opening_type
      when 'Window' then 'W'
      when 'Door' then 'D'
      when 'Curtain Wall' then 'CW'
      when 'Skylight' then 'SK'
    end as code_prefix
  from public.openings
  where opening_type in ('Window', 'Door', 'Curtain Wall', 'Skylight')
),
correct_code_maximums as (
  select
    project_id,
    opening_type,
    max(
      substring(opening_code from '([0-9]+)$')::integer
    ) as highest_code_number
  from typed_openings
  where opening_code ~ ('^' || code_prefix || '-[0-9]+$')
  group by project_id, opening_type
),
mismatched_codes as (
  select
    typed_openings.id,
    typed_openings.project_id,
    typed_openings.opening_type,
    typed_openings.code_prefix,
    row_number() over (
      partition by typed_openings.project_id, typed_openings.opening_type
      order by typed_openings.created_at, typed_openings.id
    ) as sequence_number
  from typed_openings
  where opening_code !~ ('^' || code_prefix || '-[0-9]+$')
),
corrected_codes as (
  select
    mismatched_codes.id,
    mismatched_codes.code_prefix || '-' ||
      lpad(
        (
          coalesce(correct_code_maximums.highest_code_number, 0) +
          mismatched_codes.sequence_number
        )::text,
        2,
        '0'
      ) as opening_code
  from mismatched_codes
  left join correct_code_maximums
    on correct_code_maximums.project_id = mismatched_codes.project_id
   and correct_code_maximums.opening_type = mismatched_codes.opening_type
)
update public.openings
set opening_code = corrected_codes.opening_code
from corrected_codes
where public.openings.id = corrected_codes.id;
