create or replace function public.save_quotation_with_items(
  p_quotation_id uuid,
  p_project_id uuid,
  p_client_id uuid,
  p_quotation_discount_percent numeric,
  p_subtotal numeric,
  p_line_discount_total numeric,
  p_quotation_discount_total numeric,
  p_grand_total numeric,
  p_notes text,
  p_prepared_by_text text,
  p_client_representative text,
  p_created_by uuid,
  p_items jsonb
)
returns table (
  id uuid,
  quotation_number text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation_id uuid;
  v_quotation_number text;
  v_created_at timestamptz;
  v_year integer := extract(year from now())::integer;
  v_next_sequence integer;
begin
  if p_project_id is null or p_client_id is null then
    raise exception 'Project and client are required.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one quotation item is required.';
  end if;

  if p_quotation_id is null then
    select coalesce(
      max(
        nullif(
          regexp_replace(q.quotation_number, ('^Q-' || v_year || '-'), ''),
          ''
        )::integer
      ),
      0
    ) + 1
    into v_next_sequence
    from public.quotations as q
    where q.quotation_number ~ ('^Q-' || v_year || '-[0-9]+$');

    v_quotation_number := 'Q-' || v_year || '-' || lpad(v_next_sequence::text, 4, '0');

    insert into public.quotations as q (
      quotation_number,
      project_id,
      client_id,
      status,
      quotation_discount_percent,
      subtotal,
      line_discount_total,
      quotation_discount_total,
      grand_total,
      notes,
      prepared_by_text,
      client_representative,
      created_by
    )
    values (
      v_quotation_number,
      p_project_id,
      p_client_id,
      'Draft',
      coalesce(p_quotation_discount_percent, 0),
      coalesce(p_subtotal, 0),
      coalesce(p_line_discount_total, 0),
      coalesce(p_quotation_discount_total, 0),
      coalesce(p_grand_total, 0),
      p_notes,
      p_prepared_by_text,
      p_client_representative,
      p_created_by
    )
    returning q.id, q.quotation_number, q.created_at
    into v_quotation_id, v_quotation_number, v_created_at;
  else
    update public.quotations as q
    set
      project_id = p_project_id,
      client_id = p_client_id,
      quotation_discount_percent = coalesce(p_quotation_discount_percent, 0),
      subtotal = coalesce(p_subtotal, 0),
      line_discount_total = coalesce(p_line_discount_total, 0),
      quotation_discount_total = coalesce(p_quotation_discount_total, 0),
      grand_total = coalesce(p_grand_total, 0),
      notes = p_notes,
      prepared_by_text = p_prepared_by_text,
      client_representative = p_client_representative
    where q.id = p_quotation_id
    returning q.id, q.quotation_number, q.created_at
    into v_quotation_id, v_quotation_number, v_created_at;

    if v_quotation_id is null then
      raise exception 'Quotation was not found.';
    end if;

    delete from public.quotation_items as qi
    where qi.quotation_id = v_quotation_id;
  end if;

  insert into public.quotation_items (
    quotation_id,
    opening_id,
    opening_code,
    floor,
    room,
    width,
    height,
    quantity,
    product_system,
    glass_type,
    aluminum_color,
    unit_price,
    discount_percent,
    notes
  )
  select
    v_quotation_id,
    item.opening_id,
    item.opening_code,
    item.floor,
    item.room,
    item.width,
    item.height,
    item.quantity,
    item.product_system,
    item.glass_type,
    item.aluminum_color,
    item.unit_price,
    item.discount_percent,
    item.notes
  from jsonb_to_recordset(p_items) as item(
    opening_id uuid,
    opening_code text,
    floor text,
    room text,
    width numeric,
    height numeric,
    quantity integer,
    product_system text,
    glass_type text,
    aluminum_color text,
    unit_price numeric,
    discount_percent numeric,
    notes text
  );

  return query
  select v_quotation_id, v_quotation_number, v_created_at;
end;
$$;

grant execute on function public.save_quotation_with_items(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  uuid,
  jsonb
) to service_role;
