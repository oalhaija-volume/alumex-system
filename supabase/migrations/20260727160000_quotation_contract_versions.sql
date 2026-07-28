-- Phase 6: immutable quotation versions, approval-gated contracts, and
-- transactional handoff to operations after digital signature.

create table if not exists public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft',
  quotation_discount_percent numeric(6, 3) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  line_discount_total numeric(14, 2) not null default 0,
  quotation_discount_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  pricing_source text not null default 'catalog',
  notes text,
  prepared_by_text text,
  client_representative text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  presented_by uuid references public.profiles(id) on delete set null,
  presented_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quotation_versions_number_unique unique (quotation_id, version_number),
  constraint quotation_versions_status_check check (
    status in (
      'draft',
      'ready_for_review',
      'approved',
      'presented',
      'sent',
      'rejected',
      'superseded',
      'expired'
    )
  ),
  constraint quotation_versions_pricing_source_check check (
    pricing_source in ('catalog', 'project_costing')
  ),
  constraint quotation_versions_approval_check check (
    (status <> 'approved') or approved_at is not null
  )
);

create table if not exists public.quotation_version_items (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.quotation_versions(id) on delete restrict,
  source_quotation_item_id uuid references public.quotation_items(id) on delete set null,
  opening_id uuid references public.openings(id) on delete set null,
  opening_code text not null,
  floor text,
  room text,
  width numeric(12, 3) not null check (width >= 0),
  height numeric(12, 3) not null check (height >= 0),
  solid_panel_height numeric(12, 3) not null default 0 check (solid_panel_height >= 0),
  quantity integer not null default 1 check (quantity > 0),
  product_system text,
  glass_type text,
  aluminum_color text,
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(6, 3) not null default 0 check (
    discount_percent >= 0 and discount_percent <= 100
  ),
  line_type text not null default 'base',
  is_discountable boolean not null default true,
  notes text,
  area_sqm numeric(14, 3) not null default 0,
  gross_total numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  net_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint quotation_version_items_line_type_check check (
    line_type in ('base', 'service', 'addon', 'accessory')
  )
);

alter table public.quotation_items
  add column if not exists line_type text not null default 'base',
  add column if not exists is_discountable boolean not null default true;

update public.quotation_items
set line_type = coalesce(line_type, 'base'),
    is_discountable = coalesce(is_discountable, true);

alter table public.quotation_items
  drop constraint if exists quotation_items_line_type_check;

alter table public.quotation_items
  add constraint quotation_items_line_type_check check (
    line_type in ('base', 'service', 'addon', 'accessory')
  );

alter table public.quotations
  add column if not exists current_version_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotations_current_version_id_fkey'
  ) then
    alter table public.quotations
      add constraint quotations_current_version_id_fkey
      foreign key (current_version_id)
      references public.quotation_versions(id)
      on delete restrict;
  end if;
end;
$$;

alter table public.contracts
  add column if not exists quotation_version_id uuid
  references public.quotation_versions(id) on delete restrict;

create table if not exists public.operations_handoffs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  quotation_version_id uuid not null references public.quotation_versions(id) on delete restrict,
  status text not null default 'ready',
  package_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint operations_handoffs_contract_unique unique (contract_id),
  constraint operations_handoffs_status_check check (
    status in ('ready', 'accepted', 'returned')
  )
);

create index if not exists quotation_versions_quotation_created_idx
on public.quotation_versions (quotation_id, version_number desc);

create index if not exists quotation_versions_approved_created_idx
on public.quotation_versions (status, created_at desc)
where status = 'approved';

create index if not exists quotation_version_items_version_idx
on public.quotation_version_items (quotation_version_id);

create unique index if not exists contracts_quotation_version_unique_idx
on public.contracts (quotation_version_id)
where quotation_version_id is not null;

create index if not exists operations_handoffs_project_created_idx
on public.operations_handoffs (project_id, created_at desc);

-- Give all existing logical quotations a first immutable snapshot. Quotations
-- already used by a contract are treated as approved migration history.
insert into public.quotation_versions (
  quotation_id,
  version_number,
  status,
  quotation_discount_percent,
  subtotal,
  line_discount_total,
  quotation_discount_total,
  grand_total,
  pricing_source,
  notes,
  prepared_by_text,
  client_representative,
  created_by,
  approved_by,
  approved_at,
  created_at
)
select
  quotation.id,
  1,
  case
    when exists (
      select 1 from public.contracts contract
      where contract.quotation_id = quotation.id
    ) or quotation.status::text = 'Approved'
      then 'approved'
    when quotation.status::text = 'Sent' then 'sent'
    when quotation.status::text = 'Rejected' then 'rejected'
    when quotation.status::text = 'Expired' then 'expired'
    else 'draft'
  end,
  quotation.quotation_discount_percent,
  quotation.subtotal,
  quotation.line_discount_total,
  quotation.quotation_discount_total,
  quotation.grand_total,
  coalesce(quotation.pricing_source, 'catalog'),
  quotation.notes,
  quotation.prepared_by_text,
  quotation.client_representative,
  quotation.created_by,
  case
    when exists (
      select 1 from public.contracts contract
      where contract.quotation_id = quotation.id
    ) or quotation.status::text = 'Approved'
      then quotation.created_by
    else null
  end,
  case
    when exists (
      select 1 from public.contracts contract
      where contract.quotation_id = quotation.id
    ) or quotation.status::text = 'Approved'
      then quotation.updated_at
    else null
  end,
  quotation.created_at
from public.quotations quotation
where not exists (
  select 1
  from public.quotation_versions version
  where version.quotation_id = quotation.id
);

insert into public.quotation_version_items (
  quotation_version_id,
  source_quotation_item_id,
  opening_id,
  opening_code,
  floor,
  room,
  width,
  height,
  solid_panel_height,
  quantity,
  product_system,
  glass_type,
  aluminum_color,
  unit_price,
  discount_percent,
  line_type,
  is_discountable,
  notes,
  area_sqm,
  gross_total,
  discount_total,
  net_total,
  created_at
)
select
  version.id,
  item.id,
  item.opening_id,
  item.opening_code,
  item.floor,
  item.room,
  item.width,
  item.height,
  coalesce(item.solid_panel_height, 0),
  item.quantity,
  item.product_system,
  item.glass_type,
  item.aluminum_color,
  item.unit_price,
  item.discount_percent,
  coalesce(item.line_type, 'base'),
  coalesce(item.is_discountable, true),
  item.notes,
  case
    when coalesce(item.line_type, 'base') = 'base'
      then greatest((item.width * item.height * item.quantity) / 10000, 1)
    else greatest((item.width * item.height * item.quantity) / 10000, 0.01)
  end,
  (
    case
      when coalesce(item.line_type, 'base') = 'base'
        then greatest((item.width * item.height * item.quantity) / 10000, 1)
      else greatest((item.width * item.height * item.quantity) / 10000, 0.01)
    end
  ) * item.unit_price,
  case when coalesce(item.is_discountable, true) then (
    case
      when coalesce(item.line_type, 'base') = 'base'
        then greatest((item.width * item.height * item.quantity) / 10000, 1)
      else greatest((item.width * item.height * item.quantity) / 10000, 0.01)
    end
  ) * item.unit_price * item.discount_percent / 100 else 0 end,
  (
    case
      when coalesce(item.line_type, 'base') = 'base'
        then greatest((item.width * item.height * item.quantity) / 10000, 1)
      else greatest((item.width * item.height * item.quantity) / 10000, 0.01)
    end
  ) * item.unit_price * (
    1 - case when coalesce(item.is_discountable, true)
      then item.discount_percent / 100
      else 0
    end
  ),
  item.created_at
from public.quotation_items item
join public.quotation_versions version
  on version.quotation_id = item.quotation_id
 and version.version_number = 1
where not exists (
  select 1
  from public.quotation_version_items snapshot
  where snapshot.source_quotation_item_id = item.id
);

update public.quotations quotation
set current_version_id = version.id
from public.quotation_versions version
where version.quotation_id = quotation.id
  and version.version_number = (
    select max(latest.version_number)
    from public.quotation_versions latest
    where latest.quotation_id = quotation.id
  )
  and quotation.current_version_id is null;

update public.contracts contract
set quotation_version_id = quotation.current_version_id
from public.quotations quotation
where quotation.id = contract.quotation_id
  and contract.quotation_version_id is null;

create or replace function public.save_quotation_version_with_items(
  p_quotation_id uuid,
  p_project_id uuid,
  p_client_id uuid,
  p_quotation_discount_percent numeric,
  p_subtotal numeric,
  p_line_discount_total numeric,
  p_quotation_discount_total numeric,
  p_grand_total numeric,
  p_pricing_source text,
  p_notes text,
  p_prepared_by_text text,
  p_client_representative text,
  p_created_by uuid,
  p_items jsonb
)
returns table (
  id uuid,
  quotation_number text,
  version_id uuid,
  version_number integer,
  version_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  project_row public.projects;
  quotation_row public.quotations;
  next_version_number integer;
  new_version_id uuid;
  next_quotation_number text;
  next_sequence integer;
  quotation_created_at timestamptz;
  item jsonb;
  item_area numeric;
  item_gross numeric;
  item_discount numeric;
  normalized_line_type text;
  discountable boolean;
begin
  if auth.role() <> 'service_role' and p_created_by is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = p_created_by
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in (
      'Admin', 'Sales Manager', 'Indoor Sales', 'Sales Rep', 'Branch Manager'
    )
  then
    raise exception 'This employee cannot create commercial quotations.';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception 'At least one quotation item is required.';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id and client_id = p_client_id and archived_at is null
  for update;

  if project_row.id is null then
    raise exception 'The project and client do not match.';
  end if;

  if actor_profile.role not in ('Admin', 'Sales Manager')
    and project_row.sales_status not in (
      'ready_for_quotation',
      'quotation_in_progress',
      'quotation_ready',
      'quotation_presented',
      'quotation_sent',
      'quotation_follow_up',
      'negotiation',
      'quotation_approved'
    )
  then
    raise exception 'Approved measurements are required before quotation.';
  end if;

  if p_quotation_id is null then
    select coalesce(max(
      nullif(regexp_replace(
        quotation.quotation_number,
        '^Q-' || extract(year from now())::integer || '-',
        ''
      ), '')::integer
    ), 0) + 1
    into next_sequence
    from public.quotations quotation
    where quotation.quotation_number ~ (
      '^Q-' || extract(year from now())::integer || '-[0-9]+$'
    );

    next_quotation_number :=
      'Q-' || extract(year from now())::integer || '-' ||
      lpad(next_sequence::text, 4, '0');

    insert into public.quotations (
      quotation_number,
      project_id,
      client_id,
      status,
      quotation_discount_percent,
      subtotal,
      line_discount_total,
      quotation_discount_total,
      grand_total,
      pricing_source,
      notes,
      prepared_by_text,
      client_representative,
      created_by
    )
    values (
      next_quotation_number,
      p_project_id,
      p_client_id,
      'Draft',
      coalesce(p_quotation_discount_percent, 0),
      coalesce(p_subtotal, 0),
      coalesce(p_line_discount_total, 0),
      coalesce(p_quotation_discount_total, 0),
      coalesce(p_grand_total, 0),
      case when p_pricing_source = 'project_costing' then 'project_costing' else 'catalog' end,
      p_notes,
      p_prepared_by_text,
      p_client_representative,
      p_created_by
    )
    returning * into quotation_row;
  else
    select * into quotation_row
    from public.quotations
    where public.quotations.id = p_quotation_id
    for update;

    if quotation_row.id is null then
      raise exception 'Quotation was not found.';
    end if;

    if quotation_row.project_id <> p_project_id
      or quotation_row.client_id <> p_client_id
    then
      raise exception 'A quotation cannot be moved to another project or client.';
    end if;

    update public.quotations
    set
      status = 'Draft',
      quotation_discount_percent = coalesce(p_quotation_discount_percent, 0),
      subtotal = coalesce(p_subtotal, 0),
      line_discount_total = coalesce(p_line_discount_total, 0),
      quotation_discount_total = coalesce(p_quotation_discount_total, 0),
      grand_total = coalesce(p_grand_total, 0),
      pricing_source = case
        when p_pricing_source = 'project_costing' then 'project_costing'
        else 'catalog'
      end,
      notes = p_notes,
      prepared_by_text = p_prepared_by_text,
      client_representative = p_client_representative,
      updated_at = now()
    where public.quotations.id = p_quotation_id
    returning * into quotation_row;

    delete from public.quotation_items
    where quotation_id = quotation_row.id;
  end if;

  select coalesce(max(version.version_number), 0) + 1
  into next_version_number
  from public.quotation_versions version
  where version.quotation_id = quotation_row.id;

  update public.quotation_versions
  set status = 'superseded'
  where quotation_id = quotation_row.id
    and status in ('draft', 'ready_for_review');

  insert into public.quotation_versions (
    quotation_id,
    version_number,
    status,
    quotation_discount_percent,
    subtotal,
    line_discount_total,
    quotation_discount_total,
    grand_total,
    pricing_source,
    notes,
    prepared_by_text,
    client_representative,
    created_by
  )
  values (
    quotation_row.id,
    next_version_number,
    'draft',
    coalesce(p_quotation_discount_percent, 0),
    coalesce(p_subtotal, 0),
    coalesce(p_line_discount_total, 0),
    coalesce(p_quotation_discount_total, 0),
    coalesce(p_grand_total, 0),
    case when p_pricing_source = 'project_costing' then 'project_costing' else 'catalog' end,
    p_notes,
    p_prepared_by_text,
    p_client_representative,
    p_created_by
  )
  returning public.quotation_versions.id into new_version_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    normalized_line_type := case
      when item->>'line_type' in ('service', 'addon', 'accessory')
        then item->>'line_type'
      else 'base'
    end;
    discountable := coalesce(
      (item->>'is_discountable')::boolean,
      normalized_line_type = 'base'
    );
    item_area := case
      when normalized_line_type = 'base' then greatest(
        coalesce((item->>'width')::numeric, 0)
        * coalesce((item->>'height')::numeric, 0)
        * coalesce((item->>'quantity')::integer, 1) / 10000,
        1
      )
      else greatest(
        coalesce((item->>'width')::numeric, 0)
        * coalesce((item->>'height')::numeric, 0)
        * coalesce((item->>'quantity')::integer, 1) / 10000,
        0.01
      )
    end;
    item_gross := item_area * coalesce((item->>'unit_price')::numeric, 0);
    item_discount := case when discountable then
      item_gross * coalesce((item->>'discount_percent')::numeric, 0) / 100
    else 0 end;

    insert into public.quotation_items (
      quotation_id,
      opening_id,
      opening_code,
      floor,
      room,
      width,
      height,
      solid_panel_height,
      quantity,
      product_system,
      glass_type,
      aluminum_color,
      unit_price,
      discount_percent,
      line_type,
      is_discountable,
      notes
    )
    values (
      quotation_row.id,
      nullif(item->>'opening_id', '')::uuid,
      item->>'opening_code',
      nullif(item->>'floor', ''),
      nullif(item->>'room', ''),
      coalesce((item->>'width')::numeric, 0),
      coalesce((item->>'height')::numeric, 0),
      coalesce((item->>'solid_panel_height')::numeric, 0),
      coalesce((item->>'quantity')::integer, 1),
      nullif(item->>'product_system', ''),
      nullif(item->>'glass_type', ''),
      nullif(item->>'aluminum_color', ''),
      coalesce((item->>'unit_price')::numeric, 0),
      case when discountable
        then coalesce((item->>'discount_percent')::numeric, 0)
        else 0
      end,
      normalized_line_type,
      discountable,
      nullif(item->>'notes', '')
    );

    insert into public.quotation_version_items (
      quotation_version_id,
      opening_id,
      opening_code,
      floor,
      room,
      width,
      height,
      solid_panel_height,
      quantity,
      product_system,
      glass_type,
      aluminum_color,
      unit_price,
      discount_percent,
      line_type,
      is_discountable,
      notes,
      area_sqm,
      gross_total,
      discount_total,
      net_total
    )
    values (
      new_version_id,
      nullif(item->>'opening_id', '')::uuid,
      item->>'opening_code',
      nullif(item->>'floor', ''),
      nullif(item->>'room', ''),
      coalesce((item->>'width')::numeric, 0),
      coalesce((item->>'height')::numeric, 0),
      coalesce((item->>'solid_panel_height')::numeric, 0),
      coalesce((item->>'quantity')::integer, 1),
      nullif(item->>'product_system', ''),
      nullif(item->>'glass_type', ''),
      nullif(item->>'aluminum_color', ''),
      coalesce((item->>'unit_price')::numeric, 0),
      case when discountable
        then coalesce((item->>'discount_percent')::numeric, 0)
        else 0
      end,
      normalized_line_type,
      discountable,
      nullif(item->>'notes', ''),
      item_area,
      item_gross,
      item_discount,
      item_gross - item_discount
    );
  end loop;

  update public.quotations
  set current_version_id = new_version_id
  where public.quotations.id = quotation_row.id;

  if project_row.sales_status = 'ready_for_quotation' then
    update public.projects
    set sales_status = 'quotation_in_progress',
        last_updated_by = p_created_by,
        updated_at = now()
    where public.projects.id = project_row.id;

    insert into public.project_status_history (
      project_id, previous_status, new_status, changed_by, changed_by_role
    )
    values (
      project_row.id, project_row.sales_status, 'quotation_in_progress',
      p_created_by, actor_profile.role
    );
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id, new_value
  )
  values (
    p_created_by,
    actor_profile.role,
    'quotation_version_created',
    'quotation_version',
    new_version_id,
    jsonb_build_object(
      'quotation_id', quotation_row.id,
      'version_number', next_version_number,
      'grand_total', p_grand_total
    )
  );

  return query
  select
    quotation_row.id,
    quotation_row.quotation_number,
    new_version_id,
    next_version_number,
    'draft'::text,
    quotation_row.created_at;
end;
$$;

create or replace function public.transition_quotation_version(
  target_version_id uuid,
  transition_action text,
  actor_user_id uuid default auth.uid()
)
returns public.quotation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  version_row public.quotation_versions;
  quotation_row public.quotations;
  project_row public.projects;
  next_version_status text;
  next_project_status text;
  interval_days integer := 5;
begin
  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in (
      'Admin', 'Sales Manager', 'Indoor Sales', 'Sales Rep', 'Branch Manager'
    )
  then
    raise exception 'This employee cannot update quotation workflow.';
  end if;

  select * into version_row
  from public.quotation_versions
  where id = target_version_id
  for update;

  if version_row.id is null then
    raise exception 'Quotation version was not found.';
  end if;

  select * into quotation_row
  from public.quotations
  where id = version_row.quotation_id;

  select * into project_row
  from public.projects
  where id = quotation_row.project_id
  for update;

  if transition_action = 'mark_ready' then
    if version_row.status <> 'draft' then
      raise exception 'Only a draft quotation can be marked ready.';
    end if;
    next_version_status := 'ready_for_review';
    next_project_status := 'quotation_ready';
  elsif transition_action = 'present' then
    if version_row.status <> 'ready_for_review' then
      raise exception 'The quotation must be ready before presentation.';
    end if;
    next_version_status := 'presented';
    next_project_status := 'quotation_presented';
  elsif transition_action = 'send' then
    if version_row.status not in ('ready_for_review', 'presented') then
      raise exception 'The quotation must be ready before sending.';
    end if;
    next_version_status := 'sent';
    next_project_status := 'quotation_sent';
  elsif transition_action = 'approve' then
    if actor_profile.role not in ('Admin', 'Sales Manager', 'Indoor Sales') then
      raise exception 'Only sales management or indoor sales can approve a quotation.';
    end if;
    if version_row.status not in ('draft', 'ready_for_review', 'presented', 'sent') then
      raise exception 'This quotation version cannot be approved.';
    end if;
    next_version_status := 'approved';
    next_project_status := 'quotation_approved';
  elsif transition_action = 'record_print' then
    insert into public.follow_up_activities (
      follow_up_task_id,
      client_id,
      project_id,
      employee_id,
      employee_role,
      method,
      internal_notes
    )
    values (
      null,
      quotation_row.client_id,
      quotation_row.project_id,
      actor_user_id,
      actor_profile.role,
      'quotation_printed',
      quotation_row.quotation_number || ' v' || version_row.version_number
    );

    insert into public.audit_events (
      actor_id, actor_role, action, entity_type, entity_id, new_value
    )
    values (
      actor_user_id, actor_profile.role, 'quotation_printed',
      'quotation_version', version_row.id,
      jsonb_build_object('version_number', version_row.version_number)
    );
    return version_row;
  else
    raise exception 'Select a valid quotation action.';
  end if;

  update public.quotation_versions
  set
    status = next_version_status,
    approved_by = case when transition_action = 'approve' then actor_user_id else approved_by end,
    approved_at = case when transition_action = 'approve' then now() else approved_at end,
    presented_by = case when transition_action = 'present' then actor_user_id else presented_by end,
    presented_at = case when transition_action = 'present' then now() else presented_at end,
    sent_by = case when transition_action = 'send' then actor_user_id else sent_by end,
    sent_at = case when transition_action = 'send' then now() else sent_at end
  where id = version_row.id
  returning * into version_row;

  update public.quotations
  set
    status = case
      when next_version_status = 'approved' then 'Approved'::public.quotation_status
      when next_version_status in ('sent', 'presented') then 'Sent'::public.quotation_status
      else 'Draft'::public.quotation_status
    end,
    updated_at = now()
  where id = quotation_row.id;

  if project_row.sales_status is distinct from next_project_status then
    update public.projects
    set
      sales_status = next_project_status,
      last_updated_by = actor_user_id,
      updated_at = now()
    where id = project_row.id;

    insert into public.project_status_history (
      project_id, previous_status, new_status, changed_by, changed_by_role
    )
    values (
      project_row.id, project_row.sales_status, next_project_status,
      actor_user_id, actor_profile.role
    );
  end if;

  if transition_action in ('present', 'send') then
    select coalesce((setting_value #>> '{}')::integer, 5)
    into interval_days
    from public.workflow_settings
    where setting_key = 'quotation_follow_up_interval_days';

    update public.follow_up_tasks
    set
      status = 'cancelled',
      updated_at = now()
    where quotation_id = quotation_row.id
      and task_type = 'quotation'
      and status = 'open';

    insert into public.follow_up_tasks (
      client_id,
      project_id,
      quotation_id,
      task_type,
      owner_id,
      assigned_to,
      due_at,
      reminder_at,
      interval_source,
      deduplication_key,
      created_by
    )
    values (
      quotation_row.client_id,
      quotation_row.project_id,
      quotation_row.id,
      'quotation',
      actor_user_id,
      coalesce(project_row.responsible_user_id, actor_user_id),
      now() + make_interval(days => interval_days),
      now() + make_interval(days => greatest(interval_days - 1, 0)),
      'quotation_default',
      'quotation-version:' || version_row.id::text,
      actor_user_id
    )
    on conflict (deduplication_key) where status = 'open' and deduplication_key is not null
    do nothing;

    insert into public.follow_up_activities (
      follow_up_task_id,
      client_id,
      project_id,
      employee_id,
      employee_role,
      method,
      internal_notes
    )
    values (
      null,
      quotation_row.client_id,
      quotation_row.project_id,
      actor_user_id,
      actor_profile.role,
      case when transition_action = 'send' then 'quotation_sent' else 'client_visit' end,
      quotation_row.quotation_number || ' v' || version_row.version_number
    );
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id, new_value
  )
  values (
    actor_user_id,
    actor_profile.role,
    'quotation_' || transition_action,
    'quotation_version',
    version_row.id,
    jsonb_build_object(
      'status', version_row.status,
      'version_number', version_row.version_number
    )
  );

  return version_row;
end;
$$;

create or replace function public.validate_contract_quotation_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  version_row public.quotation_versions;
  quotation_row public.quotations;
begin
  if new.quotation_version_id is null then
    raise exception 'An approved quotation version is required.';
  end if;

  select * into version_row
  from public.quotation_versions
  where id = new.quotation_version_id;

  if version_row.id is null or version_row.status <> 'approved' then
    raise exception 'Only an approved quotation version can create a contract.';
  end if;

  select * into quotation_row
  from public.quotations
  where id = version_row.quotation_id;

  if quotation_row.id is null
    or quotation_row.id is distinct from new.quotation_id
    or quotation_row.project_id is distinct from new.project_id
    or quotation_row.client_id is distinct from new.client_id
  then
    raise exception 'Contract source does not match the approved quotation version.';
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_validate_quotation_version
on public.contracts;
create trigger contracts_validate_quotation_version
before insert or update of quotation_id, quotation_version_id, project_id, client_id
on public.contracts
for each row execute function public.validate_contract_quotation_version();

create or replace function public.record_approved_version_contract_creation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_role public.app_role;
  previous_project_status text;
begin
  select role into actor_role
  from public.profiles
  where id = new.created_by;

  select sales_status into previous_project_status
  from public.projects
  where id = new.project_id
  for update;

  update public.projects
  set
    sales_status = 'contract_generated',
    last_updated_by = new.created_by,
    updated_at = now()
  where id = new.project_id;

  if previous_project_status is distinct from 'contract_generated' then
    insert into public.project_status_history (
      project_id, previous_status, new_status, changed_by, changed_by_role
    )
    values (
      new.project_id,
      previous_project_status,
      'contract_generated',
      new.created_by,
      actor_role
    );
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id, new_value
  )
  values (
    new.created_by,
    actor_role,
    'contract_created_from_approved_quotation_version',
    'contract',
    new.id,
    jsonb_build_object(
      'quotation_id', new.quotation_id,
      'quotation_version_id', new.quotation_version_id,
      'contract_number', new.contract_number
    )
  );

  return new;
end;
$$;

drop trigger if exists contracts_record_approved_version_creation
on public.contracts;
create trigger contracts_record_approved_version_creation
after insert
on public.contracts
for each row execute function public.record_approved_version_contract_creation();

create or replace function public.sign_contract_and_create_handoff(
  target_contract_id uuid,
  client_signature text,
  client_name text,
  client_signature_at timestamptz,
  sales_signature text,
  sales_name text,
  sales_signature_at timestamptz,
  actor_user_id uuid default auth.uid()
)
returns table (
  contract_id uuid,
  handoff_id uuid,
  handoff_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  contract_row public.contracts;
  version_row public.quotation_versions;
  project_row public.projects;
  handoff_row public.operations_handoffs;
begin
  if auth.role() <> 'service_role' and actor_user_id is distinct from auth.uid() then
    raise exception 'The actor does not match the authenticated user.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_user_id
    and is_active = true
    and coalesce(status, 'Active') <> 'Inactive';

  if actor_profile.id is null
    or actor_profile.role not in (
      'Admin', 'Sales Manager', 'Indoor Sales', 'Sales Rep'
    )
  then
    raise exception 'This employee cannot sign a sales contract.';
  end if;

  if nullif(trim(client_signature), '') is null
    or nullif(trim(sales_signature), '') is null
  then
    raise exception 'Client and sales signatures are required.';
  end if;

  select * into contract_row
  from public.contracts
  where id = target_contract_id
  for update;

  if contract_row.id is null then
    raise exception 'Contract was not found.';
  end if;

  select * into version_row
  from public.quotation_versions
  where id = contract_row.quotation_version_id;

  if version_row.id is null or version_row.status <> 'approved' then
    raise exception 'The contract must reference an approved quotation version.';
  end if;

  select * into project_row
  from public.projects
  where id = contract_row.project_id
  for update;

  update public.contracts
  set
    client_signature_data_url = client_signature,
    client_signed_name = nullif(trim(client_name), ''),
    client_signed_at = coalesce(client_signature_at, now()),
    sales_signature_data_url = sales_signature,
    sales_signed_name = nullif(trim(sales_name), ''),
    sales_signed_at = coalesce(sales_signature_at, now()),
    signed_by_sales_user_id = actor_user_id,
    signed_at = current_date,
    status = 'Active',
    updated_at = now()
  where id = contract_row.id;

  insert into public.operations_handoffs (
    project_id,
    contract_id,
    quotation_version_id,
    status,
    package_snapshot,
    created_by
  )
  values (
    contract_row.project_id,
    contract_row.id,
    version_row.id,
    'ready',
    jsonb_build_object(
      'contract_number', contract_row.contract_number,
      'contract_value', contract_row.contract_value,
      'quotation_id', version_row.quotation_id,
      'quotation_version', version_row.version_number,
      'client_signed_at', coalesce(client_signature_at, now()),
      'sales_signed_at', coalesce(sales_signature_at, now())
    ),
    actor_user_id
  )
  on conflict (contract_id) do update
  set package_snapshot = excluded.package_snapshot
  returning * into handoff_row;

  if project_row.sales_status is distinct from 'transferred_to_operations' then
    update public.projects
    set
      sales_status = 'transferred_to_operations',
      workflow_status = 'finance_down_payment_pending',
      responsible_department = 'operations',
      last_updated_by = actor_user_id,
      updated_at = now()
    where id = project_row.id;

    insert into public.project_status_history (
      project_id, previous_status, new_status, changed_by, changed_by_role
    )
    values (
      project_row.id,
      project_row.sales_status,
      'transferred_to_operations',
      actor_user_id,
      actor_profile.role
    );
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id, new_value
  )
  values (
    actor_user_id,
    actor_profile.role,
    'contract_signed_operations_handoff_created',
    'contract',
    contract_row.id,
    jsonb_build_object(
      'handoff_id', handoff_row.id,
      'quotation_version_id', version_row.id
    )
  );

  return query
  select contract_row.id, handoff_row.id, handoff_row.status;
end;
$$;

alter table public.quotation_versions enable row level security;
alter table public.quotation_version_items enable row level security;
alter table public.operations_handoffs enable row level security;

drop policy if exists "quotation_versions_read_project"
on public.quotation_versions;
create policy "quotation_versions_read_project"
on public.quotation_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.quotations quotation
    where quotation.id = quotation_id
      and public.can_view_sales_project(quotation.project_id)
  )
);

drop policy if exists "quotation_version_items_read_project"
on public.quotation_version_items;
create policy "quotation_version_items_read_project"
on public.quotation_version_items
for select
to authenticated
using (
  exists (
    select 1
    from public.quotation_versions version
    join public.quotations quotation on quotation.id = version.quotation_id
    where version.id = quotation_version_id
      and public.can_view_sales_project(quotation.project_id)
  )
);

drop policy if exists "operations_handoffs_read_project"
on public.operations_handoffs;
create policy "operations_handoffs_read_project"
on public.operations_handoffs
for select
to authenticated
using (public.can_view_sales_project(project_id));

grant select on public.quotation_versions to authenticated;
grant select on public.quotation_version_items to authenticated;
grant select on public.operations_handoffs to authenticated;

grant all on public.quotation_versions to service_role;
grant all on public.quotation_version_items to service_role;
grant all on public.operations_handoffs to service_role;

revoke all on function public.save_quotation_version_with_items(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text,
  text, text, text, uuid, jsonb
) from public;
grant execute on function public.save_quotation_version_with_items(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text,
  text, text, text, uuid, jsonb
) to service_role;

revoke all on function public.transition_quotation_version(uuid, text, uuid)
from public;
grant execute on function public.transition_quotation_version(uuid, text, uuid)
to service_role;

revoke all on function public.sign_contract_and_create_handoff(
  uuid, text, text, timestamptz, text, text, timestamptz, uuid
) from public;
grant execute on function public.sign_contract_and_create_handoff(
  uuid, text, text, timestamptz, text, text, timestamptz, uuid
) to service_role;
